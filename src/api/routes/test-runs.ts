import { FastifyPluginAsync } from 'fastify';
import {
  db,
  testRuns,
  extractionResults,
  accuracyMetrics,
  testDrawings,
  toolComparisons,
  geometricObjects,
  elementRelationships,
} from '../../db/index.js';
import { eq, inArray, desc } from 'drizzle-orm';

export const testRunsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/test-runs - List all test runs with enriched data
  fastify.get('/', async (request, reply) => {
    try {
      const runs = await db
        .select()
        .from(testRuns)
        .orderBy(desc(testRuns.startedAt));

      // Enrich each test run with drawing information
      const enrichedRuns = await Promise.all(
        runs.map(async (run) => {
          // Get drawing details
          const drawings = await db
            .select()
            .from(testDrawings)
            .where(inArray(testDrawings.drawingId, run.drawingIds || []));

          // Get result counts for each tool
          const results = await db
            .select()
            .from(extractionResults)
            .where(inArray(extractionResults.drawingId, run.drawingIds || []));

          const toolCounts: Record<string, number> = {};
          (run.tools || []).forEach((tool) => {
            toolCounts[tool] = results.filter((r) => r.tool === tool).length;
          });

          return {
            ...run,
            drawings: drawings.map((d) => ({
              drawingId: d.drawingId,
              fileName: d.fileName,
              filePath: d.filePath,
              type: d.type,
              quality: d.quality,
            })),
            toolCounts,
          };
        })
      );

      return {
        success: true,
        data: enrichedRuns,
        count: enrichedRuns.length,
      };
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({
        success: false,
        error: 'Failed to fetch test runs',
      });
    }
  });

  // GET /api/test-runs/:id - Get test run with comparison data
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const { id } = request.params;

      const [testRun] = await db
        .select()
        .from(testRuns)
        .where(eq(testRuns.id, id))
        .limit(1);

      if (!testRun) {
        return reply.status(404).send({
          success: false,
          error: `Test run not found: ${id}`,
        });
      }

      // Get all extraction results for this test run's drawings
      const drawingIds = testRun.drawingIds || [];
      const tools = testRun.tools || [];

      // Get drawing details
      const drawings = await db
        .select()
        .from(testDrawings)
        .where(inArray(testDrawings.drawingId, drawingIds));

      const results = await db
        .select()
        .from(extractionResults)
        .where(inArray(extractionResults.drawingId, drawingIds));

      // Debug logging for bounding boxes
      fastify.log.info('[TEST-RUN-API] Extraction results retrieved:');
      for (const result of results) {
        const hasBBoxes =
          result.boundingBoxes && Array.isArray(result.boundingBoxes);
        const bboxCount = hasBBoxes ? result.boundingBoxes!.length : 0;
        fastify.log.info(
          `  - Tool: ${result.tool}, Drawing: ${result.drawingId}, BBoxes: ${bboxCount}`
        );
      }

      // Get accuracy metrics for all results
      const resultIds = results.map((r) => r.id);
      const metrics = await db
        .select()
        .from(accuracyMetrics)
        .where(inArray(accuracyMetrics.extractionResultId, resultIds));

      // Build comparison data
      const comparisons = drawingIds.map((drawingId) => {
        const drawingResults = results.filter((r) => r.drawingId === drawingId);

        const toolResults = tools.map((tool) => {
          const result = drawingResults.find((r) => r.tool === tool);
          if (!result) return null;

          const metric = metrics.find(
            (m) => m.extractionResultId === result.id
          );

          return {
            tool,
            result: {
              id: result.id,
              rawText: result.rawText,
              boundingBoxes: result.boundingBoxes,
              processingTime: result.processingTimeMs,
              apiCost: result.apiCost,
              metadata: result.metadata,
            },
            accuracy: metric
              ? {
                  characterErrorRate: metric.characterErrorRate,
                  characterAccuracy: metric.characterAccuracy,
                  characterSetCoverage: metric.characterSetCoverage,
                  extractedCharCount: metric.extractedCharCount,
                  groundTruthCharCount: metric.groundTruthCharCount,
                }
              : null,
          };
        });

        return {
          drawingId,
          tools: toolResults.filter(Boolean),
        };
      });

      // Calculate aggregate statistics
      const aggregateStats = tools.map((tool) => {
        const toolMetrics = metrics.filter((m) =>
          results.some((r) => r.id === m.extractionResultId && r.tool === tool)
        );

        if (toolMetrics.length === 0) {
          return {
            tool,
            avgCER: 0,
            avgAccuracy: 0,
            avgCoverage: 0,
            avgProcessingTime: 0,
            totalCost: 0,
            count: 0,
          };
        }

        const toolResults = results.filter((r) => r.tool === tool);

        return {
          tool,
          avgCER:
            toolMetrics.reduce(
              (sum, m) => sum + (m.characterErrorRate || 0),
              0
            ) / toolMetrics.length,
          avgAccuracy:
            toolMetrics.reduce(
              (sum, m) => sum + (m.characterAccuracy || 0),
              0
            ) / toolMetrics.length,
          avgCoverage:
            toolMetrics.reduce(
              (sum, m) => sum + (m.characterSetCoverage || 0),
              0
            ) / toolMetrics.length,
          avgProcessingTime:
            toolResults.reduce((sum, r) => sum + (r.processingTimeMs || 0), 0) /
            toolResults.length,
          totalCost: toolResults.reduce((sum, r) => sum + (r.apiCost || 0), 0),
          count: toolMetrics.length,
        };
      });

      // Debug logging for response data
      fastify.log.info('[TEST-RUN-API] Sending response with comparison data:');
      for (const comparison of comparisons) {
        fastify.log.info(`  Drawing: ${comparison.drawingId}`);
        for (const toolResult of comparison.tools) {
          if (toolResult) {
            const bboxCount = toolResult.result.boundingBoxes?.length || 0;
            fastify.log.info(
              `    - Tool: ${toolResult.tool}, BBoxes: ${bboxCount}`
            );
          }
        }
      }

      return {
        success: true,
        data: {
          testRun: {
            ...testRun,
            drawings: drawings.map((d) => ({
              drawingId: d.drawingId,
              fileName: d.fileName,
              filePath: d.filePath,
              type: d.type,
              quality: d.quality,
            })),
          },
          comparisons,
          aggregateStats,
          summary: testRun.summary,
        },
      };
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({
        success: false,
        error: 'Failed to fetch test run',
      });
    }
  });

  // DELETE /api/test-runs/:id - Delete test run and all related data (except drawings)
  fastify.delete<{ Params: { id: string } }>(
    '/:id',
    async (request, reply) => {
      try {
        const { id } = request.params;

        // Get the test run to find which drawings were involved
        const [testRun] = await db
          .select()
          .from(testRuns)
          .where(eq(testRuns.id, id))
          .limit(1);

        if (!testRun) {
          return reply.status(404).send({
            success: false,
            error: `Test run not found: ${id}`,
          });
        }

        const drawingIds = testRun.drawingIds || [];

        if (drawingIds.length === 0) {
          // No drawings, just delete the test run
          await db.delete(testRuns).where(eq(testRuns.id, id));
          return {
            success: true,
            message: 'Test run deleted successfully',
          };
        }

        // Get all extraction results for these drawings
        const results = await db
          .select()
          .from(extractionResults)
          .where(inArray(extractionResults.drawingId, drawingIds));

        const resultIds = results.map((r) => r.id);

        // Delete in order to respect foreign key constraints:
        if (resultIds.length > 0) {
          // 1. Delete element relationships (references geometric objects)
          const geoObjects = await db
            .select()
            .from(geometricObjects)
            .where(inArray(geometricObjects.extractionResultId, resultIds));

          const geoObjectIds = geoObjects.map((g) => g.id);

          if (geoObjectIds.length > 0) {
            await db
              .delete(elementRelationships)
              .where(
                inArray(elementRelationships.sourceObjectId, geoObjectIds)
              );

            // 2. Delete geometric objects (references extraction results)
            await db
              .delete(geometricObjects)
              .where(inArray(geometricObjects.extractionResultId, resultIds));
          }

          // 3. Delete accuracy metrics (references extraction results)
          await db
            .delete(accuracyMetrics)
            .where(inArray(accuracyMetrics.extractionResultId, resultIds));

          // 4. Delete tool comparisons for these drawings
          await db
            .delete(toolComparisons)
            .where(inArray(toolComparisons.drawingId, drawingIds));

          // 5. Delete extraction results
          await db
            .delete(extractionResults)
            .where(inArray(extractionResults.drawingId, drawingIds));
        }

        // 6. Finally, delete the test run itself
        await db.delete(testRuns).where(eq(testRuns.id, id));

        fastify.log.info(`Test run ${id} deleted successfully`);

        return {
          success: true,
          message: 'Test run and all related data deleted successfully',
          deletedDrawingIds: drawingIds,
        };
      } catch (error) {
        fastify.log.error(error);
        reply.status(500).send({
          success: false,
          error: 'Failed to delete test run',
        });
      }
    }
  );
};
