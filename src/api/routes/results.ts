import { FastifyPluginAsync } from 'fastify';
import { db, extractionResults, accuracyMetrics } from '../../db/index.js';
import { eq } from 'drizzle-orm';

export const resultsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/results/:id - Get specific extraction result with bounding boxes
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const { id } = request.params;

      const [result] = await db
        .select()
        .from(extractionResults)
        .where(eq(extractionResults.id, id))
        .limit(1);

      if (!result) {
        return reply.status(404).send({
          success: false,
          error: `Result not found: ${id}`,
        });
      }

      // Get accuracy metrics if available
      const [accuracy] = await db
        .select()
        .from(accuracyMetrics)
        .where(eq(accuracyMetrics.extractionResultId, id))
        .limit(1);

      // Process bounding boxes to ensure proper structure
      const boundingBoxes = result.boundingBoxes || [];
      const processedBoundingBoxes = boundingBoxes.map((bbox: any, index: number) => ({
        id: `bbox-${index}`,
        ...bbox,
        // Ensure bounds is array of {x, y} objects
        bounds: Array.isArray(bbox.bounds)
          ? bbox.bounds.map((point: any) => ({
              x: typeof point.x === 'number' ? point.x : 0,
              y: typeof point.y === 'number' ? point.y : 0,
            }))
          : [],
      }));

      // Calculate bounding box statistics
      const bboxStats = {
        total: processedBoundingBoxes.length,
        geminiUpdated: processedBoundingBoxes.filter((b: any) => b.metadata?.geminiUpdated).length,
        lowConfidence: processedBoundingBoxes.filter((b: any) => b.metadata?.isLowConfidence).length,
        bySource: processedBoundingBoxes.reduce((acc: any, bbox: any) => {
          const source = bbox.metadata?.source || 'unknown';
          acc[source] = (acc[source] || 0) + 1;
          return acc;
        }, {}),
      };

      return {
        success: true,
        data: {
          ...result,
          boundingBoxes: processedBoundingBoxes,
          accuracy: accuracy || null,
          stats: bboxStats,
        },
      };
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({
        success: false,
        error: 'Failed to fetch result',
      });
    }
  });

  // GET /api/results/:id/bbox-summary - Get bounding box summary (for quick filtering)
  fastify.get<{ Params: { id: string } }>('/:id/bbox-summary', async (request, reply) => {
    try {
      const { id } = request.params;

      const [result] = await db
        .select({
          id: extractionResults.id,
          tool: extractionResults.tool,
          boundingBoxes: extractionResults.boundingBoxes,
        })
        .from(extractionResults)
        .where(eq(extractionResults.id, id))
        .limit(1);

      if (!result) {
        return reply.status(404).send({
          success: false,
          error: `Result not found: ${id}`,
        });
      }

      const boundingBoxes = result.boundingBoxes || [];

      // Extract confidence distribution
      const confidenceRanges = {
        excellent: boundingBoxes.filter((b: any) => (b.confidence || 0) >= 0.95).length,
        good: boundingBoxes.filter(
          (b: any) => (b.confidence || 0) >= 0.85 && (b.confidence || 0) < 0.95
        ).length,
        medium: boundingBoxes.filter(
          (b: any) => (b.confidence || 0) >= 0.75 && (b.confidence || 0) < 0.85
        ).length,
        low: boundingBoxes.filter((b: any) => (b.confidence || 0) < 0.75).length,
      };

      // Extract Gemini update info
      const geminiUpdates = boundingBoxes
        .map((bbox: any, index: number) => ({
          index,
          text: bbox.text,
          originalText: bbox.metadata?.originalText,
          confidence: bbox.confidence,
          source: bbox.metadata?.source,
        }))
        .filter((b: any) => b.originalText);

      return {
        success: true,
        data: {
          tool: result.tool,
          totalBoundingBoxes: boundingBoxes.length,
          confidenceRanges,
          geminiUpdatesCount: geminiUpdates.length,
          geminiUpdates,
        },
      };
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({
        success: false,
        error: 'Failed to fetch bounding box summary',
      });
    }
  });
};
