import { geminiClient } from '../../lib/gemini-client.js';
import { cloudVisionClient } from '../../lib/cloud-vision-client.js';
import { db, extractionResults } from '../../db/index.js';
import sharp from 'sharp';
import {
  fuzzyMatchTextToBbox,
  BoundingBox,
  calculateAverageCharDimensions,
  synthesizeBboxForText,
} from '../../utils/bbox-estimator.js';
import { segmentText } from '../../utils/gemini-parser.js';

export async function processWithGeminiTemplateMatching(
  imagePath: string,
  drawingId: string
) {
  console.log(`  EXPERIMENT: Template Matching Processor`);
  const startTime = Date.now();

  try {
    const metadata = await sharp(imagePath).metadata();
    const imageWidth = metadata.width || 1000;
    const imageHeight = metadata.height || 1000;

    console.log(`  Running Gemini + Cloud Vision in parallel...`);
    const [geminiResult, cloudVisionBboxes] = await Promise.all([
      geminiClient.extractText(imagePath),
      cloudVisionClient.extractTextWithBoundingBoxes(imagePath),
    ]);

    console.log(`  Gemini extracted: ${geminiResult.text.length} chars`);
    console.log(`  Cloud Vision found: ${cloudVisionBboxes.length} bboxes`);

    const cvBboxes: BoundingBox[] = cloudVisionBboxes.map((bbox) => ({
      bounds: bbox.bounds,
      text: bbox.text,
      confidence: bbox.confidence,
    }));

    const geminiSegments = segmentText(geminiResult.text, 'word');
    console.log(`  Matching ${geminiSegments.length} Gemini segments...`);

    const finalBboxes: Array<{
      text: string;
      bounds: Array<{ x: number; y: number }>;
      confidence: number;
      bboxSource: 'ocr' | 'template-match' | 'spatial-search' | 'estimated';
      metadata?: any;
    }> = [];

    const unmatchedSegments: Array<{
      text: string;
      index: number;
    }> = [];

    for (let i = 0; i < geminiSegments.length; i++) {
      const segment = geminiSegments[i];
      if (!segment.trim()) continue;

      const match = fuzzyMatchTextToBbox(segment, cvBboxes, 0.65);

      if (match) {
        finalBboxes.push({
          text: segment,
          bounds: match.bbox.bounds,
          confidence: match.bbox.confidence || 0.8,
          bboxSource: 'ocr',
          metadata: {
            matchMethod: 'fuzzy-text',
            similarity: match.similarity,
            originalCVText: match.matchedText,
          },
        });
      } else {
        unmatchedSegments.push({ text: segment, index: i });
      }
    }

    console.log(`  Fuzzy matched: ${finalBboxes.length} segments`);
    console.log(`  Unmatched: ${unmatchedSegments.length} segments`);

    if (unmatchedSegments.length > 0 && finalBboxes.length > 0) {
      console.log(`  Performing spatial search for unmatched segments...`);

      const charDimensions = calculateAverageCharDimensions(cvBboxes);

      for (const unmatched of unmatchedSegments) {
        const unmatchedIndex = unmatched.index;

        let beforeMatch: (typeof finalBboxes)[0] | null = null;
        let afterMatch: (typeof finalBboxes)[0] | null = null;

        for (let i = unmatchedIndex - 1; i >= 0; i--) {
          const segment = geminiSegments[i];
          const found = finalBboxes.find((b) => b.text === segment);
          if (found) {
            beforeMatch = found;
            break;
          }
        }

        for (let i = unmatchedIndex + 1; i < geminiSegments.length; i++) {
          const segment = geminiSegments[i];
          const found = finalBboxes.find((b) => b.text === segment);
          if (found) {
            afterMatch = found;
            break;
          }
        }

        let estimatedBbox: BoundingBox;

        if (beforeMatch && afterMatch) {
          const beforeCentroid = {
            x: (beforeMatch.bounds[0].x + beforeMatch.bounds[1].x) / 2,
            y: (beforeMatch.bounds[0].y + beforeMatch.bounds[2].y) / 2,
          };
          const afterCentroid = {
            x: (afterMatch.bounds[0].x + afterMatch.bounds[1].x) / 2,
            y: (afterMatch.bounds[0].y + afterMatch.bounds[2].y) / 2,
          };

          const interpolatedX = (beforeCentroid.x + afterCentroid.x) / 2;
          const interpolatedY = (beforeCentroid.y + afterCentroid.y) / 2;

          estimatedBbox = synthesizeBboxForText(
            unmatched.text,
            cvBboxes,
            { x: interpolatedX, y: interpolatedY },
            imageWidth,
            imageHeight
          );

          finalBboxes.push({
            text: unmatched.text,
            bounds: estimatedBbox.bounds,
            confidence: 0.6,
            bboxSource: 'spatial-search',
            metadata: {
              matchMethod: 'interpolation',
              neighbors: {
                before: beforeMatch.text,
                after: afterMatch.text,
              },
            },
          });
        } else if (beforeMatch) {
          estimatedBbox = synthesizeBboxForText(
            unmatched.text,
            [
              {
                bounds: beforeMatch.bounds,
                text: beforeMatch.text,
                confidence: beforeMatch.confidence,
              },
            ],
            undefined,
            imageWidth,
            imageHeight
          );

          finalBboxes.push({
            text: unmatched.text,
            bounds: estimatedBbox.bounds,
            confidence: 0.5,
            bboxSource: 'estimated',
            metadata: {
              matchMethod: 'extrapolation-after',
              neighbor: beforeMatch.text,
            },
          });
        } else if (afterMatch) {
          estimatedBbox = synthesizeBboxForText(
            unmatched.text,
            [
              {
                bounds: afterMatch.bounds,
                text: afterMatch.text,
                confidence: afterMatch.confidence,
              },
            ],
            undefined,
            imageWidth,
            imageHeight
          );

          finalBboxes.push({
            text: unmatched.text,
            bounds: estimatedBbox.bounds,
            confidence: 0.5,
            bboxSource: 'estimated',
            metadata: {
              matchMethod: 'extrapolation-before',
              neighbor: afterMatch.text,
            },
          });
        } else {
          estimatedBbox = synthesizeBboxForText(
            unmatched.text,
            cvBboxes,
            undefined,
            imageWidth,
            imageHeight
          );

          finalBboxes.push({
            text: unmatched.text,
            bounds: estimatedBbox.bounds,
            confidence: 0.4,
            bboxSource: 'estimated',
            metadata: {
              matchMethod: 'general-synthesis',
            },
          });
        }
      }

      console.log(`  Spatial search completed`);
    }

    const processingTime = Date.now() - startTime;
    const geminiCost = geminiClient.estimateCost(1);
    const cloudVisionCost = cloudVisionClient.estimateCost(1);
    const totalCost = geminiCost + cloudVisionCost;

    const bboxSourceCounts = {
      ocr: finalBboxes.filter((b) => b.bboxSource === 'ocr').length,
      templateMatch: finalBboxes.filter(
        (b) => b.bboxSource === 'template-match'
      ).length,
      spatialSearch: finalBboxes.filter(
        (b) => b.bboxSource === 'spatial-search'
      ).length,
      estimated: finalBboxes.filter((b) => b.bboxSource === 'estimated').length,
    };

    const [dbResult] = await db
      .insert(extractionResults)
      .values({
        drawingId,
        tool: 'exp-gemini-template-matching',
        rawText: geminiResult.text,
        boundingBoxes: finalBboxes,
        processingTimeMs: processingTime,
        apiCost: totalCost,
        metadata: {
          experiment: true,
          approach: 'template-matching',
          geminiSegments: geminiSegments.length,
          cloudVisionBboxes: cvBboxes.length,
          bboxSourceCounts,
          unmatchedSegments: unmatchedSegments.length,
          note: 'Uses fuzzy matching + spatial search. Full template matching requires OpenCV.',
        },
      })
      .returning();

    console.log(
      `  Template Matching completed in ${(processingTime / 1000).toFixed(2)}s`
    );
    console.log(`     Generated ${finalBboxes.length} bboxes:`);
    console.log(`       - ${bboxSourceCounts.ocr} from OCR match`);
    console.log(
      `       - ${bboxSourceCounts.spatialSearch} from spatial search`
    );
    console.log(`       - ${bboxSourceCounts.estimated} estimated`);

    return {
      success: true,
      extractionResultId: dbResult.id,
      tool: 'exp-gemini-template-matching',
      rawText: geminiResult.text,
      boundingBoxes: finalBboxes,
      processingTime,
      cost: totalCost,
      metadata: {
        bboxSourceCounts,
      },
    };
  } catch (error) {
    console.error(`  Template Matching failed:`, error);
    throw error;
  }
}
