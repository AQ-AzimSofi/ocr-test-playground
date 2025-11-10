import { createTool } from '@mastra/core';
import { z } from 'zod';

/**
 * Tool to calculate the scaling factor (mm/pixel) from associations
 * between geometric elements and their dimension text
 */
export const scalingCalculatorTool = createTool({
  id: 'scaling-calculator',
  description:
    'Calculate scaling factor (mm/pixel) from element-dimension associations',
  inputSchema: z.object({
    associations: z.array(
      z.object({
        element_length_px: z.number().describe('Length of element in pixels'),
        dimension_value_mm: z.number().describe('Dimension value in millimeters'),
        confidence: z.number().min(0).max(1).describe('Confidence in this association'),
      })
    ),
    default_scaling_factor: z.number().optional().default(15.0).describe('Default fallback if calculation fails'),
  }),
  outputSchema: z.object({
    scaling_factor: z.number().describe('Calculated scaling factor in mm/pixel'),
    pixels_per_mm: z.number().describe('Inverse: pixels per millimeter'),
    calculation_method: z.enum(['weighted_average', 'median', 'default']),
    confidence: z.number().min(0).max(1).describe('Confidence in the calculated scaling factor'),
    anchor_count: z.number().describe('Number of associations used for calculation'),
    individual_factors: z.array(
      z.object({
        scaling_factor: z.number(),
        confidence: z.number(),
        deviation_percent: z.number().optional(),
      })
    ),
    statistics: z.object({
      min: z.number(),
      max: z.number(),
      mean: z.number(),
      median: z.number(),
      std_dev: z.number(),
    }),
  }),
  execute: async ({ context }) => {
    const { associations, default_scaling_factor } = context;

    // If no associations, return default
    if (associations.length === 0) {
      return {
        scaling_factor: default_scaling_factor,
        pixels_per_mm: 1 / default_scaling_factor,
        calculation_method: 'default' as const,
        confidence: 0.3,
        anchor_count: 0,
        individual_factors: [],
        statistics: {
          min: default_scaling_factor,
          max: default_scaling_factor,
          mean: default_scaling_factor,
          median: default_scaling_factor,
          std_dev: 0,
        },
      };
    }

    // Calculate individual scaling factors
    const individual_factors = associations.map((assoc) => ({
      scaling_factor: assoc.dimension_value_mm / assoc.element_length_px,
      confidence: assoc.confidence,
      deviation_percent: 0, // Will be calculated after we have the mean
    }));

    // Calculate statistics
    const factors = individual_factors.map((f) => f.scaling_factor);
    const sortedFactors = [...factors].sort((a, b) => a - b);

    const min = Math.min(...factors);
    const max = Math.max(...factors);
    const mean = factors.reduce((sum, f) => sum + f, 0) / factors.length;
    const median =
      sortedFactors.length % 2 === 0
        ? (sortedFactors[sortedFactors.length / 2 - 1] + sortedFactors[sortedFactors.length / 2]) / 2
        : sortedFactors[Math.floor(sortedFactors.length / 2)];

    const variance = factors.reduce((sum, f) => sum + Math.pow(f - mean, 2), 0) / factors.length;
    const std_dev = Math.sqrt(variance);

    // Calculate deviation percentages
    individual_factors.forEach((f) => {
      f.deviation_percent = Math.abs((f.scaling_factor - mean) / mean) * 100;
    });

    // Weighted average calculation (using confidence as weight)
    const totalWeight = individual_factors.reduce((sum, f) => sum + f.confidence, 0);
    const weighted_average = individual_factors.reduce(
      (sum, f) => sum + f.scaling_factor * f.confidence,
      0
    ) / totalWeight;

    // Determine calculation method
    // Use weighted average if we have confidence scores
    // Use median if standard deviation is high (>20% of mean) to avoid outliers
    let calculation_method: 'weighted_average' | 'median' | 'default';
    let final_scaling_factor: number;

    const coefficient_of_variation = (std_dev / mean) * 100;

    if (coefficient_of_variation > 20) {
      // High variance, use median to avoid outliers
      calculation_method = 'median';
      final_scaling_factor = median;
    } else {
      // Low variance, use weighted average
      calculation_method = 'weighted_average';
      final_scaling_factor = weighted_average;
    }

    // Calculate overall confidence
    // Lower confidence if:
    // - Few anchors (< 3)
    // - High variance (CV > 15%)
    // - Individual confidences are low
    const avgConfidence = individual_factors.reduce((sum, f) => sum + f.confidence, 0) / individual_factors.length;
    let overallConfidence = avgConfidence;

    if (associations.length < 3) {
      overallConfidence *= 0.8; // Reduce confidence with few anchors
    }

    if (coefficient_of_variation > 15) {
      overallConfidence *= 0.7; // Reduce confidence with high variance
    }

    // Round to reasonable precision
    final_scaling_factor = Math.round(final_scaling_factor * 1000) / 1000; // 3 decimal places

    return {
      scaling_factor: final_scaling_factor,
      pixels_per_mm: Math.round((1 / final_scaling_factor) * 10000) / 10000, // 4 decimal places
      calculation_method,
      confidence: Math.round(overallConfidence * 100) / 100,
      anchor_count: associations.length,
      individual_factors,
      statistics: {
        min: Math.round(min * 1000) / 1000,
        max: Math.round(max * 1000) / 1000,
        mean: Math.round(mean * 1000) / 1000,
        median: Math.round(median * 1000) / 1000,
        std_dev: Math.round(std_dev * 1000) / 1000,
      },
    };
  },
});
