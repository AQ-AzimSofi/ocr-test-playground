import { azureDocumentClient } from '../lib/azure-document-client.js';
import { db, extractionResults } from '../db/index.js';
import { sanitizePdf } from '../utils/pdf-sanitizer.js';

const isDevelopment = process.env.NODE_ENV !== 'production';

/**
 * Standalone Azure Read Processor
 *
 * Uses Azure Document Intelligence prebuilt-read model for OCR with word-level bounding boxes.
 * No hybrid logic - pure Azure Read results only.
 */

export async function processWithAzureRead(
  imagePath: string,
  drawingId: string
) {
  if (isDevelopment) {
    console.log(`  Processing with Azure Read (standalone)...`);
  }
  const startTime = Date.now();

  // Sanitize PDF if it's a PDF file
  let workingPath = imagePath;
  if (imagePath.toLowerCase().endsWith('.pdf')) {
    try {
      const sanitizedPath = await sanitizePdf(imagePath);
      if (sanitizedPath !== imagePath) {
        if (isDevelopment) {
          console.log(`  PDF sanitized to fix metadata issues`);
        }
        workingPath = sanitizedPath;
      }
    } catch (error) {
      console.warn(`  Warning: PDF sanitization failed: ${error}`);
    }
  }

  try {
    // Extract text with word-level bounding boxes
    const result = await azureDocumentClient.analyzeRead(workingPath);
    const rawText = result.content;

    if (isDevelopment) {
      console.log(
        `  Azure Read: ${result.words.length} words, ${rawText.length} chars`
      );
    }

    // Calculate average confidence
    const avgConfidence =
      result.words.length > 0
        ? result.words.reduce((sum, w) => sum + w.confidence, 0) /
          result.words.length
        : 0;

    // Calculate confidence distribution
    const confidenceDistribution = {
      excellent: 0, // >= 0.95
      good: 0, // >= 0.85
      medium: 0, // >= 0.7
      low: 0, // >= 0.5
      veryLow: 0, // < 0.5
    };

    result.words.forEach((word) => {
      const conf = word.confidence;
      if (conf >= 0.95) confidenceDistribution.excellent++;
      else if (conf >= 0.85) confidenceDistribution.good++;
      else if (conf >= 0.7) confidenceDistribution.medium++;
      else if (conf >= 0.5) confidenceDistribution.low++;
      else confidenceDistribution.veryLow++;
    });

    const processingTime = Date.now() - startTime;
    const estimatedCost = azureDocumentClient.estimateCost(
      result.pages.length,
      'read'
    );

    // Save to database
    const [dbResult] = await db
      .insert(extractionResults)
      .values({
        drawingId,
        tool: 'azure-read',
        rawText,
        boundingBoxes: result.words.map((word) => ({
          text: word.text,
          bounds: word.bounds,
          confidence: word.confidence,
          page: word.page,
          bboxSource: 'ocr',
          metadata: { granularity: 'word' },
        })),
        processingTimeMs: processingTime,
        apiCost: estimatedCost,
        metadata: {
          granularity: 'word',
          model: 'prebuilt-read',
          wordCount: result.words.length,
          pageCount: result.pages.length,
          avgConfidence,
          confidenceDistribution,
        },
      })
      .returning();

    if (isDevelopment) {
      console.log(
        `  Azure Read completed in ${(processingTime / 1000).toFixed(2)}s`
      );
      console.log(`     Text: ${rawText.length} chars`);
      console.log(
        `     Words: ${result.words.length} (avg confidence: ${(avgConfidence * 100).toFixed(1)}%)`
      );
      console.log(
        `     Confidence: excellent=${confidenceDistribution.excellent}, good=${confidenceDistribution.good}, medium=${confidenceDistribution.medium}, low=${confidenceDistribution.low}, veryLow=${confidenceDistribution.veryLow}`
      );
      console.log(`     Cost: ${estimatedCost.toFixed(2)} yen`);
    }

    return {
      success: true,
      extractionResultId: dbResult.id,
      tool: 'azure-read',
      rawText,
      confidence: avgConfidence,
      processingTime,
      cost: estimatedCost,
    };
  } catch (error: any) {
    // Provide helpful error messages for common issues
    let errorMessage = error.message || String(error);

    if (error.details?.error?.innererror?.code === 'InvalidContent') {
      console.error(`  Azure Read failed: PDF appears to be corrupted`);
      console.error(
        `  This PDF may have structural issues that Azure cannot process.`
      );
      console.error(`  Try: Converting to image format or using other OCR services.`);
    } else if (error.statusCode === 400) {
      console.error(`  Azure Read failed: Invalid request (${errorMessage})`);
    } else {
      console.error(`  Azure Read failed:`, error);
    }
    throw error;
  }
}
