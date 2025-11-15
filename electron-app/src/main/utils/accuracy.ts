/**
 * Utility functions for character-level OCR evaluation
 * Ported from main project's src/lib/utils.ts
 */

// No external or internal imports needed for this utility module

/**
 * Normalize text for consistent comparison (NFKC normalization)
 */
export function normalizeText(text: string): string {
  return text.normalize('NFKC');
}

/**
 * Calculate Levenshtein distance (edit distance) between two strings
 * Returns the minimum number of single-character edits (insertions, deletions, substitutions)
 * needed to change one string into the other
 *
 * For very large texts (>10,000 chars), uses sampling to reduce memory usage.
 */
export function calculateLevenshteinDistance(
  str1: string,
  str2: string
): number {
  const len1 = str1.length;
  const len2 = str2.length;

  const LARGE_TEXT_THRESHOLD = 10000;
  const maxLen = Math.max(len1, len2);

  if (maxLen > LARGE_TEXT_THRESHOLD) {
    const samplingRate = Math.ceil(maxLen / LARGE_TEXT_THRESHOLD);
    return calculateLevenshteinDistanceWithSampling(str1, str2, samplingRate);
  }

  const matrix: number[][] = Array(len1 + 1)
    .fill(null)
    .map(() => Array(len2 + 1).fill(0));

  for (let i = 0; i <= len1; i++) {
    matrix[i][0] = i;
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[len1][len2];
}

/**
 * Calculate Levenshtein distance using sampling for very large texts
 */
function calculateLevenshteinDistanceWithSampling(
  str1: string,
  str2: string,
  samplingRate: number
): number {
  const sampled1 = sampleString(str1, samplingRate);
  const sampled2 = sampleString(str2, samplingRate);

  const len1 = sampled1.length;
  const len2 = sampled2.length;

  const matrix: number[][] = Array(len1 + 1)
    .fill(null)
    .map(() => Array(len2 + 1).fill(0));

  for (let i = 0; i <= len1; i++) {
    matrix[i][0] = i;
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = sampled1[i - 1] === sampled2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return Math.round(matrix[len1][len2] * samplingRate);
}

/**
 * Sample a string by taking every Nth character
 */
function sampleString(str: string, samplingRate: number): string {
  let result = '';
  for (let i = 0; i < str.length; i += samplingRate) {
    result += str[i];
  }
  return result;
}

/**
 * Calculate Character Error Rate (CER)
 * CER = (insertions + deletions + substitutions) / total_characters_in_reference
 * Industry standard metric for OCR accuracy
 * @returns CER as a decimal (0.0 = perfect, 1.0 = completely wrong)
 */
export function calculateCER(extracted: string, groundTruth: string): number {
  const normalizedExtracted = normalizeText(extracted);
  const normalizedGroundTruth = normalizeText(groundTruth);

  const editDistance = calculateLevenshteinDistance(
    normalizedExtracted,
    normalizedGroundTruth
  );
  const totalChars = normalizedGroundTruth.length;

  if (totalChars === 0) {
    return normalizedExtracted.length === 0 ? 0 : 1;
  }

  return editDistance / totalChars;
}

/**
 * Normalize text for order-independent comparison
 * Removes whitespace, converts full-width to half-width, and sorts characters.
 * Allows comparing "first second" and "second first" as equivalent.
 */
export function normalizeForOrderIndependentComparison(text: string): string {
  let normalized = text.normalize('NFKC');
  normalized = normalized.replace(/\s+/g, '');
  normalized = normalized.split('').sort().join('');
  return normalized;
}

/**
 * Calculate Order-Independent Character Error Rate
 * Measures content completeness by comparing character frequency regardless of order
 *
 * @returns Object with CER, accuracy percentage, and edit distance
 */
export function calculateOrderIndependentCER(
  extracted: string,
  groundTruth: string
): {
  cer: number;
  accuracy: number;
  editDistance: number;
  normalizedExtractedLength: number;
  normalizedGroundTruthLength: number;
} {
  // Normalize both texts for order-independent comparison
  const normalizedExtracted =
    normalizeForOrderIndependentComparison(extracted);
  const normalizedGroundTruth =
    normalizeForOrderIndependentComparison(groundTruth);

  // Calculate Levenshtein distance on sorted character strings
  const editDistance = calculateLevenshteinDistance(
    normalizedExtracted,
    normalizedGroundTruth
  );

  // Calculate lengths after normalization
  const extractedLen = normalizedExtracted.length;
  const groundTruthLen = normalizedGroundTruth.length;
  const maxLen = Math.max(extractedLen, groundTruthLen);

  // Handle edge case: both empty
  if (maxLen === 0) {
    return {
      cer: 0,
      accuracy: 100,
      editDistance: 0,
      normalizedExtractedLength: 0,
      normalizedGroundTruthLength: 0,
    };
  }

  // Calculate CER: 1 - (editDistance / max(lengths))
  const cer = editDistance / maxLen;
  const accuracy = (1 - cer) * 100;

  return {
    cer: Math.round(cer * 10000) / 10000, // 4 decimal places
    accuracy: Math.round(accuracy * 100) / 100, // 2 decimal places
    editDistance,
    normalizedExtractedLength: extractedLen,
    normalizedGroundTruthLength: groundTruthLen,
  };
}

/**
 * Calculate comprehensive accuracy metrics for OCR evaluation
 * Returns both order-dependent and order-independent metrics
 */
export interface AccuracyMetrics {
  // Order-dependent metrics
  cer: number;
  precision: number;
  recall: number;
  f1Score: number;
  editDistance: number;

  // Order-independent metrics
  orderIndependentCer: number;
  orderIndependentAccuracy: number;
  orderIndependentEditDistance: number;
  missingWords: string[];
  missingChars: Record<string, { count: number; sourceWords: string[] }>;
  extraChars: Record<string, number>;

  // Character counts for summary display
  missingCharCount: number;
  extraCharCount: number;
  groundTruthCharCount: number;
}

export function calculateAccuracy(
  extracted: string,
  groundTruth: string
): AccuracyMetrics {
  // Order-dependent metrics
  const normalizedExtracted = normalizeText(extracted);
  const normalizedGroundTruth = normalizeText(groundTruth);

  const editDistance = calculateLevenshteinDistance(
    normalizedExtracted,
    normalizedGroundTruth
  );

  const cer = calculateCER(extracted, groundTruth);

  // Calculate precision and recall
  const extractedLen = normalizedExtracted.length;
  const groundTruthLen = normalizedGroundTruth.length;

  const precision = extractedLen > 0
    ? (extractedLen - editDistance) / extractedLen
    : 0;
  const recall = groundTruthLen > 0
    ? (groundTruthLen - editDistance) / groundTruthLen
    : 0;
  const f1Score = (precision + recall) > 0
    ? (2 * precision * recall) / (precision + recall)
    : 0;

  // Order-independent metrics
  const orderIndependent = calculateOrderIndependentCER(extracted, groundTruth);

  // Character frequency analysis with source tracking
  const charFreqAnalysis = calculateCharacterFrequencyDifferences(extracted, groundTruth);
  const missingWords = charFreqAnalysis.missingWords;
  const missingChars = charFreqAnalysis.missingCharacters;
  const extraChars = charFreqAnalysis.extraCharacters;
  const missingCharCount = charFreqAnalysis.missingTotal;
  const extraCharCount = charFreqAnalysis.extraTotal;

  // Get ground truth character count (normalized, without whitespace)
  const groundTruthCharCount = normalizedGroundTruth.length;

  return {
    cer,
    precision,
    recall,
    f1Score,
    editDistance,
    orderIndependentCer: orderIndependent.cer,
    orderIndependentAccuracy: orderIndependent.accuracy,
    orderIndependentEditDistance: orderIndependent.editDistance,
    missingWords,
    missingChars,
    extraChars,
    missingCharCount,
    extraCharCount,
    groundTruthCharCount,
  };
}

/**
 * Split text into words, handling both space-separated and CJK text
 */
function splitIntoWords(text: string): string[] {
  const words: string[] = [];
  const segments = text.split(/[\s、。，．！？\n\r]+/);

  for (const segment of segments) {
    if (segment.trim().length > 0) {
      words.push(segment.trim());
    }
  }

  return words.filter(w => w.length > 0);
}

/**
 * Calculate character frequency differences with source word tracking
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
  const groundTruthWords = splitIntoWords(groundTruth);
  const extractedWords = splitIntoWords(extracted);

  const extractedFreq = new Map<string, number>();
  const groundTruthFreq = new Map<string, number>();
  const groundTruthSources = new Map<string, Set<string>>();
  const extractedSources = new Map<string, Set<string>>();

  for (const word of groundTruthWords) {
    for (const char of word) {
      groundTruthFreq.set(char, (groundTruthFreq.get(char) || 0) + 1);
      if (!groundTruthSources.has(char)) {
        groundTruthSources.set(char, new Set());
      }
      groundTruthSources.get(char)!.add(word);
    }
  }

  for (const word of extractedWords) {
    for (const char of word) {
      extractedFreq.set(char, (extractedFreq.get(char) || 0) + 1);
      if (!extractedSources.has(char)) {
        extractedSources.set(char, new Set());
      }
      extractedSources.get(char)!.add(word);
    }
  }

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

  const missingWords: string[] = [];
  const charsInMissingWords = new Set<string>();

  for (const word of groundTruthWords) {
    const wordChars = [...word];
    const allCharsMissing = wordChars.every(char => missingCharsMap.has(char));

    if (allCharsMissing && wordChars.length > 0) {
      missingWords.push(word);
      wordChars.forEach(char => charsInMissingWords.add(char));
    }
  }

  const missingCharacters: Record<string, { count: number; sourceWords: string[] }> = {};

  for (const [char, data] of missingCharsMap) {
    if (charsInMissingWords.has(char)) {
      const remainingSourceWords = data.sourceWords.filter(
        word => !missingWords.includes(word)
      );

      if (remainingSourceWords.length > 0) {
        missingCharacters[char] = {
          count: data.count,
          sourceWords: remainingSourceWords.slice(0, 5),
        };
      }
    } else {
      missingCharacters[char] = {
        count: data.count,
        sourceWords: data.sourceWords.slice(0, 5),
      };
    }
  }

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

/**
 * Count character frequency in a string
 */
function countCharacters(text: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const char of text) {
    counts[char] = (counts[char] || 0) + 1;
  }
  return counts;
}

/**
 * Clean AI-generated text by removing common commentary patterns
 */
export function cleanAICommentary(text: string): {
  cleaned: string;
  hadCommentary: boolean;
  removedPatterns: string[];
} {
  let cleaned = text.trim();
  const removedPatterns: string[] = [];

  // Remove markdown code blocks
  const codeBlockPattern = /```(?:text|plaintext)?\n?([\s\S]*?)\n?```/g;
  if (codeBlockPattern.test(cleaned)) {
    cleaned = cleaned.replace(codeBlockPattern, '$1');
    removedPatterns.push('markdown code block');
  }

  // Remove common AI preambles
  const preambles = [
    { pattern: /^Here is the extracted text:?\s*/i, name: 'Here is...' },
    { pattern: /^Here is what I extracted:?\s*/i, name: 'Here is what...' },
    { pattern: /^I found the following text:?\s*/i, name: 'I found...' },
    { pattern: /^Based on the image[,:]\s*/i, name: 'Based on...' },
    { pattern: /^The extracted text is:?\s*/i, name: 'The extracted...' },
    { pattern: /^Extracted text:?\s*/i, name: 'Extracted text:' },
    { pattern: /^Text from (?:the )?image:?\s*/i, name: 'Text from image:' },
    { pattern: /^(?:The )?OCR results?:?\s*/i, name: 'OCR result:' },
  ];

  for (const { pattern, name } of preambles) {
    if (pattern.test(cleaned)) {
      cleaned = cleaned.replace(pattern, '');
      removedPatterns.push(name);
    }
  }

  // Remove trailing commentary
  const trailingPatterns = [
    { pattern: /\n+Note:.*$/is, name: 'trailing Note:' },
    { pattern: /\n+Please note:.*$/is, name: 'trailing Please note:' },
    { pattern: /\n+\*\*Note:.*$/is, name: 'trailing **Note:' },
  ];

  for (const { pattern, name } of trailingPatterns) {
    if (pattern.test(cleaned)) {
      cleaned = cleaned.replace(pattern, '');
      removedPatterns.push(name);
    }
  }

  cleaned = cleaned.trim();

  return {
    cleaned,
    hadCommentary: removedPatterns.length > 0,
    removedPatterns,
  };
}

/**
 * Format time in milliseconds to human-readable string
 */
export function formatTime(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(2)}s`;
  } else {
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return `${minutes}m ${seconds}s`;
  }
}

/**
 * Format cost in yen
 */
export function formatCost(yen: number): string {
  return `¥${yen.toFixed(2)}`;
}
