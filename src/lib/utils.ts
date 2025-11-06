import stringSimilarity from 'string-similarity';

/**
 * Utility functions for text processing and comparison
 */

/**
 * Calculate string similarity (0-1)
 */
export function calculateSimilarity(str1: string, str2: string): number {
  return stringSimilarity.compareTwoStrings(str1, str2);
}

/**
 * Extract dimensions from text using regex
 * Matches patterns like: "3500mm", "1255×960", "R=450", "3.5m"
 */
export function extractDimensions(text: string): Array<{
  value: string;
  numbers: string[];
  unit?: string;
}> {
  const dimensions: Array<{
    value: string;
    numbers: string[];
    unit?: string;
  }> = [];

  // Pattern for dimensions: number + optional unit + optional × + optional number + optional unit
  const dimensionPattern = /(\d+(?:\.\d+)?)\s*(mm|cm|m|t|トン)?(?:\s*[×xX]\s*(\d+(?:\.\d+)?)\s*(mm|cm|m)?)?/gi;

  let match;
  while ((match = dimensionPattern.exec(text)) !== null) {
    const numbers = [match[1], match[3]].filter(Boolean);
    const unit = match[2] || match[4];

    dimensions.push({
      value: match[0].trim(),
      numbers,
      unit,
    });
  }

  // Pattern for radius: "R=450", "r = 3.5m"
  const radiusPattern = /[Rr]\s*=\s*(\d+(?:\.\d+)?)\s*(mm|cm|m)?/gi;

  while ((match = radiusPattern.exec(text)) !== null) {
    dimensions.push({
      value: match[0].trim(),
      numbers: [match[1]],
      unit: match[2],
    });
  }

  return dimensions;
}

/**
 * Extract Japanese construction equipment labels from text
 */
export function extractEquipmentLabels(text: string): Array<{
  term: string;
  spec?: string;
}> {
  const constructionTerms = [
    'タワークレーン',
    'クレーン',
    'ラフタークレーン',
    'クローラクレーン',
    '仮囲い',
    '資材置場',
    '事務所棟',
    '作業場',
    '駐車場',
    'ゲート',
    '安全柵',
    '足場',
    'ダンプ',
    'トラック',
    'バックホー',
    'ショベル',
    'ポンプ車',
  ];

  const found: Array<{ term: string; spec?: string }> = [];

  for (const term of constructionTerms) {
    if (text.includes(term)) {
      // Try to find spec (like "13t", "25t") near the term
      const specPattern = new RegExp(`${term}.*?(\\d+(?:\\.\\d+)?\\s*[tトン])`, 'i');
      const match = text.match(specPattern);

      found.push({
        term,
        spec: match ? match[1] : undefined,
      });
    }
  }

  return found;
}

/**
 * Deduplicate array of objects based on similarity threshold
 */
export function deduplicateByValue<T extends { value: string }>(
  items: T[],
  threshold: number = 0.9
): T[] {
  const unique: T[] = [];

  for (const item of items) {
    const isDuplicate = unique.some(
      (uniqueItem) => calculateSimilarity(uniqueItem.value, item.value) >= threshold
    );

    if (!isDuplicate) {
      unique.push(item);
    }
  }

  return unique;
}

/**
 * Calculate precision, recall, and F1 score
 */
export function calculateMetrics(params: {
  found: number;
  correct: number;
  total: number;
}): {
  precision: number;
  recall: number;
  f1Score: number;
} {
  const { found, correct, total } = params;

  const precision = found > 0 ? correct / found : 0;
  const recall = total > 0 ? correct / total : 0;
  const f1Score = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  return {
    precision: Math.round(precision * 100) / 100,
    recall: Math.round(recall * 100) / 100,
    f1Score: Math.round(f1Score * 100) / 100,
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
