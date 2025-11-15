// External imports
import { createTool } from '@mastra/core';
import { z } from 'zod';

// Internal imports
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
      `Position-Sensitive Accuracy: ${((1 - characterErrorRate) * 100).toFixed(2)}%`,
      `Extraction Accuracy ⭐: ${orderIndependentMetrics.accuracy.toFixed(2)}%`,
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
 * Split text into words for source tracking
 * Handles both space-separated and CJK text
 */
function splitIntoWords(text: string): string[] {
  // For CJK text, split on spaces and punctuation, treating continuous CJK as single words
  // For mixed text, split on whitespace and punctuation
  const words: string[] = [];

  // Split on whitespace and common punctuation
  const segments = text.split(/[\s、。，．！？\n\r]+/);

  for (const segment of segments) {
    if (segment.trim().length > 0) {
      words.push(segment.trim());
    }
  }

  return words.filter(w => w.length > 0);
}

/**
 * Calculate character frequency differences (order-independent)
 * Returns missing words, missing characters, and extra characters
 */
function calculateCharacterFrequencyDifferences(
  extracted: string,
  groundTruth: string
): {
  missingWords: string[];
  missingCharacters: Record<string, { count: number; sourceWords: string[] }>;
  extraCharacters: Record<string, number>;
  missingTotal: number;
  extraTotal: number;
} {
  // Split into words for source tracking
  const groundTruthWords = splitIntoWords(groundTruth);
  const extractedWords = splitIntoWords(extracted);

  // Remove whitespace for order-independent comparison
  const extractedNoSpace = extracted.replace(/\s+/g, '');
  const groundTruthNoSpace = groundTruth.replace(/\s+/g, '');

  // Count character frequencies and track source words
  const extractedFreq = new Map<string, number>();
  const groundTruthFreq = new Map<string, number>();
  const groundTruthSources = new Map<string, Set<string>>();
  const extractedSources = new Map<string, Set<string>>();

  // Track ground truth characters and their source words
  for (const word of groundTruthWords) {
    for (const char of word) {
      groundTruthFreq.set(char, (groundTruthFreq.get(char) || 0) + 1);
      if (!groundTruthSources.has(char)) {
        groundTruthSources.set(char, new Set());
      }
      groundTruthSources.get(char)!.add(word);
    }
  }

  // Track extracted characters and their source words
  for (const word of extractedWords) {
    for (const char of word) {
      extractedFreq.set(char, (extractedFreq.get(char) || 0) + 1);
      if (!extractedSources.has(char)) {
        extractedSources.set(char, new Set());
      }
      extractedSources.get(char)!.add(word);
    }
  }

  // Build initial missing characters map
  const missingCharsMap = new Map<string, { count: number; sourceWords: string[] }>();
  let missingTotal = 0;

  for (const [char, gtCount] of groundTruthFreq) {
    const exCount = extractedFreq.get(char) || 0;
    if (exCount < gtCount) {
      const diff = gtCount - exCount;
      const sourceWords = Array.from(groundTruthSources.get(char) || []);
      missingCharsMap.set(char, {
        count: diff,
        sourceWords,
      });
      missingTotal += diff;
    }
  }

  // Detect complete missing words (all characters from word are missing)
  const missingWords: string[] = [];
  const charsInMissingWords = new Set<string>();

  for (const word of groundTruthWords) {
    const wordChars = [...word];
    const allCharsMissing = wordChars.every(char => missingCharsMap.has(char));

    if (allCharsMissing && wordChars.length > 0) {
      missingWords.push(word);
      // Mark these characters as part of a missing word
      wordChars.forEach(char => charsInMissingWords.add(char));
    }
  }

  // Remove characters that are part of missing words from individual character list
  const missingCharacters: Record<string, { count: number; sourceWords: string[] }> = {};

  for (const [char, data] of missingCharsMap) {
    if (charsInMissingWords.has(char)) {
      // This char is part of a missing word - filter out those source words
      const remainingSourceWords = data.sourceWords.filter(
        word => !missingWords.includes(word)
      );

      // Only include if there are remaining source words (char appears in other contexts)
      if (remainingSourceWords.length > 0) {
        missingCharacters[char] = {
          count: data.count,
          sourceWords: remainingSourceWords.slice(0, 5),
        };
      }
    } else {
      // Not part of a missing word - include with limited source words
      missingCharacters[char] = {
        count: data.count,
        sourceWords: data.sourceWords.slice(0, 5),
      };
    }
  }

  // Find extra characters (no source words needed)
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
    missingWords,
    missingCharacters,
    extraCharacters,
    missingTotal,
    extraTotal,
  };
}
