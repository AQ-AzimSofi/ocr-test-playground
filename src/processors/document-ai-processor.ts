import { documentAIClient } from '../lib/document-ai-client.js';
import { db, extractionResults } from '../db/index.js';

const isDevelopment = process.env.NODE_ENV !== 'production';

/**
 * Standalone Google Cloud Document AI Processor
 *
 * Uses Google Cloud Document AI for advanced OCR with word-level bounding boxes.
 * No hybrid logic - pure Document AI results only.
 * Safe for confidential documents (no AI training on data).
 */

export async function processWithDocumentAI(
  imagePath: string,
  drawingId: string
) {
  if (isDevelopment) {
    console.log(`  Processing with Document AI (standalone)...`);
  }
  const startTime = Date.now();

  try {
    // Analyze document with Document AI (with automatic chunking for large PDFs)
    const docAIResult = await documentAIClient.analyzeDocumentWithChunking(
      imagePath
    );

    if (isDevelopment) {
      console.log(
        `  Document AI: ${docAIResult.words.length} words, ${docAIResult.content.length} chars`
      );
    }

    // Calculate average confidence
    const avgConfidence =
      docAIResult.words.length > 0
        ? docAIResult.words.reduce((sum, w) => sum + (w.confidence || 0), 0) /
          docAIResult.words.length
        : 0;

    const processingTime = Date.now() - startTime;
    const pageCount =
      docAIResult.totalPages || docAIResult.pages.length;
    const estimatedCost = documentAIClient.estimateCost(pageCount);

    // Save to database
    const [dbResult] = await db
      .insert(extractionResults)
      .values({
        drawingId,
        tool: 'document-ai',
        rawText: docAIResult.content,
        boundingBoxes: docAIResult.words.map((word) => ({
          text: word.text,
          bounds: word.bounds,
          confidence: word.confidence,
          bboxSource: 'ocr',
          metadata: { page: word.page },
        })),
        processingTimeMs: processingTime,
        apiCost: estimatedCost,
        metadata: {
          granularity: 'word',
          avgConfidence,
          wordCount: docAIResult.words.length,
          pageCount,
          chunkCount: docAIResult.chunkCount,
          totalPages: docAIResult.totalPages,
        },
      })
      .returning();

    if (isDevelopment) {
      console.log(
        `  Document AI completed in ${(processingTime / 1000).toFixed(2)}s`
      );
      console.log(`     Text: ${docAIResult.content.length} chars`);
      console.log(
        `     Words: ${docAIResult.words.length} (avg confidence: ${(avgConfidence * 100).toFixed(1)}%)`
      );
      console.log(`     Cost: ${estimatedCost.toFixed(2)} yen`);
    }

    return {
      success: true,
      extractionResultId: dbResult.id,
      tool: 'document-ai',
      rawText: docAIResult.content,
      confidence: avgConfidence,
      processingTime,
      cost: estimatedCost,
    };
  } catch (error) {
    console.error(`  Document AI failed:`, error);
    throw error;
  }
}
