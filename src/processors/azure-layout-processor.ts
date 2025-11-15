import { azureDocumentClient } from '../lib/azure-document-client.js';
import { db, extractionResults } from '../db/index.js';
import { sanitizePdf } from '../utils/pdf-sanitizer.js';
import * as path from 'path';

const isDevelopment = process.env.NODE_ENV !== 'production';

/**
 * Standalone Azure Layout Processor
 *
 * Uses Azure Document Intelligence prebuilt-layout model for OCR with line-level bounding boxes.
 * Better for document structure awareness (tables, paragraphs, reading order).
 * No hybrid logic - pure Azure Layout results only.
 *
 * Note: Azure Layout doesn't always provide line-level confidence scores.
 */

export async function processWithAzureLayout(
  imagePath: string,
  drawingId: string
) {
  if (isDevelopment) {
    console.log(`  Processing with Azure Layout (standalone)...`);
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
    // Extract text with line-level bounding boxes
    const result = await azureDocumentClient.analyzeLayout(workingPath);
    const rawText = result.content;

    if (isDevelopment) {
      console.log(
        `  Azure Layout: ${result.lines.length} lines, ${rawText.length} chars`
      );
    }

    // Calculate average confidence (may be undefined for some lines)
    const confidences = result.lines
      .map((line) => line.confidence)
      .filter((c) => c !== undefined);
    const avgConfidence =
      confidences.length > 0
        ? confidences.reduce((sum, c) => sum + c, 0) / confidences.length
        : undefined;

    const linesWithConfidence = confidences.length;
    const linesWithoutConfidence = result.lines.length - confidences.length;

    const processingTime = Date.now() - startTime;
    const estimatedCost = azureDocumentClient.estimateCost(
      result.pages.length,
      'layout'
    );

    // Save to database
    const [dbResult] = await db
      .insert(extractionResults)
      .values({
        drawingId,
        tool: 'azure-layout',
        rawText,
        boundingBoxes: result.lines.map((line) => ({
          text: line.text,
          bounds: line.bounds,
          confidence: line.confidence,
          page: line.page,
          bboxSource: 'ocr',
          metadata: { granularity: 'line' },
        })),
        processingTimeMs: processingTime,
        apiCost: estimatedCost,
        metadata: {
          granularity: 'line',
          model: 'prebuilt-layout',
          lineCount: result.lines.length,
          pageCount: result.pages.length,
          tableCount: result.tables?.length || 0,
          paragraphCount: result.paragraphs?.length || 0,
          avgConfidence,
          linesWithConfidence,
          linesWithoutConfidence,
        },
      })
      .returning();

    if (isDevelopment) {
      console.log(
        `  Azure Layout completed in ${(processingTime / 1000).toFixed(2)}s`
      );
      console.log(`     Text: ${rawText.length} chars`);
      console.log(
        `     Lines: ${result.lines.length} (${linesWithConfidence} with confidence, ${linesWithoutConfidence} without)`
      );
      console.log(
        `     Avg confidence: ${avgConfidence !== undefined ? (avgConfidence * 100).toFixed(1) + '%' : 'N/A'}`
      );
      console.log(
        `     Structure: ${result.tables?.length || 0} tables, ${result.paragraphs?.length || 0} paragraphs`
      );
      console.log(`     Cost: ${estimatedCost.toFixed(2)} yen`);
    }

    return {
      success: true,
      extractionResultId: dbResult.id,
      tool: 'azure-layout',
      rawText,
      confidence: avgConfidence,
      processingTime,
      cost: estimatedCost,
    };
  } catch (error: any) {
    // Provide helpful error messages for common issues
    let errorMessage = error.message || String(error);

    if (error.details?.error?.innererror?.code === 'InvalidContent') {
      console.error(`  Azure Layout failed: PDF appears to be corrupted`);
      console.error(
        `  This PDF may have structural issues that Azure cannot process.`
      );
      console.error(`  Try: Converting to image format or using other OCR services.`);
    } else if (error.statusCode === 400) {
      console.error(`  Azure Layout failed: Invalid request (${errorMessage})`);
    } else {
      console.error(`  Azure Layout failed:`, error);
    }
    throw error;
  }
}
