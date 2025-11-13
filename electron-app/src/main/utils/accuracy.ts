/**
 * Utility functions for character-level OCR evaluation
 * Ported from main project's src/lib/utils.ts
 */

/**
 * Normalize text for consistent comparison
 * - Normalizes Unicode characters (NFKC)
 * - Preserves all whitespace and newlines
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

  // Memory optimization for very large texts
  const LARGE_TEXT_THRESHOLD = 10000;
  const maxLen = Math.max(len1, len2);

  if (maxLen > LARGE_TEXT_THRESHOLD) {
    const samplingRate = Math.ceil(maxLen / LARGE_TEXT_THRESHOLD);
    return calculateLevenshteinDistanceWithSampling(
      str1,
      str2,
      samplingRate
    );
  }

  // Standard algorithm for normal-sized texts
  const matrix: number[][] = Array(len1 + 1)
    .fill(null)
    .map(() => Array(len2 + 1).fill(0));

  // Initialize first column and row
  for (let i = 0; i <= len1; i++) {
    matrix[i][0] = i;
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  // Fill the matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
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
 * - Removes all whitespace (spaces, newlines, tabs)
 * - Converts full-width numbers to half-width (１２３ → 123)
 * - Converts full-width alphabet to half-width (ＡＢＣ → ABC)
 * - Normalizes Unicode (NFKC)
 * - Sorts characters alphabetically
 *
 * This allows comparing "first second" and "second first" as equal (both become "first second")
 * Useful for measuring content completeness regardless of text order
 */
export function normalizeForOrderIndependentComparison(text: string): string {
  // Step 1: Unicode normalization (NFKC) - converts full-width to half-width
  let normalized = text.normalize('NFKC');

  // Step 2: Remove all whitespace (spaces, tabs, newlines, etc.)
  normalized = normalized.replace(/\s+/g, '');

  // Step 3: Sort characters alphabetically
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
  missingChars: Record<string, number>;
  extraChars: Record<string, number>;
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

  // Character frequency analysis
  const extractedChars = countCharacters(normalizeForOrderIndependentComparison(extracted));
  const groundTruthChars = countCharacters(normalizeForOrderIndependentComparison(groundTruth));

  const missingChars: Record<string, number> = {};
  const extraChars: Record<string, number> = {};

  // Find missing characters
  for (const [char, count] of Object.entries(groundTruthChars)) {
    const extractedCount = extractedChars[char] || 0;
    if (extractedCount < count) {
      missingChars[char] = count - extractedCount;
    }
  }

  // Find extra characters
  for (const [char, count] of Object.entries(extractedChars)) {
    const groundTruthCount = groundTruthChars[char] || 0;
    if (count > groundTruthCount) {
      extraChars[char] = count - groundTruthCount;
    }
  }

  return {
    cer,
    precision,
    recall,
    f1Score,
    editDistance,
    orderIndependentCer: orderIndependent.cer,
    orderIndependentAccuracy: orderIndependent.accuracy,
    orderIndependentEditDistance: orderIndependent.editDistance,
    missingChars,
    extraChars,
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
