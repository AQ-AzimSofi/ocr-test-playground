import { createTool } from '@mastra/core';
import { z } from 'zod';

/**
 * Tool to calculate spatial distances and find nearest elements
 * for dimension-to-element association
 */
export const spatialAssociationTool = createTool({
  id: 'spatial-association',
  description:
    'Calculate spatial distances between dimensions and elements to find nearest matches',
  inputSchema: z.object({
    dimension_position: z.object({
      x: z.number(),
      y: z.number(),
    }),
    elements: z.array(
      z.object({
        id: z.string(),
        type: z.string(),
        coordinates: z.array(
          z.object({
            x: z.number(),
            y: z.number(),
          })
        ),
      })
    ),
    max_distance_threshold: z.number().optional().default(200).describe('Maximum distance in pixels to consider'),
    orientation_hint: z.enum(['horizontal', 'vertical', 'any']).optional().default('any'),
  }),
  outputSchema: z.object({
    nearest_elements: z.array(
      z.object({
        element_id: z.string(),
        element_type: z.string(),
        distance_px: z.number(),
        closest_point: z.object({
          x: z.number(),
          y: z.number(),
        }),
        orientation_match: z.boolean().optional(),
        confidence: z.number().min(0).max(1),
      })
    ),
    total_candidates: z.number(),
    filtered_by_distance: z.number(),
    filtered_by_orientation: z.number(),
  }),
  execute: async ({ context }) => {
    const { dimension_position, elements, max_distance_threshold, orientation_hint } = context;

    interface CandidateMatch {
      element_id: string;
      element_type: string;
      distance_px: number;
      closest_point: { x: number; y: number };
      orientation_match?: boolean;
      confidence: number;
    }

    const candidates: CandidateMatch[] = [];

    // Calculate distance from dimension to each element
    for (const element of elements) {
      if (element.coordinates.length === 0) continue;

      let minDistance = Infinity;
      let closestPoint = { x: 0, y: 0 };

      // For each coordinate point in the element, calculate distance
      for (const coord of element.coordinates) {
        const distance = Math.sqrt(
          Math.pow(coord.x - dimension_position.x, 2) + Math.pow(coord.y - dimension_position.y, 2)
        );

        if (distance < minDistance) {
          minDistance = distance;
          closestPoint = coord;
        }
      }

      // For line elements (walls), also check distance to the line segment itself
      if (element.coordinates.length === 2) {
        const [p1, p2] = element.coordinates;
        const lineDistance = pointToLineSegmentDistance(dimension_position, p1, p2);
        if (lineDistance.distance < minDistance) {
          minDistance = lineDistance.distance;
          closestPoint = lineDistance.closest_point;
        }
      }

      // Determine orientation match
      let orientationMatch: boolean | undefined = undefined;
      if (orientation_hint !== 'any' && element.coordinates.length === 2) {
        const [p1, p2] = element.coordinates;
        const isHorizontal = Math.abs(p1.y - p2.y) < Math.abs(p1.x - p2.x);
        const isVertical = Math.abs(p1.x - p2.x) < Math.abs(p1.y - p2.y);

        if (orientation_hint === 'horizontal') {
          orientationMatch = isHorizontal;
        } else if (orientation_hint === 'vertical') {
          orientationMatch = isVertical;
        }
      }

      candidates.push({
        element_id: element.id,
        element_type: element.type,
        distance_px: Math.round(minDistance * 100) / 100, // 2 decimal places
        closest_point: {
          x: Math.round(closestPoint.x * 100) / 100,
          y: Math.round(closestPoint.y * 100) / 100,
        },
        orientation_match: orientationMatch,
        confidence: 0, // Will be calculated below
      });
    }

    // Filter by distance threshold
    const filtered = candidates.filter((c) => c.distance_px <= max_distance_threshold);

    // Filter by orientation if needed
    const orientationFiltered =
      orientation_hint !== 'any'
        ? filtered.filter((c) => c.orientation_match === true)
        : filtered;

    // Calculate confidence scores based on distance
    // Closer elements get higher confidence
    // Confidence formula: 1 - (distance / max_distance)^2
    // This gives exponential decay, so very close items get high confidence
    const finalCandidates = orientationFiltered.map((c) => {
      const normalizedDistance = c.distance_px / max_distance_threshold;
      const baseConfidence = 1 - Math.pow(normalizedDistance, 2);

      // Boost confidence if orientation matches
      let confidence = baseConfidence;
      if (c.orientation_match === true) {
        confidence = Math.min(1.0, confidence * 1.2);
      }

      return {
        ...c,
        confidence: Math.round(confidence * 1000) / 1000, // 3 decimal places
      };
    });

    // Sort by confidence (descending)
    finalCandidates.sort((a, b) => b.confidence - a.confidence);

    return {
      nearest_elements: finalCandidates,
      total_candidates: candidates.length,
      filtered_by_distance: candidates.length - filtered.length,
      filtered_by_orientation: filtered.length - orientationFiltered.length,
    };
  },
});

/**
 * Calculate distance from a point to a line segment
 */
function pointToLineSegmentDistance(
  point: { x: number; y: number },
  lineStart: { x: number; y: number },
  lineEnd: { x: number; y: number }
): { distance: number; closest_point: { x: number; y: number } } {
  const A = point.x - lineStart.x;
  const B = point.y - lineStart.y;
  const C = lineEnd.x - lineStart.x;
  const D = lineEnd.y - lineStart.y;

  const dot = A * C + B * D;
  const len_sq = C * C + D * D;

  // Parameter of the closest point on the line segment
  let param = -1;
  if (len_sq !== 0) {
    param = dot / len_sq;
  }

  let closest_x: number;
  let closest_y: number;

  if (param < 0) {
    // Closest point is lineStart
    closest_x = lineStart.x;
    closest_y = lineStart.y;
  } else if (param > 1) {
    // Closest point is lineEnd
    closest_x = lineEnd.x;
    closest_y = lineEnd.y;
  } else {
    // Closest point is on the line segment
    closest_x = lineStart.x + param * C;
    closest_y = lineStart.y + param * D;
  }

  const dx = point.x - closest_x;
  const dy = point.y - closest_y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  return {
    distance,
    closest_point: { x: closest_x, y: closest_y },
  };
}
