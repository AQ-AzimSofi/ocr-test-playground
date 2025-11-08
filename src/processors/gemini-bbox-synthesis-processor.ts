import { geminiClient } from '../lib/gemini-client.js';
import { cloudVisionClient } from '../lib/cloud-vision-client.js';
import { db, extractionResults } from '../db/index.js';
import sharp from 'sharp';
import {
  fuzzyMatchTextToBbox,
  calculateAverageCharDimensions,
  synthesizeBboxForText,
  BoundingBox,
} from '../utils/bbox-estimator.js';
import { segmentText } from '../utils/gemini-parser.js';

/**
 * Process drawing by combining Gemini text with Cloud Vision bounding boxes
 * Uses fuzzy matching and bbox synthesis for unmatched text
 */
export async function processWithGeminiBboxSynthesis(imagePath: string, drawingId: string) {
  console.log(`  Processing with Gemini Bbox Synthesis...`);
  const startTime = Date.now();

  try {
    // Get image dimensions
    const metadata = await sharp(imagePath).metadata();
    const imageWidth = metadata.width || 1000;
    const imageHeight = metadata.height || 1000;

    // Run both Gemini and Cloud Vision in parallel
    console.log(`  Running Gemini and Cloud Vision in parallel...`);
    const [geminiResult, cloudVisionBboxes] = await Promise.all([
      geminiClient.extractText(imagePath),
      cloudVisionClient.extractTextWithBoundingBoxes(imagePath),
    ]);

    console.log(`  Gemini extracted: ${geminiResult.text.length} chars`);
    console.log(`  Cloud Vision found: ${cloudVisionBboxes.length} bboxes`);

    // Convert Cloud Vision bboxes to our internal format
    const cvBboxes: BoundingBox[] = cloudVisionBboxes.map(bbox => ({
      bounds: bbox.bounds,
      text: bbox.text,
      confidence: bbox.confidence,
    }));

    // Segment Gemini text into matchable units (words/characters)
    const geminiSegments = segmentText(geminiResult.text, 'word');

    console.log(`  Matching ${geminiSegments.length} Gemini segments to Cloud Vision bboxes...`);

    const matchedBboxes: Array<{
      text: string;
      bounds: Array<{ x: number; y: number }>;
      confidence: number;
      bboxSource: 'ocr' | 'estimated' | 'synthesized';
      metadata?: any;
    }> = [];

    const unmatchedSegments: string[] = [];
    const matchedSegmentIndices = new Set<number>();

    // First pass: Match Gemini segments to Cloud Vision bboxes
    for (let i = 0; i < geminiSegments.length; i++) {
      const segment = geminiSegments[i];

      // Skip whitespace-only segments
      if (!segment.trim()) continue;

      // Try to find matching bbox
      const match = fuzzyMatchTextToBbox(segment, cvBboxes, 0.6);

      if (match) {
        matchedBboxes.push({
          text: segment,
          bounds: match.bbox.bounds,
          confidence: match.bbox.confidence || 0.8,
          bboxSource: 'ocr',
          metadata: {
            fuzzyMatch: true,
            similarity: match.similarity,
            originalCVText: match.matchedText,
          },
        });
        matchedSegmentIndices.add(i);
      } else {
        unmatchedSegments.push(segment);
      }
    }

    console.log(`  Matched: ${matchedBboxes.length} segments`);
    console.log(`  Unmatched: ${unmatchedSegments.length} segments`);

    // Second pass: Synthesize bboxes for unmatched segments
    if (unmatchedSegments.length > 0 && cvBboxes.length > 0) {
      console.log(`  Synthesizing bboxes for unmatched segments...`);

      const charDimensions = calculateAverageCharDimensions(cvBboxes);

      for (const unmatchedText of unmatchedSegments) {
        // Synthesize bbox based on available context
        const synthesizedBbox = synthesizeBboxForText(
          unmatchedText,
          cvBboxes,
          undefined, // No estimated position
          imageWidth,
          imageHeight
        );

        matchedBboxes.push({
          text: unmatchedText,
          bounds: synthesizedBbox.bounds,
          confidence: synthesizedBbox.confidence || 0.5,
          bboxSource: 'synthesized',
          metadata: {
            synthesized: true,
            basedOnAvgCharDimensions: charDimensions,
          },
        });
      }

      console.log(`  Synthesized ${unmatchedSegments.length} bboxes`);
    }

    // If no Cloud Vision bboxes available, create estimated bboxes for all Gemini text
    if (cvBboxes.length === 0 && geminiSegments.length > 0) {
      console.log(`  No Cloud Vision bboxes available, estimating all bboxes...`);

      const defaultCharDimensions = {
        avgWidth: 20,
        avgHeight: 30,
        medianWidth: 20,
        medianHeight: 30,
      };

      for (const segment of geminiSegments) {
        if (!segment.trim()) continue;

        const estimatedBbox = synthesizeBboxForText(
          segment,
          [],
          undefined,
          imageWidth,
          imageHeight
        );

        matchedBboxes.push({
          text: segment,
          bounds: estimatedBbox.bounds,
          confidence: 0.4,
          bboxSource: 'estimated',
          metadata: {
            estimated: true,
            reason: 'no_cloud_vision_bboxes',
          },
        });
      }
    }

    // Combine costs
    const processingTime = Date.now() - startTime;
    const geminiCost = geminiClient.estimateCost(1);
    const cloudVisionCost = cloudVisionClient.estimateCost(1);
    const totalCost = geminiCost + cloudVisionCost;

    // Count bbox sources
    const bboxSourceCounts = {
      ocr: matchedBboxes.filter(b => b.bboxSource === 'ocr').length,
      synthesized: matchedBboxes.filter(b => b.bboxSource === 'synthesized').length,
      estimated: matchedBboxes.filter(b => b.bboxSource === 'estimated').length,
    };

    // Save to database
    const [dbResult] = await db
      .insert(extractionResults)
      .values({
        drawingId,
        tool: 'gemini-bbox-synthesis',
        rawText: geminiResult.text,
        boundingBoxes: matchedBboxes,
        processingTimeMs: processingTime,
        apiCost: totalCost,
        metadata: {
          geminiSegments: geminiSegments.length,
          cloudVisionBboxes: cvBboxes.length,
          matchedBboxes: matchedBboxes.length,
          bboxSourceCounts,
          unmatchedSegments: unmatchedSegments.length,
        },
      })
      .returning();

    console.log(`  Gemini Bbox Synthesis completed in ${(processingTime / 1000).toFixed(2)}s`);
    console.log(`     Extracted ${geminiResult.text.length} characters`);
    console.log(
      `     Generated ${matchedBboxes.length} bboxes (${bboxSourceCounts.ocr} OCR, ${bboxSourceCounts.synthesized} synthesized, ${bboxSourceCounts.estimated} estimated)`
    );

    return {
      success: true,
      extractionResultId: dbResult.id,
      tool: 'gemini-bbox-synthesis',
      rawText: geminiResult.text,
      boundingBoxes: matchedBboxes,
      processingTime,
      cost: totalCost,
      metadata: {
        bboxSourceCounts,
        unmatchedSegments: unmatchedSegments.length,
      },
    };
  } catch (error) {
    console.error(`  Gemini Bbox Synthesis failed:`, error);
    throw error;
  }
}
