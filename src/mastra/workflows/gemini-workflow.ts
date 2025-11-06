import { workflow, Step } from '@mastra/core';
import { z } from 'zod';
import { geminiClient } from '../../lib/gemini-client.js';
import { db, extractionResults } from '../../db/index.js';

/**
 * Google Gemini Multimodal Workflow
 * Extracts structured data from construction drawings using Gemini's vision capabilities
 */
export const geminiWorkflow = workflow('gemini-multimodal')
  .step(Step.recognize('extract-with-gemini', {
    inputSchema: z.object({
      imagePath: z.string(),
      drawingId: z.string(),
    }),
    execute: async ({ context }) => {
      const startTime = Date.now();

      // Extract data using Gemini
      const extractedData = await geminiClient.extractDrawingData(context.imagePath);

      const processingTime = Date.now() - startTime;
      const estimatedCost = geminiClient.estimateCost(1);

      return {
        extractedData,
        processingTimeMs: processingTime,
        apiCost: estimatedCost,
      };
    },
  }))
  .step(Step.recognize('validate-extracted-data', {
    inputSchema: z.object({
      extractedData: z.object({
        dimensions: z.array(z.any()).optional(),
        equipment: z.array(z.any()).optional(),
        areas: z.array(z.any()).optional(),
        distances: z.array(z.any()).optional(),
      }),
    }),
    execute: async ({ context }) => {
      // Validate equipment against known construction terms
      const validEquipmentTypes = [
        'タワークレーン',
        'ラフタークレーン',
        'クローラクレーン',
        '仮囲い',
        '資材置場',
        '事務所棟',
        'ゲート',
        '安全柵',
        '足場',
        'ダンプ',
        'トラック',
        'バックホー',
        'ショベル',
        'ポンプ車',
      ];

      const equipment = (context.extractedData.equipment || []).map((eq: any) => ({
        ...eq,
        isValid: validEquipmentTypes.some((type) => eq.name?.includes(type)),
        confidence: eq.confidence || 0.9, // Gemini doesn't provide confidence, so use default
      }));

      return {
        validatedData: {
          ...context.extractedData,
          equipment,
        },
      };
    },
  }))
  .step(Step.recognize('save-results', {
    inputSchema: z.object({
      drawingId: z.string(),
      validatedData: z.object({
        dimensions: z.array(z.any()).optional(),
        equipment: z.array(z.any()).optional(),
        areas: z.array(z.any()).optional(),
        distances: z.array(z.any()).optional(),
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
          tool: 'gemini-2.0-flash',
          extractedData: context.validatedData,
          processingTimeMs: context.processingTimeMs,
          apiCost: context.apiCost,
        })
        .returning();

      return {
        success: true,
        extractionResultId: result.id,
        tool: 'gemini-2.0-flash',
      };
    },
  }));
