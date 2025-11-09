import { geminiClient } from '../../lib/gemini-client.js';
import { azureDocumentClient } from '../../lib/azure-document-client.js';
import { db, extractionResults } from '../../db/index.js';
import { cropImageRegion, CropRegion } from '../../utils/image-cropper.js';

/**
 * EXPERIMENTAL: Region Detection + Gemini Processor
 *
 * Strategy:
 * 1. Use Azure Layout to detect text regions (lines/paragraphs)
 * 2. Crop each detected region
 * 3. Gemini extracts text from each region
 * 4. Combine: Precise region bboxes (from Azure) + Accurate text (from Gemini)
 *
 * FUTURE ENHANCEMENT:
 * - Can be enhanced with CRAFT (Character Region Awareness For Text detection)
 * - Or PaddleOCR's text detection module
 * - These are better at detecting text regions (not reading them)
 * - Would catch regions that Azure might miss
 *
 * Current implementation uses Azure Layout as region detector:
 * - Pros: Already available, no new dependencies
 * - Cons: If Azure misses a text region, Gemini won't see it
 */
export async function processWithGeminiRegionDetection(
  imagePath: string,
  drawingId: string
) {
  console.log(`  🧪 EXPERIMENT: Region Detection Processor`);
  const startTime = Date.now();

  try {
    // Step 1: Use Azure Layout to detect text regions
    console.log(`  📄 Running Azure Layout for region detection...`);
    const layoutResult = await azureDocumentClient.analyzeLayout(imagePath);

    console.log(
      `  📊 Azure Layout detected ${layoutResult.lines.length} line regions`
    );

    // Convert lines to crop regions
    const regions: CropRegion[] = layoutResult.lines.map((line, index) => ({
      bounds: line.bounds,
      text: line.text, // Original Azure text (for comparison)
      confidence: line.confidence,
      index,
    }));

    // Step 2: Also run Gemini on full image to catch anything Azure missed
    console.log(`  📡 Running Gemini on full image as backup...`);
    const fullImageGemini = await geminiClient.extractText(imagePath);

    // Step 3: Crop each region
    console.log(`  ✂️  Cropping ${regions.length} regions...`);
    const croppedRegions = await Promise.all(
      regions.map((region) => cropImageRegion(imagePath, region, 5))
    );

    // Step 4: Gemini extracts text from each region
    console.log(
      `  📡 Gemini extracting text from ${croppedRegions.length} regions...`
    );
    const geminiResults = await geminiClient.batchExtractTextFromRegions(
      croppedRegions.map((cropped) => ({
        base64: cropped.base64,
        originalText: cropped.region.text,
      }))
    );

    // Step 5: Build final bboxes
    const finalBboxes = regions.map((region, index) => {
      const geminiText = geminiResults[index].text;
      const azureText = region.text;

      return {
        text: geminiText || azureText, // Prefer Gemini, fallback to Azure
        bounds: region.bounds,
        confidence: geminiResults[index].confidence,
        bboxSource: 'ocr' as const, // Region bbox from Azure (precise)
        metadata: {
          regionIndex: index,
          azureOriginalText: azureText,
          geminiCorrected: geminiText !== azureText,
          detectionSource: 'azure-layout',
        },
      };
    });

    // Step 6: Check if Gemini found text that Azure didn't
    const azureTextSet = new Set(
      layoutResult.lines.map((line) => line.text.trim())
    );
    const fullGeminiWords = new Set(
      fullImageGemini.text.split(/\s+/).map((w) => w.trim())
    );

    const potentialMissed = Array.from(fullGeminiWords).filter(
      (word) => word.length > 0 && !azureTextSet.has(word)
    );

    if (potentialMissed.length > 0) {
      console.log(
        `  ⚠️  Gemini found ${potentialMissed.length} words not in Azure regions`
      );
      console.log(
        `     Potentially missed: ${potentialMissed.slice(0, 10).join(', ')}...`
      );
    }

    // Reconstruct full text
    const fullText = finalBboxes.map((b) => b.text).join('\n');

    // Calculate costs
    const processingTime = Date.now() - startTime;
    const azureLayoutCost = azureDocumentClient.estimateCost(
      layoutResult.pages.length,
      'layout'
    );
    const geminiRegionCost = geminiClient.estimateCost(regions.length, true);
    const geminiFullCost = geminiClient.estimateCost(1, false);
    const totalCost = azureLayoutCost + geminiRegionCost + geminiFullCost;

    console.log(
      `  💰 Costs: Azure Layout + ${regions.length} Gemini regions + 1 full image`
    );

    const correctionStats = {
      totalRegions: regions.length,
      geminiCorrected: finalBboxes.filter((b) => b.metadata?.geminiCorrected)
        .length,
      unchanged: finalBboxes.filter((b) => !b.metadata?.geminiCorrected).length,
    };

    // Save to database
    const [dbResult] = await db
      .insert(extractionResults)
      .values({
        drawingId,
        tool: 'exp-gemini-region-detection',
        rawText: fullText,
        boundingBoxes: finalBboxes,
        processingTimeMs: processingTime,
        apiCost: totalCost,
        metadata: {
          experiment: true,
          approach: 'region-detection',
          regionDetector: 'azure-layout',
          regionsDetected: regions.length,
          correctionStats,
          potentiallyMissedWords: potentialMissed.length,
          note: 'Uses Azure Layout for regions. Could be enhanced with CRAFT/PaddleOCR for better detection.',
        },
      })
      .returning();

    console.log(
      `  ✅ Region Detection completed in ${(processingTime / 1000).toFixed(2)}s`
    );
    console.log(`     Processed ${regions.length} regions`);
    console.log(
      `     Gemini corrected ${correctionStats.geminiCorrected} regions`
    );
    console.log(`     Unchanged ${correctionStats.unchanged} regions`);

    return {
      success: true,
      extractionResultId: dbResult.id,
      tool: 'exp-gemini-region-detection',
      rawText: fullText,
      boundingBoxes: finalBboxes,
      processingTime,
      cost: totalCost,
      metadata: {
        correctionStats,
        potentiallyMissedWords: potentialMissed.length,
      },
    };
  } catch (error) {
    console.error(`  ❌ Region Detection failed:`, error);
    throw error;
  }
}
