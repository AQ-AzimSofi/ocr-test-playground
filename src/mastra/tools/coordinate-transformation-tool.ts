import { createTool } from '@mastra/core';
import { z } from 'zod';

/**
 * Tool to transform pixel coordinates to real-world coordinates (millimeters)
 * using a calculated or provided scaling factor
 */
export const coordinateTransformationTool = createTool({
  id: 'coordinate-transformation',
  description:
    'Transform pixel coordinates to real-world millimeters using scaling factor',
  inputSchema: z.object({
    coordinates_px: z.array(
      z.object({
        x: z.number(),
        y: z.number(),
      })
    ),
    scaling_factor: z.number().describe('Millimeters per pixel (mm/px)'),
    flip_y_axis: z.boolean().optional().default(false).describe('Flip Y axis from top-left to bottom-left origin'),
    image_height: z.number().optional().describe('Image height in pixels (required if flip_y_axis is true)'),
  }),
  outputSchema: z.object({
    coordinates_mm: z.array(
      z.object({
        x: z.number(),
        y: z.number(),
      })
    ),
    transformation_info: z.object({
      scaling_factor: z.number(),
      origin: z.enum(['top-left', 'bottom-left']),
      y_axis_flipped: z.boolean(),
    }),
  }),
  execute: async ({ context }) => {
    const { coordinates_px, scaling_factor, flip_y_axis, image_height } = context;

    if (flip_y_axis && !image_height) {
      throw new Error('image_height is required when flip_y_axis is true');
    }

    const coordinates_mm = coordinates_px.map((coord) => {
      let x_mm = coord.x * scaling_factor;
      let y_mm = coord.y * scaling_factor;

      // Flip Y axis if requested (convert from top-left to bottom-left origin)
      if (flip_y_axis && image_height) {
        y_mm = (image_height - coord.y) * scaling_factor;
      }

      // Round to 2 decimal places
      return {
        x: Math.round(x_mm * 100) / 100,
        y: Math.round(y_mm * 100) / 100,
      };
    });

    return {
      coordinates_mm,
      transformation_info: {
        scaling_factor,
        origin: flip_y_axis ? 'bottom-left' : 'top-left',
        y_axis_flipped: flip_y_axis || false,
      },
    };
  },
});
