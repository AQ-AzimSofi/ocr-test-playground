import { cloudVisionClient } from '../lib/cloud-vision-client.js';
import { db, extractionResults } from '../db/index.js';
import {
  isPdfFile,
  convertPdfToImages,
  cleanupTempImages,
} from '../utils/pdf-converter.js';

/**
 * Standalone Cloud Vision Processor
 *
 * Uses Google Cloud Vision API for OCR with paragraph-level bounding boxes.
 * Supports both image files and PDFs (converts PDFs to images first).
 * No hybrid logic - pure Cloud Vision results only.
 */

export async function processWithCloudVision(
  imagePath: string,
  drawingId: string
) {
  console.log(`  Processing with Cloud Vision (standalone)...`);
  const startTime = Date.now();

  // Check if input is a PDF and convert to images if needed
  let imagePaths: string[] = [imagePath];
  let isMultiPage = false;
  let tempImagePaths: string[] = [];

  if (isPdfFile(imagePath)) {
    console.log(`  Detected PDF file - converting to images...`);
    try {
      imagePaths = await convertPdfToImages(imagePath);
      tempImagePaths = imagePaths; // Track for cleanup
      isMultiPage = true;
      console.log(`  ✓ Converted ${imagePaths.length} PDF pages to PNG`);
    } catch (error) {
      console.error(`  ✗ Failed to convert PDF to images:`, error);
      throw new Error(`PDF conversion failed: ${error}`);
    }
  }

  try {
    // Process each page/image
    const allBboxes: Array<{
      text: string;
      bounds: Array<{ x: number; y: number }>;
      confidence: number;
      page: number;
    }> = [];

    let totalCost = 0;

    for (let i = 0; i < imagePaths.length; i++) {
      const pageNum = i + 1;
      const currentImagePath = imagePaths[i];

      if (isMultiPage) {
        console.log(
          `  Processing page ${pageNum}/${imagePaths.length} with Cloud Vision...`
        );
      }

      // Extract text with bounding boxes from current page
      const bboxes =
        await cloudVisionClient.extractTextWithBoundingBoxes(currentImagePath);

      // Add page number to each bounding box
      bboxes.forEach((bbox) => {
        allBboxes.push({
          ...bbox,
          page: pageNum,
        });
      });

      // Update cost estimate
      totalCost += cloudVisionClient.estimateCost(1);

      if (isMultiPage) {
        console.log(
          `    ✓ Page ${pageNum}: ${bboxes.length} regions, ${bboxes.map((b) => b.text).join(' ').length} chars`
        );
      }
    }

    const rawText = allBboxes.map((b) => b.text).join('\n');

    console.log(
      `  Cloud Vision: ${allBboxes.length} regions, ${rawText.length} chars`
    );

    // Calculate average confidence
    const avgConfidence =
      allBboxes.length > 0
        ? allBboxes.reduce((sum, b) => sum + (b.confidence || 1.0), 0) /
          allBboxes.length
        : 0;

    const processingTime = Date.now() - startTime;

    // Save to database
    const [dbResult] = await db
      .insert(extractionResults)
      .values({
        drawingId,
        tool: 'cloud-vision',
        rawText,
        boundingBoxes: allBboxes.map((bbox) => ({
          text: bbox.text,
          bounds: bbox.bounds,
          confidence: bbox.confidence,
          page: bbox.page,
          bboxSource: 'ocr',
        })),
        processingTimeMs: processingTime,
        apiCost: totalCost,
        metadata: {
          granularity: 'paragraph',
          avgConfidence,
          regionCount: allBboxes.length,
          pageCount: imagePaths.length,
          isPdf: isMultiPage,
        },
      })
      .returning();

    console.log(
      `  Cloud Vision completed in ${(processingTime / 1000).toFixed(2)}s`
    );
    console.log(`     Text: ${rawText.length} chars`);
    console.log(
      `     Regions: ${allBboxes.length} (avg confidence: ${(avgConfidence * 100).toFixed(1)}%)`
    );
    if (isMultiPage) {
      console.log(`     Pages: ${imagePaths.length}`);
    }
    console.log(`     Cost: ${totalCost.toFixed(2)} yen`);

    return {
      success: true,
      extractionResultId: dbResult.id,
      tool: 'cloud-vision',
      rawText,
      confidence: avgConfidence,
      processingTime,
      cost: totalCost,
    };
  } catch (error) {
    console.error(`  Cloud Vision failed:`, error);
    throw error;
  } finally {
    // Clean up temporary images if PDF was converted
    if (tempImagePaths.length > 0) {
      console.log(`  Cleaning up temporary images...`);
      cleanupTempImages(tempImagePaths);
    }
  }
}
