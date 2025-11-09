/**
 * Gemini response parsing utilities
 * Handles parsing of various Gemini response formats for OCR and validation
 */

export interface GeminiCoordinate {
  text: string;
  top: number; // percentage
  left: number; // percentage
  width: number; // percentage
  height: number; // percentage
}

export interface GeminiValidationResult {
  missingText: Array<{
    text: string;
    locationDescription?: string;
  }>;
  incorrectText: Array<{
    found: string;
    shouldBe: string;
    locationDescription?: string;
  }>;
}

/**
 * Parse Gemini coordinates response
 * Expected format: TEXT|top|left|width|height
 * Example: "配筋図|10|15|20|5"
 */
export function parseGeminiCoordinates(response: string): GeminiCoordinate[] {
  const lines = response.split('\n');
  const coordinates: GeminiCoordinate[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Try to parse the format: TEXT|top|left|width|height
    const parts = trimmed.split('|');

    if (parts.length >= 5) {
      const text = parts[0].trim();
      const top = parseFloat(parts[1]);
      const left = parseFloat(parts[2]);
      const width = parseFloat(parts[3]);
      const height = parseFloat(parts[4]);

      // Validate that numbers are reasonable percentages
      if (
        !isNaN(top) &&
        !isNaN(left) &&
        !isNaN(width) &&
        !isNaN(height) &&
        top >= 0 &&
        top <= 100 &&
        left >= 0 &&
        left <= 100 &&
        width > 0 &&
        width <= 100 &&
        height > 0 &&
        height <= 100 &&
        text.length > 0
      ) {
        coordinates.push({ text, top, left, width, height });
      }
    }
  }

  return coordinates;
}

/**
 * Parse Gemini validation response
 * Looks for missing text and incorrect text with location descriptions
 */
export function parseGeminiValidation(
  response: string
): GeminiValidationResult {
  const result: GeminiValidationResult = {
    missingText: [],
    incorrectText: [],
  };

  const lines = response.split('\n');

  let currentSection: 'missing' | 'incorrect' | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim().toLowerCase();

    // Detect section headers
    if (
      line.includes('missing') ||
      line.includes('not found') ||
      line.includes('欠けている')
    ) {
      currentSection = 'missing';
      continue;
    }

    if (
      line.includes('incorrect') ||
      line.includes('wrong') ||
      line.includes('error') ||
      line.includes('間違い')
    ) {
      currentSection = 'incorrect';
      continue;
    }

    // Skip empty lines
    if (!line) {
      continue;
    }

    // Parse missing text entries
    // Format examples:
    // - "配筋図" (near top-right)
    // - Missing: "RC" at bottom-left
    // - '寸法線' in the center
    if (currentSection === 'missing') {
      const textMatch = line.match(/[「"']([^「"']+)[」"']/);
      const text = textMatch
        ? textMatch[1]
        : line.replace(/^[-*•]\s*/, '').trim();

      if (text) {
        // Try to extract location description
        const locationMatch = line.match(/(?:at|near|in|on|の)\s+([^,.)]+)/i);
        const locationDescription = locationMatch
          ? locationMatch[1].trim()
          : undefined;

        result.missingText.push({ text, locationDescription });
      }
    }

    // Parse incorrect text entries
    // Format examples:
    // - Found "R0" but should be "RC"
    // - "配肪" → "配筋"
    // - Incorrect: "寸法" (should be "す法") near the ruler
    if (currentSection === 'incorrect') {
      // Try various formats
      let found = '';
      let shouldBe = '';
      let locationDescription: string | undefined;

      // Format: Found "X" but should be "Y"
      const format1 = line.match(
        /found\s+[「"']([^「"']+)[」"'].*should.*[「"']([^「"']+)[」"']/i
      );
      if (format1) {
        found = format1[1];
        shouldBe = format1[2];
      }

      // Format: "X" → "Y" or "X" -> "Y"
      const format2 = line.match(
        /[「"']([^「"']+)[」"']\s*(?:→|->)\s*[「"']([^「"']+)[」"']/
      );

      if (format2) {
        found = format2[1];
        shouldBe = format2[2];
      }

      // Format: Incorrect: "X" (should be "Y")
      const format3 = line.match(
        /[「"']([^「"']+)[」"'].*\(.*should.*[「"']([^「"']+)[」"']/i
      );
      if (format3) {
        found = format3[1];
        shouldBe = format3[2];
      }

      if (found && shouldBe) {
        // Try to extract location
        const locationMatch = line.match(/(?:at|near|in|on|の)\s+([^,.)]+)/i);
        locationDescription = locationMatch
          ? locationMatch[1].trim()
          : undefined;

        result.incorrectText.push({ found, shouldBe, locationDescription });
      }
    }
  }

  return result;
}

