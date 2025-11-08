/**
 * Utility functions for character-level OCR evaluation
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
 * source: https://www.sciencedirect.com/topics/computer-science/levenshtein-distance
 * Levenshtein distance is defined as the minimum number of insertions, deletions, or substitutions
 *  required to transform one string into another. It serves as a measure of proximity between two strings.
 */
export function calculateLevenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;

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
 * Calculate Character Error Rate (CER)
 * CER = (insertions + deletions + substitutions) / total_characters_in_reference
 * Industry standard metric for OCR accuracy
 * @returns CER as a decimal (0.0 = perfect, 1.0 = completely wrong)
 */
export function calculateCER(extracted: string, groundTruth: string): number {
  const normalizedExtracted = normalizeText(extracted);
  const normalizedGroundTruth = normalizeText(groundTruth);

  const editDistance = calculateLevenshteinDistance(normalizedExtracted, normalizedGroundTruth);
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
export function calculateCharacterAccuracy(extracted: string, groundTruth: string): number {
  const normalizedExtracted = normalizeText(extracted);
  const normalizedGroundTruth = normalizeText(groundTruth);

  if (normalizedGroundTruth.length === 0) {
    return normalizedExtracted.length === 0 ? 100 : 0;
  }

  const maxLength = Math.max(normalizedExtracted.length, normalizedGroundTruth.length);
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
export function calculateCharacterSetCoverage(extracted: string, groundTruth: string): number {
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
export function calculateExactCharacterCount(extracted: string, groundTruth: string): {
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
