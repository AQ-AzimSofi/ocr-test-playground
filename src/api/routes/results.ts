import { FastifyPluginAsync } from 'fastify';
import {
  db,
  extractionResults,
  accuracyMetrics,
  bboxVerifications,
  missingTextEntries,
  testDrawings,
} from '../../db/index.js';
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

      // Get verification data
      const verifications = await db
        .select()
        .from(bboxVerifications)
        .where(eq(bboxVerifications.extractionResultId, id));

      // Get missing text entries
      const missingTexts = await db
        .select()
        .from(missingTextEntries)
        .where(eq(missingTextEntries.extractionResultId, id));

      // Get drawing info (for confidential status)
      const [drawing] = await db
        .select()
        .from(testDrawings)
        .where(eq(testDrawings.drawingId, result.drawingId))
        .limit(1);

      // Create verification map (bboxIndex -> verification)
      const verificationMap = verifications.reduce((acc, v) => {
        acc[v.bboxIndex] = {
          status: v.status,
          notes: v.notes,
          verifiedAt: v.verifiedAt,
        };
        return acc;
      }, {} as Record<number, any>);

      // Process bounding boxes to ensure proper structure
      const boundingBoxes = result.boundingBoxes || [];
      const processedBoundingBoxes = boundingBoxes.map(
        (bbox: any, index: number) => ({
          id: `bbox-${index}`,
          ...bbox,
          // Ensure bounds is array of {x, y} objects
          bounds: Array.isArray(bbox.bounds)
            ? bbox.bounds.map((point: any) => ({
                x: typeof point.x === 'number' ? point.x : 0,
                y: typeof point.y === 'number' ? point.y : 0,
              }))
            : [],
          // Add verification status if exists
          verification: verificationMap[index] || null,
        })
      );

      // Calculate bounding box statistics
      const bboxStats = {
        total: processedBoundingBoxes.length,
        geminiUpdated: processedBoundingBoxes.filter(
          (b: any) => b.metadata?.geminiUpdated
        ).length,
        lowConfidence: processedBoundingBoxes.filter(
          (b: any) => b.metadata?.isLowConfidence
        ).length,
        bySource: processedBoundingBoxes.reduce((acc: any, bbox: any) => {
          const source = bbox.metadata?.source || 'unknown';
          acc[source] = (acc[source] || 0) + 1;
          return acc;
        }, {}),
      };

      // Calculate verification statistics
      const verifiedCount = verifications.length;
      const correctCount = verifications.filter((v) => v.status === 'correct').length;
      const incorrectCount = verifications.filter((v) => v.status === 'incorrect').length;

      return {
        success: true,
        data: {
          ...result,
          boundingBoxes: processedBoundingBoxes,
          accuracy: accuracy || null,
          stats: bboxStats,
          isConfidential: drawing?.isConfidential || false,
          verification: {
            totalBboxes: processedBoundingBoxes.length,
            verifiedCount,
            correctCount,
            incorrectCount,
            missingTextCount: missingTexts.length,
            verificationProgress:
              processedBoundingBoxes.length > 0
                ? (verifiedCount / processedBoundingBoxes.length) * 100
                : 0,
          },
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
  fastify.get<{ Params: { id: string } }>(
    '/:id/bbox-summary',
    async (request, reply) => {
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
          excellent: boundingBoxes.filter(
            (b: any) => (b.confidence || 0) >= 0.95
          ).length,
          good: boundingBoxes.filter(
            (b: any) =>
              (b.confidence || 0) >= 0.85 && (b.confidence || 0) < 0.95
          ).length,
          medium: boundingBoxes.filter(
            (b: any) =>
              (b.confidence || 0) >= 0.75 && (b.confidence || 0) < 0.85
          ).length,
          low: boundingBoxes.filter((b: any) => (b.confidence || 0) < 0.75)
            .length,
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
    }
  );

  // PATCH /api/results/:id/corrections - Apply bbox corrections
  fastify.patch<{
    Params: { id: string };
    Body: { corrections: any[] };
  }>('/:id/corrections', async (request, reply) => {
    try {
      const { id } = request.params;
      const { corrections } = request.body;

      if (!Array.isArray(corrections)) {
        return reply.status(400).send({
          success: false,
          error: 'Corrections must be an array',
        });
      }

      // Fetch current result
      const [currentResult] = await db
        .select()
        .from(extractionResults)
        .where(eq(extractionResults.id, id))
        .limit(1);

      if (!currentResult) {
        return reply.status(404).send({
          success: false,
          error: `Result not found: ${id}`,
        });
      }

      // Apply corrections to bounding boxes
      let updatedBBoxes = [...(currentResult.boundingBoxes || [])];

      for (const correction of corrections) {
        const { type, bbox, originalBbox } = correction;

        if (type === 'add') {
          // Add new bbox
          updatedBBoxes.push(bbox);
        } else if (type === 'modify') {
          // Find and update bbox
          const index = updatedBBoxes.findIndex(
            (b: any) =>
              b.text === originalBbox?.text &&
              JSON.stringify(b.bounds) === JSON.stringify(originalBbox?.bounds)
          );
          if (index !== -1) {
            updatedBBoxes[index] = bbox;
          }
        } else if (type === 'delete') {
          // Remove bbox
          updatedBBoxes = updatedBBoxes.filter(
            (b: any) =>
              !(
                b.text === bbox.text &&
                JSON.stringify(b.bounds) === JSON.stringify(bbox.bounds)
              )
          );
        }
      }

      // Update result in database
      await db
        .update(extractionResults)
        .set({
          boundingBoxes: updatedBBoxes,
        })
        .where(eq(extractionResults.id, id));

      // Fetch updated result
      const [updatedResult] = await db
        .select()
        .from(extractionResults)
        .where(eq(extractionResults.id, id))
        .limit(1);

      return {
        success: true,
        data: {
          result: updatedResult,
        },
      };
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({
        success: false,
        error: 'Failed to apply corrections',
      });
    }
  });
};
