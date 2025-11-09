import { FastifyPluginAsync } from 'fastify';
import { db, testDrawings, extractionResults } from '../../db/index.js';
import { eq } from 'drizzle-orm';

export const drawingsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/drawings - List all test drawings
  fastify.get('/', async (request, reply) => {
    try {
      const drawings = await db
        .select()
        .from(testDrawings)
        .orderBy(testDrawings.createdAt);

      return {
        success: true,
        data: drawings,
        count: drawings.length,
      };
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({
        success: false,
        error: 'Failed to fetch drawings',
      });
    }
  });

  // GET /api/drawings/:id - Get drawing by ID
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const { id } = request.params;

      const [drawing] = await db
        .select()
        .from(testDrawings)
        .where(eq(testDrawings.drawingId, id))
        .limit(1);

      if (!drawing) {
        return reply.status(404).send({
          success: false,
          error: `Drawing not found: ${id}`,
        });
      }

      return {
        success: true,
        data: drawing,
      };
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({
        success: false,
        error: 'Failed to fetch drawing',
      });
    }
  });

  // GET /api/drawings/:id/results - Get all OCR results for a drawing
  fastify.get<{ Params: { id: string } }>(
    '/:id/results',
    async (request, reply) => {
      try {
        const { id } = request.params;

        // First check if drawing exists
        const [drawing] = await db
          .select()
          .from(testDrawings)
          .where(eq(testDrawings.drawingId, id))
          .limit(1);

        if (!drawing) {
          return reply.status(404).send({
            success: false,
            error: `Drawing not found: ${id}`,
          });
        }

        // Get all extraction results for this drawing
        const results = await db
          .select()
          .from(extractionResults)
          .where(eq(extractionResults.drawingId, id))
          .orderBy(extractionResults.createdAt);

        // Group results by tool
        const resultsByTool = results.reduce(
          (acc, result) => {
            acc[result.tool] = result;
            return acc;
          },
          {} as Record<string, (typeof results)[0]>
        );

        return {
          success: true,
          data: {
            drawing,
            results,
            resultsByTool,
            tools: results.map((r) => r.tool),
          },
        };
      } catch (error) {
        fastify.log.error(error);
        reply.status(500).send({
          success: false,
          error: 'Failed to fetch OCR results',
        });
      }
    }
  );
};
