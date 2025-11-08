import { azureDocumentClient } from '../lib/azure-document-client.js';
import { db, extractionResults } from '../db/index.js';

/**
 * Process drawing with Azure AI Document Intelligence (prebuilt-read model)
 * This model provides word-level OCR with confidence scores
 * Optimized for text extraction from technical drawings
 */
export async function processWithAzureRead(imagePath: string, drawingId: string) {
  console.log(`  Processing with Azure Read (prebuilt-read)...`);
  const startTime = Date.now();

  try {
    // Analyze with prebuilt-read model for word-level confidence
    const result = await azureDocumentClient.analyzeRead(imagePath);

    const processingTime = Date.now() - startTime;
    const estimatedCost = azureDocumentClient.estimateCost(result.pages.length, 'read');

    // Calculate average confidence from all words
    const confidences = result.words
      .map((word: any) => word.confidence)
      .filter((c: number) => c !== undefined);
    const avgConfidence = confidences.length > 0
      ? confidences.reduce((sum: number, c: number) => sum + c, 0) / confidences.length
      : undefined;

    // Calculate confidence distribution
    const confidenceRanges = {
      excellent: confidences.filter((c: number) => c >= 0.95).length,
      good: confidences.filter((c: number) => c >= 0.85 && c < 0.95).length,
      medium: confidences.filter((c: number) => c >= 0.75 && c < 0.85).length,
      low: confidences.filter((c: number) => c >= 0.60 && c < 0.75).length,
      veryLow: confidences.filter((c: number) => c < 0.60).length,
    };

    // Save to database with bounding boxes
    const [dbResult] = await db
      .insert(extractionResults)
      .values({
        drawingId,
        tool: 'azure-read',
        rawText: result.content,
        boundingBoxes: result.words.map(word => ({
          text: word.text,
          bounds: word.bounds,
          confidence: word.confidence,
          page: word.page,
        })),
        processingTimeMs: processingTime,
        apiCost: estimatedCost,
        metadata: {
          model: 'prebuilt-read',
          wordCount: result.words.length,
          avgConfidence,
          confidenceDistribution: confidenceRanges,
          confidenceDistributionPercent: {
            excellent: (confidenceRanges.excellent / confidences.length * 100).toFixed(1) + '%',
            good: (confidenceRanges.good / confidences.length * 100).toFixed(1) + '%',
            medium: (confidenceRanges.medium / confidences.length * 100).toFixed(1) + '%',
            low: (confidenceRanges.low / confidences.length * 100).toFixed(1) + '%',
            veryLow: (confidenceRanges.veryLow / confidences.length * 100).toFixed(1) + '%',
          },
        },
      })
      .returning();

    console.log(`  Azure Read completed in ${(processingTime / 1000).toFixed(2)}s`);
    console.log(`     Extracted ${result.content.length} characters, ${result.words.length} words from ${result.pages.length} page(s)`);
    console.log(`     Avg confidence: ${((avgConfidence || 0) * 100).toFixed(1)}%`);
    console.log(`     Distribution: ${confidenceRanges.excellent} excellent, ${confidenceRanges.good} good, ${confidenceRanges.medium} medium, ${confidenceRanges.low + confidenceRanges.veryLow} low`);

    return {
      success: true,
      extractionResultId: dbResult.id,
      tool: 'azure-read',
      rawText: result.content,
      confidence: avgConfidence,
      processingTime,
      cost: estimatedCost,
      metadata: {
        wordCount: result.words.length,
        confidenceDistribution: confidenceRanges,
      },
    };
  } catch (error) {
    console.error(`  Azure Read failed:`, error);
    throw error;
  }
}
