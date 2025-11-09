import { createTool } from '@mastra/core';
import { z } from 'zod';
import {
  calculateCER,
  calculateCharacterAccuracy,
  calculateCharacterSetCoverage,
  calculateExactCharacterCount,
  calculateLevenshteinDistance,
  normalizeText,
} from '../../lib/utils.js';

/**
 * Tool to calculate character-level OCR accuracy metrics by comparing extracted text with ground truth
 */
export const accuracyCalculatorTool = createTool({
  id: 'accuracy-calculator',
  description:
    'Calculate character-level OCR accuracy metrics by comparing extracted text with ground truth',
  inputSchema: z.object({
    extractedText: z.string(),
    groundTruthText: z.string(),
    confidenceScore: z.number().optional(),
    boundingBoxes: z
      .array(
        z.object({
          text: z.string(),
          bounds: z.array(z.object({ x: z.number(), y: z.number() })),
          confidence: z.number().optional(),
          bboxSource: z
            .enum([
              'ocr',
              'gemini-percentage',
              'estimated',
              'synthesized',
              'spatial-search',
              'template-match',
            ])
            .optional(),
        })
      )
      .optional(),
  }),
  outputSchema: z.object({
    // Character Error Rate (industry standard)
    characterErrorRate: z.number(),

    // Character-level metrics
    characterAccuracy: z.number(),
    characterSetCoverage: z.number(),

    // Character count metrics
    extractedCharCount: z.number(),
    groundTruthCharCount: z.number(),
    exactCharCountMatch: z.boolean(),
    charCountDifference: z.number(),

    // Edit distance
    editDistance: z.number(),

    // Confidence score (if provided by API)
    avgConfidenceScore: z.number().optional(),

    // Bbox source statistics
    bboxSourceStats: z
      .object({
        ocr: z.number().optional(),
        geminiPercentage: z.number().optional(),
        estimated: z.number().optional(),
        synthesized: z.number().optional(),
        spatialSearch: z.number().optional(),
        templateMatch: z.number().optional(),
      })
      .optional(),

    // Detailed breakdown
    breakdown: z.object({
      extractedText: z.string(),
      groundTruthText: z.string(),
      characterDifferences: z.array(
        z.object({
          position: z.number(),
          expected: z.string(),
          actual: z.string(),
        })
      ),
      summary: z.string(),
    }),
  }),
  execute: async ({ context }) => {
    const { extractedText, groundTruthText, confidenceScore, boundingBoxes } =
      context;

    // Normalize both texts
    const normalizedExtracted = normalizeText(extractedText);
    const normalizedGroundTruth = normalizeText(groundTruthText);

    // Calculate bbox source statistics if bboxes provided
    let bboxSourceStats = undefined;
    if (boundingBoxes && boundingBoxes.length > 0) {
      const stats = {
        ocr: 0,
        geminiPercentage: 0,
        estimated: 0,
        synthesized: 0,
        spatialSearch: 0,
        templateMatch: 0,
      };

      for (const bbox of boundingBoxes) {
        if (bbox.bboxSource === 'ocr') {
          stats.ocr++;
        } else if (bbox.bboxSource === 'gemini-percentage') {
          stats.geminiPercentage++;
        } else if (bbox.bboxSource === 'estimated') {
          stats.estimated++;
        } else if (bbox.bboxSource === 'synthesized') {
          stats.synthesized++;
        } else if (bbox.bboxSource === 'spatial-search') {
          stats.spatialSearch++;
        } else if (bbox.bboxSource === 'template-match') {
          stats.templateMatch++;
        }
      }

      bboxSourceStats = {
        ocr: stats.ocr || undefined,
        geminiPercentage: stats.geminiPercentage || undefined,
        estimated: stats.estimated || undefined,
        synthesized: stats.synthesized || undefined,
        spatialSearch: stats.spatialSearch || undefined,
        templateMatch: stats.templateMatch || undefined,
      };
    }

    // Calculate Character Error Rate (CER)
    const characterErrorRate = calculateCER(
      normalizedExtracted,
      normalizedGroundTruth
    );

    // Calculate character-by-character accuracy
    const characterAccuracy = calculateCharacterAccuracy(
      normalizedExtracted,
      normalizedGroundTruth
    );

    // Calculate character set coverage
    const characterSetCoverage = calculateCharacterSetCoverage(
      normalizedExtracted,
      normalizedGroundTruth
    );

    // Calculate exact character count
    const charCount = calculateExactCharacterCount(
      normalizedExtracted,
      normalizedGroundTruth
    );

    // Calculate Levenshtein edit distance
    const editDistance = calculateLevenshteinDistance(
      normalizedExtracted,
      normalizedGroundTruth
    );

    // Generate character-level differences (up to 100 for performance)
    const characterDifferences: Array<{
      position: number;
      expected: string;
      actual: string;
    }> = [];

    const maxLength = Math.max(
      normalizedExtracted.length,
      normalizedGroundTruth.length
    );
    let diffCount = 0;

    for (let i = 0; i < maxLength && diffCount < 100; i++) {
      const expected = normalizedGroundTruth[i] || '(end)';
      const actual = normalizedExtracted[i] || '(end)';

      if (expected !== actual) {
        characterDifferences.push({
          position: i,
          expected,
          actual,
        });
        diffCount++;
      }
    }

    // Generate summary
    const summary = [
      `Character Error Rate: ${(characterErrorRate * 100).toFixed(2)}%`,
      `Character Accuracy: ${characterAccuracy.toFixed(2)}%`,
      `Character Set Coverage: ${characterSetCoverage.toFixed(2)}%`,
      `Edit Distance: ${editDistance}`,
      `Character Count: ${charCount.extractedCount}/${charCount.groundTruthCount} ${
        charCount.matches ? 'match' : 'mismatch'
      }`,
      characterDifferences.length > 0
        ? `Found ${characterDifferences.length}${diffCount >= 100 ? '+' : ''} character differences`
        : 'Perfect match!',
    ].join('\n');

    return {
      characterErrorRate: Math.round(characterErrorRate * 10000) / 10000, // 4 decimal places
      characterAccuracy: Math.round(characterAccuracy * 100) / 100, // 2 decimal places
      characterSetCoverage: Math.round(characterSetCoverage * 100) / 100, // 2 decimal places
      extractedCharCount: charCount.extractedCount,
      groundTruthCharCount: charCount.groundTruthCount,
      exactCharCountMatch: charCount.matches,
      charCountDifference: charCount.difference,
      editDistance,
      avgConfidenceScore: confidenceScore,
      bboxSourceStats,
      breakdown: {
        extractedText: normalizedExtracted,
        groundTruthText: normalizedGroundTruth,
        characterDifferences,
        summary,
      },
    };
  },
});
