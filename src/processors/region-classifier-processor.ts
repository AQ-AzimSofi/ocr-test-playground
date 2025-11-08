import { azureDocumentClient } from '../lib/azure-document-client.js';
import { geminiClient } from '../lib/gemini-client.js';
import { db, extractionResults } from '../db/index.js';
import { cropImageRegion, CropRegion } from '../utils/image-cropper.js';

/**
 * Process drawing using Azure Layout with region-based classification
 * Routes different types of content to optimal processors:
 * - High confidence regions: Keep Azure Layout results
 * - Low confidence regions: Re-process with Gemini
 * - Tables: Keep structured data from Azure Layout
 */
export async function processWithRegionClassifier(imagePath: string, drawingId: string) {
  console.log(`  Processing with Region Classifier...`);
  const startTime = Date.now();

  try {
    // Step 1: Run Azure Layout for structure analysis
    console.log(`  Running Azure Layout (structure analysis)...`);
    const layoutResult = await azureDocumentClient.analyzeLayout(imagePath);

    console.log(`  Azure Layout found: ${layoutResult.lines.length} lines, ${(layoutResult.tables || []).length} tables`);

    // Group lines into regions by proximity
    // For simplicity, we'll use lines as individual regions
    const regions = layoutResult.lines.map((line: any, index: number) => ({
      text: line.text,
      bounds: line.bounds,
      confidence: line.confidence || 0.85, // Azure Layout doesn't always provide line confidence
      index,
      type: 'text' as const,
    }));

    // Classify regions based on confidence
    const confidenceThreshold = 0.85;
    const highConfidenceRegions = regions.filter(r => r.confidence >= confidenceThreshold);
    const lowConfidenceRegions = regions.filter(r => r.confidence < confidenceThreshold);

    console.log(`  Classification:`);
    console.log(`     High confidence: ${highConfidenceRegions.length} regions`);
    console.log(`     Low confidence: ${lowConfidenceRegions.length} regions (will re-process with Gemini)`);

    // Step 2: Process low-confidence regions with Gemini
    let geminiProcessedCount = 0;
    const regionUpdates = new Map<number, string>();

    if (lowConfidenceRegions.length > 0) {
      console.log(`  Re-processing ${lowConfidenceRegions.length} low-confidence regions with Gemini...`);

      // Crop low-confidence regions
      const cropRegions: CropRegion[] = lowConfidenceRegions.map(region => ({
        bounds: region.bounds,
        text: region.text,
        confidence: region.confidence,
        index: region.index,
      }));

      // Batch crop regions
      const croppedRegions = await Promise.all(
        cropRegions.map(region => cropImageRegion(imagePath, region, 10))
      );

      // Batch process with Gemini
      const geminiResults = await geminiClient.batchExtractTextFromRegions(
        croppedRegions.map(cropped => ({
          base64: cropped.base64,
          originalText: cropped.region.text,
        }))
      );

      // Update regions with Gemini results
      for (let i = 0; i < geminiResults.length; i++) {
        const regionIndex = cropRegions[i].index;
        const geminiText = geminiResults[i].text;

        if (geminiText && geminiText !== cropRegions[i].text) {
          regionUpdates.set(regionIndex, geminiText);
          geminiProcessedCount++;
        }
      }

      console.log(`  Updated ${geminiProcessedCount} regions with Gemini corrections`);
    }

    // Step 3: Build final bounding boxes
    const finalBboxes = regions.map(region => {
      const updatedText = regionUpdates.get(region.index);

      return {
        text: updatedText || region.text,
        bounds: region.bounds,
        confidence: updatedText ? 0.95 : region.confidence, // Higher confidence for Gemini-corrected
        bboxSource: updatedText ? ('ocr' as const) : ('ocr' as const), // Both from OCR, just Gemini-enhanced
        metadata: updatedText
          ? {
              geminiCorrected: true,
              originalText: region.text,
              regionType: region.type,
            }
          : {
              regionType: region.type,
            },
      };
    });

    // Step 4: Build final text
    // Sort regions by position (top to bottom, left to right)
    const sortedRegions = [...regions].sort((a, b) => {
      const aTop = Math.min(...a.bounds.map((p: any) => p.y));
      const bTop = Math.min(...b.bounds.map((p: any) => p.y));
      if (Math.abs(aTop - bTop) < 20) {
        const aLeft = Math.min(...a.bounds.map((p: any) => p.x));
        const bLeft = Math.min(...b.bounds.map((p: any) => p.x));
        return aLeft - bLeft;
      }
      return aTop - bTop;
    });

    const finalText = sortedRegions
      .map(region => regionUpdates.get(region.index) || region.text)
      .join('\n');

    // Step 5: Calculate costs
    const processingTime = Date.now() - startTime;
    const azureCost = azureDocumentClient.estimateCost(layoutResult.pages.length, 'layout');
    const geminiRegionCost = geminiClient.estimateCost(geminiProcessedCount, true);
    const totalCost = azureCost + geminiRegionCost;

    // Save to database
    const [dbResult] = await db
      .insert(extractionResults)
      .values({
        drawingId,
        tool: 'region-classifier',
        rawText: finalText,
        boundingBoxes: finalBboxes,
        processingTimeMs: processingTime,
        apiCost: totalCost,
        metadata: {
          model: 'azure-layout-gemini-hybrid',
          totalRegions: regions.length,
          highConfidenceRegions: highConfidenceRegions.length,
          lowConfidenceRegions: lowConfidenceRegions.length,
          geminiProcessedCount,
          confidenceThreshold,
          tableCount: (layoutResult.tables || []).length,
        },
      })
      .returning();

    console.log(`  Region Classifier completed in ${(processingTime / 1000).toFixed(2)}s`);
    console.log(`     Extracted ${finalText.length} characters from ${regions.length} regions`);
    console.log(`     Gemini enhanced ${geminiProcessedCount} regions`);

    return {
      success: true,
      extractionResultId: dbResult.id,
      tool: 'region-classifier',
      rawText: finalText,
      boundingBoxes: finalBboxes,
      processingTime,
      cost: totalCost,
      metadata: {
        totalRegions: regions.length,
        geminiProcessedCount,
      },
    };
  } catch (error) {
    console.error(`  Region Classifier failed:`, error);
    throw error;
  }
}
