import { geminiClient } from '../../lib/gemini-client.js';
import { cloudVisionClient } from '../../lib/cloud-vision-client.js';
import { azureDocumentClient } from '../../lib/azure-document-client.js';
import { db, extractionResults } from '../../db/index.js';
import sharp from 'sharp';
import {
  fuzzyMatchTextToBbox,
  BoundingBox,
  synthesizeBboxForText,
} from '../../utils/bbox-estimator.js';
import { segmentText } from '../../utils/gemini-parser.js';

/**
 * EXPERIMENTAL: Multi-OCR Fusion Processor
 *
 * Strategy:
 * 1. Run ALL OCR tools in parallel (Cloud Vision, Azure Read, Azure Layout, Gemini)
 * 2. Gemini provides superior text detection
 * 3. For each Gemini text segment:
 *    a. Try to match with Cloud Vision bboxes (paragraph-level)
 *    b. If no match, try Azure Read bboxes (word-level)
 *    c. If no match, try Azure Layout bboxes (line-level)
 *    d. If still no match, synthesize bbox based on all available data
 * 4. Result: Gemini's text completeness + best available bbox precision
 */
export async function processWithGeminiMultiOCRFusion(
  imagePath: string,
  drawingId: string
) {
  console.log(`  🧪 EXPERIMENT: Multi-OCR Fusion Processor`);
  const startTime = Date.now();

  try {
    // Get image dimensions
    const metadata = await sharp(imagePath).metadata();
    const imageWidth = metadata.width || 1000;
    const imageHeight = metadata.height || 1000;

    // Run ALL OCR tools in parallel
    console.log(
      `  📡 Running Gemini + Cloud Vision + Azure Read + Azure Layout...`
    );
    const [
      geminiResult,
      cloudVisionBboxes,
      azureReadResult,
      azureLayoutResult,
    ] = await Promise.all([
      geminiClient.extractText(imagePath),
      cloudVisionClient.extractTextWithBoundingBoxes(imagePath),
      azureDocumentClient.analyzeRead(imagePath),
      azureDocumentClient.analyzeLayout(imagePath),
    ]);

    console.log(`  📊 Gemini: ${geminiResult.text.length} chars`);
    console.log(
      `  📊 Cloud Vision: ${cloudVisionBboxes.length} paragraph bboxes`
    );
    console.log(`  📊 Azure Read: ${azureReadResult.words.length} word bboxes`);
    console.log(
      `  📊 Azure Layout: ${azureLayoutResult.lines.length} line bboxes`
    );

    // Convert all bboxes to internal format
    const cvBboxes: BoundingBox[] = cloudVisionBboxes.map((bbox) => ({
      bounds: bbox.bounds,
      text: bbox.text,
      confidence: bbox.confidence,
    }));

    const azureReadBboxes: BoundingBox[] = azureReadResult.words.map(
      (word) => ({
        bounds: word.bounds,
        text: word.text,
        confidence: word.confidence,
      })
    );

    const azureLayoutBboxes: BoundingBox[] = azureLayoutResult.lines.map(
      (line) => ({
        bounds: line.bounds,
        text: line.text,
        confidence: line.confidence,
      })
    );

    // Combine all bboxes into one pool
    const allBboxes = [...cvBboxes, ...azureReadBboxes, ...azureLayoutBboxes];

    console.log(
      `  📦 Total bbox pool: ${allBboxes.length} bboxes from 3 sources`
    );

    // Segment Gemini text for matching
    const geminiSegments = segmentText(geminiResult.text, 'word');
    console.log(
      `  🔍 Matching ${geminiSegments.length} Gemini segments to bbox pool...`
    );

    const finalBboxes: Array<{
      text: string;
      bounds: Array<{ x: number; y: number }>;
      confidence: number;
      bboxSource: 'ocr' | 'estimated';
      metadata?: any;
    }> = [];

    const matchStats = {
      cloudVision: 0,
      azureRead: 0,
      azureLayout: 0,
      estimated: 0,
    };

    // Multi-source matching with priority
    for (const segment of geminiSegments) {
      if (!segment.trim()) continue;

      let bestMatch: {
        bbox: BoundingBox;
        similarity: number;
        source: 'cloud-vision' | 'azure-read' | 'azure-layout';
      } | null = null;

      // Try Cloud Vision first (paragraph-level, good for context)
      const cvMatch = fuzzyMatchTextToBbox(segment, cvBboxes, 0.65);
      if (cvMatch) {
        bestMatch = {
          bbox: cvMatch.bbox,
          similarity: cvMatch.similarity,
          source: 'cloud-vision',
        };
      }

      // Try Azure Read (word-level, precise)
      const azureReadMatch = fuzzyMatchTextToBbox(
        segment,
        azureReadBboxes,
        0.65
      );
      if (
        azureReadMatch &&
        (!bestMatch || azureReadMatch.similarity > bestMatch.similarity)
      ) {
        bestMatch = {
          bbox: azureReadMatch.bbox,
          similarity: azureReadMatch.similarity,
          source: 'azure-read',
        };
      }

      // Try Azure Layout (line-level)
      const azureLayoutMatch = fuzzyMatchTextToBbox(
        segment,
        azureLayoutBboxes,
        0.65
      );
      if (
        azureLayoutMatch &&
        (!bestMatch || azureLayoutMatch.similarity > bestMatch.similarity)
      ) {
        bestMatch = {
          bbox: azureLayoutMatch.bbox,
          similarity: azureLayoutMatch.similarity,
          source: 'azure-layout',
        };
      }

      if (bestMatch) {
        // Found a match in at least one source
        finalBboxes.push({
          text: segment,
          bounds: bestMatch.bbox.bounds,
          confidence: bestMatch.bbox.confidence || 0.8,
          bboxSource: 'ocr',
          metadata: {
            matchMethod: 'fuzzy-multi-source',
            source: bestMatch.source,
            similarity: bestMatch.similarity,
            originalText: bestMatch.bbox.text,
          },
        });

        // Map source name to matchStats key
        const sourceKey =
          bestMatch.source === 'cloud-vision'
            ? 'cloudVision'
            : bestMatch.source === 'azure-read'
              ? 'azureRead'
              : 'azureLayout';
        matchStats[sourceKey]++;
      } else {
        // No match in any source - synthesize bbox
        const synthesizedBbox = synthesizeBboxForText(
          segment,
          allBboxes,
          undefined,
          imageWidth,
          imageHeight
        );

        finalBboxes.push({
          text: segment,
          bounds: synthesizedBbox.bounds,
          confidence: synthesizedBbox.confidence || 0.5,
          bboxSource: 'estimated',
          metadata: {
            matchMethod: 'synthesis',
            reason: 'no-match-in-any-source',
          },
        });

        matchStats.estimated++;
      }
    }

    console.log(`  ✅ Multi-source matching completed:`);
    console.log(`     - ${matchStats.cloudVision} from Cloud Vision`);
    console.log(`     - ${matchStats.azureRead} from Azure Read`);
    console.log(`     - ${matchStats.azureLayout} from Azure Layout`);
    console.log(`     - ${matchStats.estimated} synthesized`);

    // Calculate costs
    const processingTime = Date.now() - startTime;
    const geminiCost = geminiClient.estimateCost(1);
    const cloudVisionCost = cloudVisionClient.estimateCost(1);
    const azureReadCost = azureDocumentClient.estimateCost(
      azureReadResult.pages.length,
      'read'
    );
    const azureLayoutCost = azureDocumentClient.estimateCost(
      azureLayoutResult.pages.length,
      'layout'
    );
    const totalCost =
      geminiCost + cloudVisionCost + azureReadCost + azureLayoutCost;

    console.log(
      `  💰 Total cost: ¥${totalCost.toFixed(2)} (Gemini + CV + Azure Read + Azure Layout)`
    );

    const bboxSourceCounts = {
      ocr: finalBboxes.filter((b) => b.bboxSource === 'ocr').length,
      estimated: finalBboxes.filter((b) => b.bboxSource === 'estimated').length,
    };

    // Save to database
    const [dbResult] = await db
      .insert(extractionResults)
      .values({
        drawingId,
        tool: 'exp-gemini-multi-ocr-fusion',
        rawText: geminiResult.text,
        boundingBoxes: finalBboxes,
        processingTimeMs: processingTime,
        apiCost: totalCost,
        metadata: {
          experiment: true,
          approach: 'multi-ocr-fusion',
          geminiSegments: geminiSegments.length,
          ocrSources: {
            cloudVision: cvBboxes.length,
            azureRead: azureReadBboxes.length,
            azureLayout: azureLayoutBboxes.length,
            total: allBboxes.length,
          },
          matchStats,
          bboxSourceCounts,
        },
      })
      .returning();

    console.log(
      `  ✅ Multi-OCR Fusion completed in ${(processingTime / 1000).toFixed(2)}s`
    );
    console.log(
      `     Generated ${finalBboxes.length} bboxes with multi-source fusion`
    );

    return {
      success: true,
      extractionResultId: dbResult.id,
      tool: 'exp-gemini-multi-ocr-fusion',
      rawText: geminiResult.text,
      boundingBoxes: finalBboxes,
      processingTime,
      cost: totalCost,
      metadata: {
        matchStats,
        bboxSourceCounts,
      },
    };
  } catch (error) {
    console.error(`  ❌ Multi-OCR Fusion failed:`, error);
    throw error;
  }
}
