import { createTool } from '@mastra/core';
import { z } from 'zod';
import {
  calculateCER,
  calculateCharacterAccuracy,
  calculateCharacterSetCoverage,
  calculateExactCharacterCount,
  calculateLevenshteinDistance,
  calculateOrderIndependentCER,
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
    // Character Error Rate (industry standard) - position-sensitive
    characterErrorRate: z.number(),

    // Order-Independent Character Error Rate - content completeness
    orderIndependentCER: z.number(),
    orderIndependentAccuracy: z.number(),
    orderIndependentEditDistance: z.number(),

    // Character-level metrics
    characterAccuracy: z.number(),
    characterSetCoverage: z.number(),

    // Character count metrics
    extractedCharCount: z.number(),
    groundTruthCharCount: z.number(),
    exactCharCountMatch: z.boolean(),
    charCountDifference: z.number(),

    // Order-independent character counts (after whitespace removal)
    normalizedExtractedLength: z.number(),
    normalizedGroundTruthLength: z.number(),

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

    // Order-independent character analysis
    orderIndependentCharAnalysis: z.object({
      missingCharacters: z.record(z.number()), // char -> count
      extraCharacters: z.record(z.number()), // char -> count
      missingTotal: z.number(),
      extraTotal: z.number(),
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

    // Calculate order-independent metrics
    const orderIndependentMetrics = calculateOrderIndependentCER(
      normalizedExtracted,
      normalizedGroundTruth
    );

    // Generate character-level differences (limited for performance)
    // For very large texts, limit to prevent memory issues
    const maxLength = Math.max(
      normalizedExtracted.length,
      normalizedGroundTruth.length
    );
    const isLargeText = maxLength > 10000;
    const maxDifferences = isLargeText ? 50 : 100; // Fewer samples for large texts

    const characterDifferences: Array<{
      position: number;
      expected: string;
      actual: string;
    }> = [];

    let diffCount = 0;

    // For large texts, sample differences instead of checking every character
    if (isLargeText) {
      const sampleRate = Math.ceil(maxLength / 1000); // Sample ~1000 positions max
      for (let i = 0; i < maxLength && diffCount < maxDifferences; i += sampleRate) {
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
    } else {
      // For normal texts, check every character
      for (let i = 0; i < maxLength && diffCount < maxDifferences; i++) {
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
    }

    // Calculate order-independent character frequency analysis
    const orderIndependentCharAnalysis = calculateCharacterFrequencyDifferences(
      normalizedExtracted,
      normalizedGroundTruth
    );

    // Generate summary
    const summaryLines = [
      `Character Error Rate (position-sensitive): ${(characterErrorRate * 100).toFixed(2)}%`,
      `Order-Independent CER: ${(orderIndependentMetrics.cer * 100).toFixed(2)}%`,
      `Order-Independent Accuracy: ${orderIndependentMetrics.accuracy.toFixed(2)}%`,
      `Character Accuracy: ${characterAccuracy.toFixed(2)}%`,
      `Character Set Coverage: ${characterSetCoverage.toFixed(2)}%`,
      `Edit Distance: ${editDistance}`,
      `Order-Independent Edit Distance: ${orderIndependentMetrics.editDistance}`,
      `Character Count: ${charCount.extractedCount}/${charCount.groundTruthCount} ${
        charCount.matches ? 'match' : 'mismatch'
      }`,
      `Normalized Length (no whitespace): ${orderIndependentMetrics.normalizedExtractedLength}/${orderIndependentMetrics.normalizedGroundTruthLength}`,
      characterDifferences.length > 0
        ? `Found ${characterDifferences.length}${diffCount >= maxDifferences ? '+' : ''} character differences`
        : 'Perfect match!',
    ];

    // Add note about memory-efficient mode for large texts
    if (isLargeText) {
      summaryLines.push(
        `Note: Large text detected (${maxLength} chars) - using memory-efficient sampling mode`
      );
    }

    const summary = summaryLines.join('\n');

    return {
      characterErrorRate: Math.round(characterErrorRate * 10000) / 10000, // 4 decimal places
      orderIndependentCER: orderIndependentMetrics.cer,
      orderIndependentAccuracy: orderIndependentMetrics.accuracy,
      orderIndependentEditDistance: orderIndependentMetrics.editDistance,
      characterAccuracy: Math.round(characterAccuracy * 100) / 100, // 2 decimal places
      characterSetCoverage: Math.round(characterSetCoverage * 100) / 100, // 2 decimal places
      extractedCharCount: charCount.extractedCount,
      groundTruthCharCount: charCount.groundTruthCount,
      exactCharCountMatch: charCount.matches,
      charCountDifference: charCount.difference,
      normalizedExtractedLength: orderIndependentMetrics.normalizedExtractedLength,
      normalizedGroundTruthLength:
        orderIndependentMetrics.normalizedGroundTruthLength,
      editDistance,
      avgConfidenceScore: confidenceScore,
      bboxSourceStats,
      breakdown: {
        extractedText: normalizedExtracted,
        groundTruthText: normalizedGroundTruth,
        characterDifferences,
        summary,
      },
      orderIndependentCharAnalysis,
    };
  },
});

/**
 * Calculate character frequency differences (order-independent)
 * Returns missing and extra characters with their counts
 */
function calculateCharacterFrequencyDifferences(
  extracted: string,
  groundTruth: string
): {
  missingCharacters: Record<string, number>;
  extraCharacters: Record<string, number>;
  missingTotal: number;
  extraTotal: number;
} {
  // Remove whitespace for order-independent comparison
  const extractedNoSpace = extracted.replace(/\s+/g, '');
  const groundTruthNoSpace = groundTruth.replace(/\s+/g, '');

  // Count character frequencies
  const extractedFreq = new Map<string, number>();
  const groundTruthFreq = new Map<string, number>();

  for (const char of extractedNoSpace) {
    extractedFreq.set(char, (extractedFreq.get(char) || 0) + 1);
  }

  for (const char of groundTruthNoSpace) {
    groundTruthFreq.set(char, (groundTruthFreq.get(char) || 0) + 1);
  }

  // Find missing characters (in ground truth but not enough in extracted)
  const missingCharacters: Record<string, number> = {};
  let missingTotal = 0;

  for (const [char, gtCount] of groundTruthFreq) {
    const exCount = extractedFreq.get(char) || 0;
    if (exCount < gtCount) {
      const diff = gtCount - exCount;
      missingCharacters[char] = diff;
      missingTotal += diff;
    }
  }

  // Find extra characters (in extracted but not in ground truth, or too many)
  const extraCharacters: Record<string, number> = {};
  let extraTotal = 0;

  for (const [char, exCount] of extractedFreq) {
    const gtCount = groundTruthFreq.get(char) || 0;
    if (exCount > gtCount) {
      const diff = exCount - gtCount;
      extraCharacters[char] = diff;
      extraTotal += diff;
    }
  }

  return {
    missingCharacters,
    extraCharacters,
    missingTotal,
    extraTotal,
  };
}