/**
 * Extract plain text from Gemini response, removing common commentary
 */
export function cleanGeminiCommentary(response: string): string {
  let cleaned = response.trim();

  // Remove common preambles (case-insensitive)
  const preambles = [
    /^here\s+is\s+the\s+extracted\s+text:?\s*/i,
    /^extracted\s+text:?\s*/i,
    /^the\s+text\s+in\s+the\s+image\s+is:?\s*/i,
    /^text\s+found:?\s*/i,
    /^ocr\s+result:?\s*/i,
    /^i\s+found\s+the\s+following\s+text:?\s*/i,
    /^以下のテキストを抽出しました:?\s*/i,
    /^テキスト:?\s*/i,
  ];

  for (const pattern of preambles) {
    cleaned = cleaned.replace(pattern, '');
  }

  // Remove common postambles
  const postambles = [
    /\s*is\s+this\s+helpful\?$/i,
    /\s*let\s+me\s+know\s+if.*$/i,
    /\s*anything\s+else\?$/i,
  ];

  for (const pattern of postambles) {
    cleaned = cleaned.replace(pattern, '');
  }

  return cleaned.trim();
}

/**
 * Check if Gemini response contains coordinate data
 */
export function hasCoordinateFormat(response: string): boolean {
  // Look for pipe-separated format with numbers
  const lines = response.split('\n');

  for (const line of lines) {
    const parts = line.split('|');
    if (parts.length >= 5) {
      // Check if parts 1-4 are numbers
      const numbers = parts.slice(1, 5).map((p) => parseFloat(p.trim()));
      if (numbers.every((n) => !isNaN(n))) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Extract confidence level from Gemini response if mentioned
 */
export function extractConfidenceFromResponse(response: string): number | null {
  const confidencePatterns = [
    /confidence:?\s*(\d+(?:\.\d+)?)\s*%/i,
    /(\d+(?:\.\d+)?)\s*%\s*confident/i,
    /accuracy:?\s*(\d+(?:\.\d+)?)\s*%/i,
  ];

  for (const pattern of confidencePatterns) {
    const match = response.match(pattern);
    if (match) {
      const value = parseFloat(match[1]);
      if (!isNaN(value) && value >= 0 && value <= 100) {
        return value / 100; // Convert to 0-1 range
      }
    }
  }

  return null;
}

/**
 * Split text into segments for matching
 * Handles both character-level and word-level segmentation
 */
export function segmentText(
  text: string,
  segmentType: 'character' | 'word' = 'word'
): string[] {
  if (segmentType === 'character') {
    return text.split('');
  }

  // Word-level: split on whitespace but preserve Japanese characters as individual words
  const segments: string[] = [];
  const tokens = text.split(/\s+/);

  for (const token of tokens) {
    // For Japanese text (mixed with ASCII), treat each character as a word
    // For pure ASCII, treat whole token as a word
    if (
      /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf]/.test(
        token
      )
    ) {
      // Contains Japanese characters - split into individual chars
      segments.push(...token.split(''));
    } else {
      // ASCII word
      if (token.length > 0) {
        segments.push(token);
      }
    }
  }

  return segments;
}

/**
 * Attempt to extract structured data from free-form Gemini response
 * This is a best-effort parser for when Gemini doesn't follow the format exactly
 */
export function extractTextBlocks(
  response: string
): Array<{ text: string; metadata?: any }> {
  const blocks: Array<{ text: string; metadata?: any }> = [];

  // Try to find quoted text blocks
  const quotedPattern = /[「"']([^「"']+)[」"']/g;
  let match;

  while ((match = quotedPattern.exec(response)) !== null) {
    blocks.push({ text: match[1] });
  }

  // If no quoted blocks found, split by lines and filter
  if (blocks.length === 0) {
    const lines = response.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      // Skip short lines, section headers, and commentary
      if (
        trimmed.length > 0 &&
        !trimmed.match(
          /^(missing|incorrect|found|should|here|text|extracted)/i
        ) &&
        trimmed.length > 2
      ) {
        blocks.push({ text: trimmed });
      }
    }
  }

  return blocks;
}
