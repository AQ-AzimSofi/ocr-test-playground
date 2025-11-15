/**
 * Utility functions for character-level OCR evaluation
 */

// No external or internal imports needed for this utility module

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
 *
 * source: https://www.sciencedirect.com/topics/computer-science/levenshtein-distance
 * Levenshtein distance is defined as the minimum number of insertions, deletions, or substitutions
 *  required to transform one string into another. It serves as a measure of proximity between two strings.
 */
export function calculateLevenshteinDistance(
  str1: string,
  str2: string
): number {
  const len1 = str1.length;
  const len2 = str2.length;

  // Memory optimization for very large texts
  // Use sampling to reduce O(n²) memory footprint
  const LARGE_TEXT_THRESHOLD = 10000;
  const maxLen = Math.max(len1, len2);

  if (maxLen > LARGE_TEXT_THRESHOLD) {
    // Sample every Nth character to reduce memory usage
    const samplingRate = Math.ceil(maxLen / LARGE_TEXT_THRESHOLD);
    return calculateLevenshteinDistanceWithSampling(
      str1,
      str2,
      samplingRate
    );
  }

  // Standard algorithm for normal-sized texts
  // Create a 2D array for dynamic programming
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
 * Samples every Nth character to reduce memory from O(n²) to O(n²/k²) where k = samplingRate
 * The result is scaled back up to approximate the full distance
 */
function calculateLevenshteinDistanceWithSampling(
  str1: string,
  str2: string,
  samplingRate: number
): number {
  // Sample characters
  const sampled1 = sampleString(str1, samplingRate);
  const sampled2 = sampleString(str2, samplingRate);

  const len1 = sampled1.length;
  const len2 = sampled2.length;

  // Use standard algorithm on sampled strings (now much smaller)
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

  // Scale the distance back up to approximate full text distance
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
 * Calculate character-by-character accuracy (position-based)
 * Compares characters at each position and calculates percentage of matches
 * @returns Accuracy as a percentage (0-100)
 */
export function calculateCharacterAccuracy(
  extracted: string,
  groundTruth: string
): number {
  const normalizedExtracted = normalizeText(extracted);
  const normalizedGroundTruth = normalizeText(groundTruth);

  if (normalizedGroundTruth.length === 0) {
    return normalizedExtracted.length === 0 ? 100 : 0;
  }

  const maxLength = Math.max(
    normalizedExtracted.length,
    normalizedGroundTruth.length
  );
  let correctChars = 0;

  for (let i = 0; i < maxLength; i++) {
    if (normalizedExtracted[i] === normalizedGroundTruth[i]) {
      correctChars++;
    }
  }

  return (correctChars / normalizedGroundTruth.length) * 100;
}

/**
 * Calculate character set coverage
 * Measures what percentage of unique characters in ground truth were found in extracted text
 * @returns Coverage as a percentage (0-100)
 */
export function calculateCharacterSetCoverage(
  extracted: string,
  groundTruth: string
): number {
  const normalizedExtracted = normalizeText(extracted);
  const normalizedGroundTruth = normalizeText(groundTruth);

  const groundTruthChars = new Set(normalizedGroundTruth);
  const extractedChars = new Set(normalizedExtracted);

  if (groundTruthChars.size === 0) {
    return extractedChars.size === 0 ? 100 : 0;
  }

  let foundChars = 0;
  for (const char of groundTruthChars) {
    if (extractedChars.has(char)) {
      foundChars++;
    }
  }

  return (foundChars / groundTruthChars.size) * 100;
}

/**
 * Check if exact character count matches
 * @returns Object with match status and counts
 */
export function calculateExactCharacterCount(
  extracted: string,
  groundTruth: string
): {
  matches: boolean;
  extractedCount: number;
  groundTruthCount: number;
  difference: number;
} {
  const normalizedExtracted = normalizeText(extracted);
  const normalizedGroundTruth = normalizeText(groundTruth);

  const extractedCount = normalizedExtracted.length;
  const groundTruthCount = normalizedGroundTruth.length;

  return {
    matches: extractedCount === groundTruthCount,
    extractedCount,
    groundTruthCount,
    difference: extractedCount - groundTruthCount,
  };
}

/**
 * Normalize text for order-independent comparison
 * - Removes all whitespace (spaces, newlines, tabs)
 * - Converts full-width numbers to half-width (１２３ → 123)
 * - Converts full-width alphabet to half-width (ＡＢＣ → ABC)
 * - Normalizes Unicode (NFKC)
 * - Sorts characters alphabetically
 *
 * This allows comparing "first" and "tsrif" as equal (both become "first")
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
  // This formula penalizes both missing and extra characters equally
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
 * Clean AI-generated text by removing common commentary patterns
 * Used to extract pure OCR text from LLM responses that may include preambles/explanations
 *
 * @param text - Raw text from AI model
 * @returns Cleaned text and whether commentary was detected
 */
export function cleanAICommentary(text: string): {
  cleaned: string;
  hadCommentary: boolean;
  removedPatterns: string[];
} {
  let cleaned = text.trim();
  const removedPatterns: string[] = [];

  // Step 1: Remove markdown code blocks
  const codeBlockPattern = /```(?:text|plaintext)?\n?([\s\S]*?)\n?```/g;
  if (codeBlockPattern.test(cleaned)) {
    cleaned = cleaned.replace(codeBlockPattern, '$1');
    removedPatterns.push('markdown code block');
  }

  // Step 2: Remove common AI preambles (case-insensitive)
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

  // Step 3: Remove trailing commentary/notes
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

  // Step 4: Final trim
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

/**
 * Convert image to base64 for API calls
 */
export function imageToBase64(imagePath: string): string {
  const fs = require('fs');
  const imageBuffer = fs.readFileSync(imagePath);
  return imageBuffer.toString('base64');
}
