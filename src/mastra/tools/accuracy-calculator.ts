import { createTool } from '@mastra/core';
import { z } from 'zod';
import { calculateMetrics, calculateSimilarity } from '../../lib/utils.js';

/**
 * Tool to calculate accuracy metrics by comparing extracted data with ground truth
 */
export const accuracyCalculatorTool = createTool({
  id: 'accuracy-calculator',
  description: 'Calculate accuracy metrics by comparing extraction results with ground truth',
  inputSchema: z.object({
    extractedData: z.object({
      dimensions: z
        .array(
          z.object({
            value: z.string(),
            location: z.string().optional(),
            element: z.string().optional(),
            type: z.string().optional(),
            confidence: z.number().optional(),
          })
        )
        .optional(),
      equipment: z
        .array(
          z.object({
            name: z.string(),
            spec: z.string().optional(),
            position: z.object({ x: z.number(), y: z.number() }).optional(),
            confidence: z.number().optional(),
          })
        )
        .optional(),
      areas: z
        .array(
          z.object({
            name: z.string(),
            size: z.string().optional(),
            confidence: z.number().optional(),
          })
        )
        .optional(),
    }),
    groundTruth: z.object({
      dimensions: z.array(
        z.object({
          value: z.string(),
          x: z.number().optional(),
          y: z.number().optional(),
          element: z.string().optional(),
          type: z.string().optional(),
        })
      ),
      equipment: z.array(
        z.object({
          name: z.string(),
          spec: z.string().optional(),
          x: z.number().optional(),
          y: z.number().optional(),
        })
      ),
      areas: z.array(
        z.object({
          name: z.string(),
          width: z.string().optional(),
          depth: z.string().optional(),
          size: z.string().optional(),
        })
      ),
    }),
  }),
  outputSchema: z.object({
    dimensionMetrics: z.object({
      found: z.number(),
      correct: z.number(),
      total: z.number(),
      recall: z.number(),
      precision: z.number(),
      f1Score: z.number(),
    }),
    equipmentMetrics: z.object({
      found: z.number(),
      correct: z.number(),
      total: z.number(),
      recall: z.number(),
      precision: z.number(),
      f1Score: z.number(),
    }),
    areaMetrics: z.object({
      found: z.number(),
      correct: z.number(),
      total: z.number(),
      recall: z.number(),
      precision: z.number(),
    }),
    avgConfidenceScore: z.number(),
    breakdown: z.object({
      dimensionErrors: z.array(z.string()),
      equipmentErrors: z.array(z.string()),
      areaErrors: z.array(z.string()),
      falsePositives: z.array(z.string()),
      falseNegatives: z.array(z.string()),
    }),
  }),
  execute: async ({ context }) => {
    const { extractedData, groundTruth } = context;

    // Calculate dimension metrics
    const extractedDimensions = extractedData.dimensions || [];
    const groundTruthDimensions = groundTruth.dimensions || [];

    let correctDimensions = 0;
    const dimensionErrors: string[] = [];
    const falseNegatives: string[] = [];

    for (const gtDim of groundTruthDimensions) {
      const found = extractedDimensions.find(
        (exDim) => calculateSimilarity(exDim.value, gtDim.value) >= 0.8
      );

      if (found) {
        correctDimensions++;
      } else {
        falseNegatives.push(`Missing dimension: ${gtDim.value}`);
        dimensionErrors.push(`Failed to extract: ${gtDim.value}`);
      }
    }

    const falsePositiveDimensions = extractedDimensions.filter(
      (exDim) =>
        !groundTruthDimensions.some(
          (gtDim) => calculateSimilarity(exDim.value, gtDim.value) >= 0.8
        )
    );

    const dimensionMetrics = calculateMetrics({
      found: extractedDimensions.length,
      correct: correctDimensions,
      total: groundTruthDimensions.length,
    });

    // Calculate equipment metrics
    const extractedEquipment = extractedData.equipment || [];
    const groundTruthEquipment = groundTruth.equipment || [];

    let correctEquipment = 0;
    const equipmentErrors: string[] = [];

    for (const gtEq of groundTruthEquipment) {
      const found = extractedEquipment.find(
        (exEq) => calculateSimilarity(exEq.name, gtEq.name) >= 0.7
      );

      if (found) {
        correctEquipment++;
      } else {
        falseNegatives.push(`Missing equipment: ${gtEq.name}`);
        equipmentErrors.push(`Failed to extract: ${gtEq.name}`);
      }
    }

    const falsePositiveEquipment = extractedEquipment.filter(
      (exEq) =>
        !groundTruthEquipment.some(
          (gtEq) => calculateSimilarity(exEq.name, gtEq.name) >= 0.7
        )
    );

    const equipmentMetrics = calculateMetrics({
      found: extractedEquipment.length,
      correct: correctEquipment,
      total: groundTruthEquipment.length,
    });

    // Calculate area metrics
    const extractedAreas = extractedData.areas || [];
    const groundTruthAreas = groundTruth.areas || [];

    let correctAreas = 0;
    const areaErrors: string[] = [];

    for (const gtArea of groundTruthAreas) {
      const found = extractedAreas.find(
        (exArea) => calculateSimilarity(exArea.name, gtArea.name) >= 0.7
      );

      if (found) {
        correctAreas++;
      } else {
        falseNegatives.push(`Missing area: ${gtArea.name}`);
        areaErrors.push(`Failed to extract: ${gtArea.name}`);
      }
    }

    const areaMetrics = calculateMetrics({
      found: extractedAreas.length,
      correct: correctAreas,
      total: groundTruthAreas.length,
    });

    // Calculate average confidence score
    const allConfidences = [
      ...(extractedDimensions.map((d) => d.confidence).filter(Boolean) as number[]),
      ...(extractedEquipment.map((e) => e.confidence).filter(Boolean) as number[]),
      ...(extractedAreas.map((a) => a.confidence).filter(Boolean) as number[]),
    ];

    const avgConfidenceScore =
      allConfidences.length > 0
        ? allConfidences.reduce((sum, c) => sum + c, 0) / allConfidences.length
        : 0;

    const falsePositives = [
      ...falsePositiveDimensions.map((d) => `Extra dimension: ${d.value}`),
      ...falsePositiveEquipment.map((e) => `Extra equipment: ${e.name}`),
    ];

    return {
      dimensionMetrics: {
        found: extractedDimensions.length,
        correct: correctDimensions,
        total: groundTruthDimensions.length,
        ...dimensionMetrics,
      },
      equipmentMetrics: {
        found: extractedEquipment.length,
        correct: correctEquipment,
        total: groundTruthEquipment.length,
        ...equipmentMetrics,
      },
      areaMetrics: {
        found: extractedAreas.length,
        correct: correctAreas,
        total: groundTruthAreas.length,
        recall: areaMetrics.recall,
        precision: areaMetrics.precision,
      },
      avgConfidenceScore: Math.round(avgConfidenceScore * 100) / 100,
      breakdown: {
        dimensionErrors,
        equipmentErrors,
        areaErrors,
        falsePositives,
        falseNegatives,
      },
    };
  },
});
