import { workflow, Step } from '@mastra/core';
import { z } from 'zod';
import { cloudVisionClient } from '../../lib/cloud-vision-client.js';
import { extractDimensions, extractEquipmentLabels } from '../../lib/utils.js';
import { db, extractionResults } from '../../db/index.js';

/**
 * Google Cloud Vision OCR Workflow
 * Extracts text and data from construction drawings using Cloud Vision API
 */
export const cloudVisionWorkflow = workflow('cloud-vision-ocr')
  .step(Step.recognize('extract-text-with-cloud-vision', {
    inputSchema: z.object({
      imagePath: z.string(),
      drawingId: z.string(),
    }),
    execute: async ({ context }) => {
      const startTime = Date.now();

      // Extract text using Cloud Vision
      const result = await cloudVisionClient.extractText(context.imagePath);
      const boundingBoxes = await cloudVisionClient.extractTextWithBoundingBoxes(context.imagePath);

      const processingTime = Date.now() - startTime;
      const estimatedCost = cloudVisionClient.estimateCost(1);

      return {
        rawText: result.text,
        boundingBoxes,
        processingTimeMs: processingTime,
        apiCost: estimatedCost,
      };
    },
  }))
  .step(Step.recognize('extract-dimensions', {
    inputSchema: z.object({
      rawText: z.string(),
    }),
    execute: async ({ context }) => {
      const dimensions = extractDimensions(context.rawText);

      return {
        dimensions: dimensions.map((dim) => ({
          value: dim.value,
          numbers: dim.numbers,
          unit: dim.unit,
          type: 'extracted',
        })),
      };
    },
  }))
  .step(Step.recognize('extract-equipment', {
    inputSchema: z.object({
      rawText: z.string(),
    }),
    execute: async ({ context }) => {
      const equipment = extractEquipmentLabels(context.rawText);

      return {
        equipment: equipment.map((eq) => ({
          name: eq.term,
          spec: eq.spec,
        })),
      };
    },
  }))
  .step(Step.recognize('save-results', {
    inputSchema: z.object({
      drawingId: z.string(),
      rawText: z.string(),
      dimensions: z.array(z.any()),
      equipment: z.array(z.any()),
      boundingBoxes: z.array(z.any()),
      processingTimeMs: z.number(),
      apiCost: z.number(),
    }),
    execute: async ({ context }) => {
      // Save to database
      const [result] = await db
        .insert(extractionResults)
        .values({
          drawingId: context.drawingId,
          tool: 'cloud-vision',
          rawText: context.rawText,
          extractedData: {
            dimensions: context.dimensions,
            equipment: context.equipment,
          },
          boundingBoxes: context.boundingBoxes,
          processingTimeMs: context.processingTimeMs,
          apiCost: context.apiCost,
        })
        .returning();

      return {
        success: true,
        extractionResultId: result.id,
        tool: 'cloud-vision',
      };
    },
  }));
