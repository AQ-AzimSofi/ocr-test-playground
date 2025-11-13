import { FastifyPluginAsync } from 'fastify';
import { db, geometricObjects, extractionResults } from '../../db/index.js';
import { eq, and, inArray } from 'drizzle-orm';
import {
  exportToDynamoPython,
  exportToDynamoJSON,
  DynamoExportOptions,
} from '../../utils/dynamo-exporter.js';

export const geometricObjectsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/geometric-objects/result/:resultId - Get all geometric objects for a result
  fastify.get<{ Params: { resultId: string } }>(
    '/result/:resultId',
    async (request, reply) => {
      try {
        const { resultId } = request.params;

        // Fetch geometric objects
        const objects = await db
          .select()
          .from(geometricObjects)
          .where(eq(geometricObjects.extractionResultId, resultId));

        // Group by object type
        const grouped = objects.reduce(
          (acc, obj) => {
            const type = obj.objectType;
            if (!acc[type]) {
              acc[type] = [];
            }
            acc[type].push(obj);
            return acc;
          },
          {} as Record<string, typeof objects>
        );

        // Calculate statistics
        const stats = {
          total: objects.length,
          byType: Object.entries(grouped).map(([type, objs]) => ({
            type,
            count: objs.length,
            avgConfidence:
              objs.reduce((sum, o) => sum + (o.confidence || 0), 0) /
              objs.length,
          })),
          bySubType: objects.reduce(
            (acc, obj) => {
              const subType = obj.subType || 'unknown';
              acc[subType] = (acc[subType] || 0) + 1;
              return acc;
            },
            {} as Record<string, number>
          ),
          byDetectionMethod: objects.reduce(
            (acc, obj) => {
              const method = obj.detectionMethod || 'unknown';
              acc[method] = (acc[method] || 0) + 1;
              return acc;
            },
            {} as Record<string, number>
          ),
        };

        return {
          success: true,
          data: {
            objects,
            grouped,
            stats,
          },
        };
      } catch (error) {
        fastify.log.error(error);
        reply.status(500).send({
          success: false,
          error: 'Failed to fetch geometric objects',
        });
      }
    }
  );

  // GET /api/geometric-objects/drawing/:drawingId - Get all geometric objects for a drawing
  fastify.get<{ Params: { drawingId: string } }>(
    '/drawing/:drawingId',
    async (request, reply) => {
      try {
        const { drawingId } = request.params;

        // Fetch geometric objects
        const objects = await db
          .select()
          .from(geometricObjects)
          .where(eq(geometricObjects.drawingId, drawingId));

        // Get associated extraction results
        const resultIds = [
          ...new Set(objects.map((o) => o.extractionResultId)),
        ];

        const results = await db
          .select({
            id: extractionResults.id,
            tool: extractionResults.tool,
            createdAt: extractionResults.createdAt,
          })
          .from(extractionResults)
          .where(inArray(extractionResults.id, resultIds));

        // Group objects by result
        const byResult = objects.reduce(
          (acc, obj) => {
            const resultId = obj.extractionResultId;
            if (!acc[resultId]) {
              const result = results.find((r) => r.id === resultId);
              acc[resultId] = {
                result,
                objects: [],
              };
            }
            acc[resultId].objects.push(obj);
            return acc;
          },
          {} as Record<
            string,
            { result: (typeof results)[0] | undefined; objects: typeof objects }
          >
        );

        return {
          success: true,
          data: {
            objects,
            byResult,
            totalResults: results.length,
          },
        };
      } catch (error) {
        fastify.log.error(error);
        reply.status(500).send({
          success: false,
          error: 'Failed to fetch geometric objects for drawing',
        });
      }
    }
  );

  // GET /api/geometric-objects/:id - Get specific geometric object
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const { id } = request.params;

      const [object] = await db
        .select()
        .from(geometricObjects)
        .where(eq(geometricObjects.id, id))
        .limit(1);

      if (!object) {
        return reply.status(404).send({
          success: false,
          error: `Geometric object not found: ${id}`,
        });
      }

      return {
        success: true,
        data: object,
      };
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({
        success: false,
        error: 'Failed to fetch geometric object',
      });
    }
  });

  // GET /api/geometric-objects/result/:resultId/walls - Get walls only
  fastify.get<{ Params: { resultId: string } }>(
    '/result/:resultId/walls',
    async (request, reply) => {
      try {
        const { resultId } = request.params;

        const walls = await db
          .select()
          .from(geometricObjects)
          .where(
            and(
              eq(geometricObjects.extractionResultId, resultId),
              eq(geometricObjects.objectType, 'wall')
            )
          );

        // Group by subType (exterior/interior/partition)
        const bySubType = walls.reduce(
          (acc, wall) => {
            const subType = wall.subType || 'unknown';
            if (!acc[subType]) {
              acc[subType] = [];
            }
            acc[subType].push(wall);
            return acc;
          },
          {} as Record<string, typeof walls>
        );

        return {
          success: true,
          data: {
            walls,
            bySubType,
            total: walls.length,
          },
        };
      } catch (error) {
        fastify.log.error(error);
        reply.status(500).send({
          success: false,
          error: 'Failed to fetch walls',
        });
      }
    }
  );

  // GET /api/geometric-objects/result/:resultId/rooms - Get rooms only
  fastify.get<{ Params: { resultId: string } }>(
    '/result/:resultId/rooms',
    async (request, reply) => {
      try {
        const { resultId } = request.params;

        const rooms = await db
          .select()
          .from(geometricObjects)
          .where(
            and(
              eq(geometricObjects.extractionResultId, resultId),
              eq(geometricObjects.objectType, 'room')
            )
          );

        // Extract room labels
        const labeled = rooms.filter(
          (r) => r.properties && (r.properties as any).label
        );
        const unlabeled = rooms.filter(
          (r) => !r.properties || !(r.properties as any).label
        );

        return {
          success: true,
          data: {
            rooms,
            labeled,
            unlabeled,
            total: rooms.length,
          },
        };
      } catch (error) {
        fastify.log.error(error);
        reply.status(500).send({
          success: false,
          error: 'Failed to fetch rooms',
        });
      }
    }
  );

  // POST /api/geometric-objects/result/:resultId/export/dynamo - Export to Dynamo Python script
  fastify.post<{
    Params: { resultId: string };
    Body: DynamoExportOptions;
  }>('/result/:resultId/export/dynamo', async (request, reply) => {
    try {
      const { resultId } = request.params;
      const options = request.body || {};

      // Fetch geometric objects
      const objects = await db
        .select()
        .from(geometricObjects)
        .where(eq(geometricObjects.extractionResultId, resultId));

      if (objects.length === 0) {
        return reply.status(404).send({
          success: false,
          error: 'No geometric objects found for this result',
        });
      }

      // Generate Dynamo Python script
      const pythonScript = exportToDynamoPython(objects as any, options);

      // Return as downloadable file
      reply
        .header('Content-Type', 'text/x-python')
        .header('Content-Disposition', `attachment; filename="floor_plan_${resultId}.py"`)
        .send(pythonScript);
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({
        success: false,
        error: 'Failed to export to Dynamo',
      });
    }
  });

  // POST /api/geometric-objects/result/:resultId/export/dynamo-json - Export to Dynamo JSON
  fastify.post<{
    Params: { resultId: string };
    Body: DynamoExportOptions;
  }>('/result/:resultId/export/dynamo-json', async (request, reply) => {
    try {
      const { resultId } = request.params;
      const options = request.body || {};

      // Fetch geometric objects
      const objects = await db
        .select()
        .from(geometricObjects)
        .where(eq(geometricObjects.extractionResultId, resultId));

      if (objects.length === 0) {
        return reply.status(404).send({
          success: false,
          error: 'No geometric objects found for this result',
        });
      }

      // Generate Dynamo JSON
      const dynamoJSON = exportToDynamoJSON(objects as any, options);

      return {
        success: true,
        data: dynamoJSON,
      };
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({
        success: false,
        error: 'Failed to export to Dynamo JSON',
      });
    }
  });
};
