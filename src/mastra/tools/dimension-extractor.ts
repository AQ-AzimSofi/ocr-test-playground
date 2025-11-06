import { createTool } from '@mastra/core';
import { z } from 'zod';
import { extractDimensions, extractEquipmentLabels } from '../../lib/utils.js';

/**
 * Tool to extract dimensions from raw text
 * Uses regex patterns to find measurements, dimensions, and specifications
 */
export const dimensionExtractorTool = createTool({
  id: 'dimension-extractor',
  description: 'Extract dimensions and measurements from construction drawing text',
  inputSchema: z.object({
    text: z.string().describe('Raw text extracted from drawing'),
  }),
  outputSchema: z.object({
    dimensions: z.array(
      z.object({
        value: z.string(),
        numbers: z.array(z.string()),
        unit: z.string().optional(),
      })
    ),
    equipment: z.array(
      z.object({
        term: z.string(),
        spec: z.string().optional(),
      })
    ),
  }),
  execute: async ({ context }) => {
    const { text } = context;

    const dimensions = extractDimensions(text);
    const equipment = extractEquipmentLabels(text);

    return {
      dimensions,
      equipment,
    };
  },
});
