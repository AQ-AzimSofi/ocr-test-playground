import { FastifyPluginAsync } from 'fastify';
import {
  db,
  bboxVerifications,
  missingTextEntries,
  extractionResults,
} from '../../db/index.js';
import { eq, and } from 'drizzle-orm';

export const verificationRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/verification/:resultId/verify-bbox - Mark bbox as correct/incorrect
  fastify.post<{
    Params: { resultId: string };
    Body: {
      bboxIndex: number;
      status: 'correct' | 'incorrect' | 'unverified';
      notes?: string;
    };
  }>('/:resultId/verify-bbox', async (request, reply) => {
    try {
      const { resultId } = request.params;
      const { bboxIndex, status, notes } = request.body;

      // Validate the extraction result exists
      const [result] = await db
        .select()
        .from(extractionResults)
        .where(eq(extractionResults.id, resultId))
        .limit(1);

      if (!result) {
        return reply.status(404).send({
          success: false,
          error: `Extraction result not found: ${resultId}`,
        });
      }

      // Check if bbox index is valid
      const boundingBoxes = result.boundingBoxes || [];
      if (bboxIndex < 0 || bboxIndex >= boundingBoxes.length) {
        return reply.status(400).send({
          success: false,
          error: `Invalid bbox index: ${bboxIndex}`,
        });
      }

      // Check if verification already exists
      const [existingVerification] = await db
        .select()
        .from(bboxVerifications)
        .where(
          and(
            eq(bboxVerifications.extractionResultId, resultId),
            eq(bboxVerifications.bboxIndex, bboxIndex)
          )
        )
        .limit(1);

      if (existingVerification) {
        // Update existing verification
        await db
          .update(bboxVerifications)
          .set({
            status,
            notes: notes || null,
            verifiedAt: new Date(),
          })
          .where(eq(bboxVerifications.id, existingVerification.id));
      } else {
        // Create new verification
        await db.insert(bboxVerifications).values({
          extractionResultId: resultId,
          drawingId: result.drawingId,
          bboxIndex,
          status,
          notes: notes || null,
          metadata: {},
        });
      }

      return {
        success: true,
        data: {
          bboxIndex,
          status,
          notes,
        },
      };
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({
        success: false,
        error: 'Failed to verify bbox',
      });
    }
  });

  // POST /api/verification/:resultId/missing-text - Add missing text entry
  fastify.post<{
    Params: { resultId: string };
    Body: {
      text: string;
      estimatedLocation?: {
        x?: number;
        y?: number;
        width?: number;
        height?: number;
        page?: number;
      };
      notes?: string;
    };
  }>('/:resultId/missing-text', async (request, reply) => {
    try {
      const { resultId } = request.params;
      const { text, estimatedLocation, notes } = request.body;

      // Validate the extraction result exists
      const [result] = await db
        .select()
        .from(extractionResults)
        .where(eq(extractionResults.id, resultId))
        .limit(1);

      if (!result) {
        return reply.status(404).send({
          success: false,
          error: `Extraction result not found: ${resultId}`,
        });
      }

      // Insert missing text entry
      const [missingText] = await db
        .insert(missingTextEntries)
        .values({
          extractionResultId: resultId,
          drawingId: result.drawingId,
          text,
          estimatedLocation: estimatedLocation || null,
          notes: notes || null,
          metadata: {},
        })
        .returning();

      return {
        success: true,
        data: missingText,
      };
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({
        success: false,
        error: 'Failed to add missing text',
      });
    }
  });

  // GET /api/verification/:resultId/stats - Get verification statistics
  fastify.get<{ Params: { resultId: string } }>(
    '/:resultId/stats',
    async (request, reply) => {
      try {
        const { resultId } = request.params;

        // Get extraction result
        const [result] = await db
          .select()
          .from(extractionResults)
          .where(eq(extractionResults.id, resultId))
          .limit(1);

        if (!result) {
          return reply.status(404).send({
            success: false,
            error: `Extraction result not found: ${resultId}`,
          });
        }

        // Get all verifications for this result
        const verifications = await db
          .select()
          .from(bboxVerifications)
          .where(eq(bboxVerifications.extractionResultId, resultId));

        // Get all missing text entries for this result
        const missingTexts = await db
          .select()
          .from(missingTextEntries)
          .where(eq(missingTextEntries.extractionResultId, resultId));

        // Calculate statistics
        const totalBboxes = (result.boundingBoxes || []).length;
        const verifiedCount = verifications.length;
        const unverifiedCount = totalBboxes - verifiedCount;
        const correctCount = verifications.filter(
          (v) => v.status === 'correct'
        ).length;
        const incorrectCount = verifications.filter(
          (v) => v.status === 'incorrect'
        ).length;

        // Create verification map (bboxIndex -> verification)
        const verificationMap = verifications.reduce((acc, v) => {
          acc[v.bboxIndex] = {
            status: v.status,
            notes: v.notes,
            verifiedAt: v.verifiedAt,
          };
          return acc;
        }, {} as Record<number, any>);

        // Calculate accuracy (if any verifications exist)
        const verificationProgress =
          totalBboxes > 0 ? (verifiedCount / totalBboxes) * 100 : 0;
        const correctRate =
          verifiedCount > 0 ? (correctCount / verifiedCount) * 100 : 0;
        const incorrectRate =
          verifiedCount > 0 ? (incorrectCount / verifiedCount) * 100 : 0;

        return {
          success: true,
          data: {
            totalBboxes,
            verifiedCount,
            unverifiedCount,
            correctCount,
            incorrectCount,
            missingTextCount: missingTexts.length,
            verificationProgress,
            correctRate,
            incorrectRate,
            verifications: verificationMap,
            missingTexts: missingTexts.map((mt) => ({
              id: mt.id,
              text: mt.text,
              estimatedLocation: mt.estimatedLocation,
              notes: mt.notes,
              addedAt: mt.addedAt,
            })),
          },
        };
      } catch (error) {
        fastify.log.error(error);
        reply.status(500).send({
          success: false,
          error: 'Failed to fetch verification stats',
        });
      }
    }
  );

  // DELETE /api/verification/:resultId/missing-text/:id - Delete missing text entry
  fastify.delete<{ Params: { resultId: string; id: string } }>(
    '/:resultId/missing-text/:id',
    async (request, reply) => {
      try {
        const { id } = request.params;

        await db
          .delete(missingTextEntries)
          .where(eq(missingTextEntries.id, id));

        return {
          success: true,
          message: 'Missing text entry deleted',
        };
      } catch (error) {
        fastify.log.error(error);
        reply.status(500).send({
          success: false,
          error: 'Failed to delete missing text entry',
        });
      }
    }
  );
};
