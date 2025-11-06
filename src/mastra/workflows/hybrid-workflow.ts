import { workflow, Step } from '@mastra/core';
import { z } from 'zod';
import { cloudVisionClient } from '../../lib/cloud-vision-client.js';
import { geminiClient } from '../../lib/gemini-client.js';
import { deduplicateByValue, calculateSimilarity } from '../../lib/utils.js';
import { db, extractionResults } from '../../db/index.js';

/**
 * Hybrid Workflow
 * Combines Cloud Vision OCR with Gemini multimodal analysis for best results
 */
export const hybridWorkflow = workflow('hybrid-comparison')
  .step(Step.recognize('parallel-extraction', {
    inputSchema: z.object({
      imagePath: z.string(),
      drawingId: z.string(),
    }),
    execute: async ({ context }) => {
      const startTime = Date.now();

      // Run both extractions in parallel
      const [cloudVisionResult, geminiResult] = await Promise.all([
        cloudVisionClient.extractText(context.imagePath),
        geminiClient.extractDrawingData(context.imagePath),
      ]);

      const processingTime = Date.now() - startTime;
      const totalCost =
        cloudVisionClient.estimateCost(1) + geminiClient.estimateCost(1);

      return {
        cloudVisionText: cloudVisionResult.text,
        geminiData: geminiResult,
        processingTimeMs: processingTime,
        apiCost: totalCost,
      };
    },
  }))
  .step(Step.recognize('merge-results', {
    inputSchema: z.object({
      cloudVisionText: z.string(),
      geminiData: z.object({
        dimensions: z.array(z.any()).optional(),
        equipment: z.array(z.any()).optional(),
        areas: z.array(z.any()).optional(),
        distances: z.array(z.any()).optional(),
      }),
    }),
    execute: async ({ context }) => {
      // Import utility functions
      const { extractDimensions, extractEquipmentLabels } = await import(
        '../../lib/utils.js'
      );

      // Extract from Cloud Vision text
      const cvDimensions = extractDimensions(context.cloudVisionText);
      const cvEquipment = extractEquipmentLabels(context.cloudVisionText);

      // Merge dimensions from both sources
      const allDimensions = [
        ...cvDimensions.map((d) => ({
          value: d.value,
          source: 'cloud-vision',
          confidence: 0.8,
        })),
        ...(context.geminiData.dimensions || []).map((d: any) => ({
          value: d.value,
          source: 'gemini',
          location: d.location,
          element: d.element,
          type: d.type,
          confidence: 0.9,
        })),
      ];

      // Deduplicate dimensions
      const uniqueDimensions = deduplicateByValue(allDimensions, 0.85);

      // Add confidence boost for dimensions found by both tools
      const boostedDimensions = uniqueDimensions.map((dim) => {
        const foundInBoth =
          cvDimensions.some((cv) => calculateSimilarity(cv.value, dim.value) > 0.85) &&
          context.geminiData.dimensions?.some(
            (g: any) => calculateSimilarity(g.value, dim.value) > 0.85
          );

        return {
          ...dim,
          confidence: foundInBoth ? 0.95 : dim.confidence,
          agreementLevel: foundInBoth ? 'high' : 'single-source',
        };
      });

      // Merge equipment from both sources
      const allEquipment = [
        ...cvEquipment.map((e) => ({
          name: e.term,
          spec: e.spec,
          source: 'cloud-vision',
          confidence: 0.7,
        })),
        ...(context.geminiData.equipment || []).map((e: any) => ({
          name: e.name,
          spec: e.spec,
          position: e.position,
          source: 'gemini',
          confidence: 0.9,
        })),
      ];

      // Deduplicate equipment by name
      const uniqueEquipment: any[] = [];
      for (const eq of allEquipment) {
        const isDuplicate = uniqueEquipment.some(
          (existing) => calculateSimilarity(existing.name, eq.name) >= 0.7
        );

        if (!isDuplicate) {
          uniqueEquipment.push(eq);
        } else {
          // If duplicate, boost confidence and merge data
          const existingIndex = uniqueEquipment.findIndex(
            (existing) => calculateSimilarity(existing.name, eq.name) >= 0.7
          );
          if (existingIndex !== -1) {
            uniqueEquipment[existingIndex].confidence = 0.95;
            uniqueEquipment[existingIndex].agreementLevel = 'high';
            // Prefer Gemini's position data if available
            if (eq.position && !uniqueEquipment[existingIndex].position) {
              uniqueEquipment[existingIndex].position = eq.position;
            }
          }
        }
      }

      return {
        mergedData: {
          dimensions: boostedDimensions,
          equipment: uniqueEquipment,
          areas: context.geminiData.areas || [],
          distances: context.geminiData.distances || [],
        },
      };
    },
  }))
  .step(Step.recognize('calculate-agreement', {
    inputSchema: z.object({
      mergedData: z.object({
        dimensions: z.array(z.any()),
        equipment: z.array(z.any()),
        areas: z.array(z.any()).optional(),
        distances: z.array(z.any()).optional(),
      }),
    }),
    execute: async ({ context }) => {
      const dimensionsWithHighAgreement = context.mergedData.dimensions.filter(
        (d: any) => d.agreementLevel === 'high'
      );

      const equipmentWithHighAgreement = context.mergedData.equipment.filter(
        (e: any) => e.agreementLevel === 'high'
      );

      const totalDimensions = context.mergedData.dimensions.length;
      const totalEquipment = context.mergedData.equipment.length;

      const dimensionAgreementRate =
        totalDimensions > 0 ? dimensionsWithHighAgreement.length / totalDimensions : 0;

      const equipmentAgreementRate =
        totalEquipment > 0 ? equipmentWithHighAgreement.length / totalEquipment : 0;

      const overallAgreement =
        (dimensionAgreementRate + equipmentAgreementRate) / 2;

      return {
        agreement: {
          dimensionsAgreed: dimensionsWithHighAgreement.length,
          equipmentAgreed: equipmentWithHighAgreement.length,
          totalAgreement: Math.round(overallAgreement * 100),
        },
      };
    },
  }))
  .step(Step.recognize('save-results', {
    inputSchema: z.object({
      drawingId: z.string(),
      mergedData: z.object({
        dimensions: z.array(z.any()),
        equipment: z.array(z.any()),
        areas: z.array(z.any()).optional(),
        distances: z.array(z.any()).optional(),
      }),
      agreement: z.object({
        dimensionsAgreed: z.number(),
        equipmentAgreed: z.number(),
        totalAgreement: z.number(),
      }),
      processingTimeMs: z.number(),
      apiCost: z.number(),
    }),
    execute: async ({ context }) => {
      // Save to database
      const [result] = await db
        .insert(extractionResults)
        .values({
          drawingId: context.drawingId,
          tool: 'hybrid',
          extractedData: context.mergedData,
          processingTimeMs: context.processingTimeMs,
          apiCost: context.apiCost,
        })
        .returning();

      return {
        success: true,
        extractionResultId: result.id,
        tool: 'hybrid',
        agreement: context.agreement,
      };
    },
  }));
