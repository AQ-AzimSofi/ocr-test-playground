import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import * as dotenv from 'dotenv';
import type { BoundingBox } from '../../types/processor-types.js';

dotenv.config({ path: '.env.development' });

const TextMatchSchema = z.object({
  gemini_index: z.number(),
  cloud_vision_index: z.number(),
  gemini_text: z.string(),
  cloud_vision_text: z.string(),
  match_confidence: z.number().min(0).max(1),
  match_reason: z.string(),
});

const UnmatchedGeminiTextSchema = z.object({
  gemini_index: z.number(),
  text: z.string(),
  approximate_x: z.number(),
  approximate_y: z.number(),
  reason_unmatched: z.string(),
});

export const TextMatchingOutputSchema = z.object({
  matched_pairs: z.array(TextMatchSchema),
  unmatched_gemini_texts: z.array(UnmatchedGeminiTextSchema),
  matching_stats: z.object({
    total_gemini_texts: z.number(),
    total_cloud_vision_texts: z.number(),
    matched_count: z.number(),
    unmatched_gemini_count: z.number(),
    avg_match_confidence: z.number(),
  }),
  summary: z.string(),
});

export type TextMatchingOutput = z.infer<typeof TextMatchingOutputSchema>;
export type TextMatch = z.infer<typeof TextMatchSchema>;
export type UnmatchedGeminiText = z.infer<typeof UnmatchedGeminiTextSchema>;

export async function matchTexts(
  geminiResults: BoundingBox[],
  cloudVisionResults: BoundingBox[]
): Promise<TextMatchingOutput> {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_GEMINI_API_KEY environment variable not set');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
    },
  });

  const geminiTexts = geminiResults.map((bbox, index) => ({
    index,
    text: bbox.text,
    x: bbox.bounds[0].x,
    y: bbox.bounds[0].y,
  }));

  const cloudVisionTexts = cloudVisionResults.map((bbox, index) => ({
    index,
    text: bbox.text,
    x: bbox.bounds[0].x,
    y: bbox.bounds[0].y,
  }));

  const prompt = `You are a text matching expert specializing in OCR result comparison. Your task is to match texts detected by two different OCR systems.

TASK: Match each Gemini-detected text to its corresponding Cloud Vision bounding box (if it exists).

GEMINI TEXTS (${geminiTexts.length}):
${JSON.stringify(geminiTexts, null, 2)}

CLOUD VISION TEXTS (${cloudVisionTexts.length}):
${JSON.stringify(cloudVisionTexts, null, 2)}

MATCHING CRITERIA:

**1. Exact Match (Highest Confidence)**
- Texts are identical after normalization (case-insensitive, whitespace trimmed)
- Confidence: 0.95+

**2. Fuzzy Match (High Confidence)**
- Texts are similar with minor differences (e.g., "ホール" vs "ホ ール")
- Character variations, spacing differences
- Levenshtein distance < 3
- Confidence: 0.80 - 0.95

**3. Semantic Match (Medium Confidence)**
- Texts mean the same but formatted differently
- Examples:
  - "1,820" vs "1820"
  - "GL±0" vs "GL=0"
  - "収納" vs "収 納"
- Confidence: 0.70 - 0.85

**4. Spatial Proximity Match (Lower Confidence)**
- Texts are somewhat similar AND coordinates are very close (within 50px)
- Use this only if the texts are reasonably similar (>50% character overlap)
- Confidence: 0.60 - 0.75

**5. No Match**
- Gemini detected a text that Cloud Vision missed entirely
- This could mean:
  - Gemini found text that Cloud Vision couldn't detect (legitimate new text)
  - Gemini hallucinated or misread something
  - The text is partially occluded or very small

IMPORTANT RULES:
- Each Cloud Vision text can only be matched ONCE (to the best Gemini match)
- Each Gemini text should match to only ONE Cloud Vision text
- If multiple Gemini texts match the same Cloud Vision text, choose the best match and mark others as unmatched
- If a Gemini text cannot be confidently matched (confidence < 0.60), mark it as unmatched
- For Japanese text, be aware of OCR variations: full-width vs half-width, spaces, etc.

OUTPUT REQUIREMENTS:

**matched_pairs**: Array of successfully matched text pairs
- gemini_index: Index in Gemini results
- cloud_vision_index: Index in Cloud Vision results
- gemini_text: The Gemini text
- cloud_vision_text: The Cloud Vision text
- match_confidence: 0-1 (how confident you are in this match)
- match_reason: Brief explanation (e.g., "exact match", "fuzzy match - spacing difference", "spatial proximity")

**unmatched_gemini_texts**: Gemini texts that couldn't be matched
- gemini_index: Index in Gemini results
- text: The unmatched text
- approximate_x, approximate_y: Position in image
- reason_unmatched: Why this wasn't matched (e.g., "no similar Cloud Vision text found", "low confidence match", "possibly hallucinated")

**matching_stats**: Summary statistics
- Count of texts from each system
- How many were matched
- Average confidence

**summary**: Brief human-readable summary of the matching results

RESPONSE FORMAT:
Return a JSON object with the complete matching results.

EXAMPLE OUTPUT STRUCTURE:
{
  "matched_pairs": [
    {
      "gemini_index": 0,
      "cloud_vision_index": 5,
      "gemini_text": "ホール",
      "cloud_vision_text": "ホ ール",
      "match_confidence": 0.88,
      "match_reason": "fuzzy match - spacing difference"
    }
  ],
  "unmatched_gemini_texts": [
    {
      "gemini_index": 12,
      "text": "階段室",
      "approximate_x": 450,
      "approximate_y": 320,
      "reason_unmatched": "no similar Cloud Vision text found - likely missed by Cloud Vision"
    }
  ],
  "matching_stats": {
    "total_gemini_texts": 45,
    "total_cloud_vision_texts": 42,
    "matched_count": 40,
    "unmatched_gemini_count": 5,
    "avg_match_confidence": 0.82
  },
  "summary": "Successfully matched 40 out of 45 Gemini texts to Cloud Vision boxes. 5 texts were only detected by Gemini, likely indicating superior detection in those regions."
}`;

  const result = await model.generateContent([prompt]);

  const response = result.response;
  const jsonText = response.text();

  try {
    const parsedOutput = JSON.parse(jsonText);

    return TextMatchingOutputSchema.parse(parsedOutput);
  } catch (error) {
    console.error('Failed to parse text matching output:', error);
    console.error('Raw response:', jsonText);
    throw new Error('Invalid output from Text Matcher Agent');
  }
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

export function fallbackTextMatching(
  geminiResults: BoundingBox[],
  cloudVisionResults: BoundingBox[]
): TextMatchingOutput {
  const matchedPairs: TextMatch[] = [];
  const unmatchedGeminiTexts: UnmatchedGeminiText[] = [];
  const usedCloudVisionIndices = new Set<number>();

  for (let gIdx = 0; gIdx < geminiResults.length; gIdx++) {
    const geminiText = geminiResults[gIdx].text.toLowerCase().trim();
    const geminiX = geminiResults[gIdx].bounds[0].x;
    const geminiY = geminiResults[gIdx].bounds[0].y;

    let bestMatch: { index: number; confidence: number } | null = null;

    for (let cvIdx = 0; cvIdx < cloudVisionResults.length; cvIdx++) {
      if (usedCloudVisionIndices.has(cvIdx)) continue;

      const cvText = cloudVisionResults[cvIdx].text.toLowerCase().trim();
      const cvX = cloudVisionResults[cvIdx].bounds[0].x;
      const cvY = cloudVisionResults[cvIdx].bounds[0].y;

      if (geminiText === cvText) {
        bestMatch = { index: cvIdx, confidence: 0.95 };
        break;
      }

      const distance = levenshteinDistance(geminiText, cvText);
      if (distance <= 2) {
        const confidence = 0.85 - distance * 0.05;
        if (!bestMatch || confidence > bestMatch.confidence) {
          bestMatch = { index: cvIdx, confidence };
        }
      }

      const spatialDistance = Math.sqrt(
        Math.pow(geminiX - cvX, 2) + Math.pow(geminiY - cvY, 2)
      );
      if (spatialDistance < 50 && distance <= 5) {
        const confidence = 0.70 - (spatialDistance / 100) * 0.1;
        if (!bestMatch || confidence > bestMatch.confidence) {
          bestMatch = { index: cvIdx, confidence };
        }
      }
    }

    if (bestMatch && bestMatch.confidence >= 0.6) {
      usedCloudVisionIndices.add(bestMatch.index);
      matchedPairs.push({
        gemini_index: gIdx,
        cloud_vision_index: bestMatch.index,
        gemini_text: geminiResults[gIdx].text,
        cloud_vision_text: cloudVisionResults[bestMatch.index].text,
        match_confidence: bestMatch.confidence,
        match_reason: 'fallback algorithm match',
      });
    } else {
      unmatchedGeminiTexts.push({
        gemini_index: gIdx,
        text: geminiResults[gIdx].text,
        approximate_x: geminiX,
        approximate_y: geminiY,
        reason_unmatched: 'no confident match found',
      });
    }
  }

  const avgConfidence =
    matchedPairs.length > 0
      ? matchedPairs.reduce((sum, m) => sum + m.match_confidence, 0) /
        matchedPairs.length
      : 0;

  return {
    matched_pairs: matchedPairs,
    unmatched_gemini_texts: unmatchedGeminiTexts,
    matching_stats: {
      total_gemini_texts: geminiResults.length,
      total_cloud_vision_texts: cloudVisionResults.length,
      matched_count: matchedPairs.length,
      unmatched_gemini_count: unmatchedGeminiTexts.length,
      avg_match_confidence: avgConfidence,
    },
    summary: `Fallback matching: ${matchedPairs.length}/${geminiResults.length} texts matched`,
  };
}

export interface TextVerificationInput {
  original_text: string;
  bbox_index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

const VerifiedTextSchema = z.object({
  bbox_index: z.number(),
  original_text: z.string(),
  verified_text: z.string(),
  confidence: z.number().min(0).max(1),
  changed: z.boolean(),
  reasoning: z.string(),
});

const BatchVerificationOutputSchema = z.object({
  verified_texts: z.array(VerifiedTextSchema),
});

export type VerifiedText = z.infer<typeof VerifiedTextSchema>;

export async function verifyTextOCRBatch(
  imagePath: string,
  textsToVerify: TextVerificationInput[],
  imageWidth: number,
  imageHeight: number
): Promise<VerifiedText[]> {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_GEMINI_API_KEY environment variable not set');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
    },
  });

  const fs = await import('fs');
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');
  const imagePart = {
    inlineData: {
      data: base64Image,
      mimeType: 'image/png',
    },
  };

  const textsDescription = textsToVerify
    .map(
      (text, idx) => `
${idx + 1}. Original OCR: "${text.original_text}"
   - Bbox Index: ${text.bbox_index}
   - Location: (${text.x}px, ${text.y}px)
   - Size: ${text.width}px × ${text.height}px
   - Current Confidence: ${(text.confidence * 100).toFixed(0)}%`
    )
    .join('\n');

  const prompt = `You are an OCR verification expert for Japanese architectural floor plan drawings.

IMAGE PROPERTIES:
- Width: ${imageWidth}px
- Height: ${imageHeight}px

TASK: Verify the OCR text detection for ${textsToVerify.length} bounding boxes with low confidence.

For each bounding box below, look at the image and determine:
1. What text is ACTUALLY in that region?
2. Is the original OCR correct or incorrect?
3. If incorrect, what is the correct text?

TEXTS TO VERIFY (${textsToVerify.length} texts):
${textsDescription}

INSTRUCTIONS:

For EACH text in the list above:

1. **Locate the bounding box region** in the image using the provided coordinates
2. **Read the text** carefully in that specific region
3. **Compare** with the original OCR result
4. **Determine if it changed**:
   - If the text is the same or very similar → changed: false
   - If the text is different or significantly corrected → changed: true

IMPORTANT NOTES:
- For Japanese text, pay attention to full-width vs half-width characters
- Parentheses matter: "防" vs "(防)" are different
- Spacing matters: "物入" vs "物 入" are different
- Numbers with commas: "1820" vs "1,820" are different
- Be precise and accurate

OUTPUT REQUIREMENTS:

Return a JSON object with this structure:
{
  "verified_texts": [
    {
      "bbox_index": <number>,        // The bbox_index from input (IMPORTANT!)
      "original_text": "<string>",   // The original OCR text
      "verified_text": "<string>",   // The correct text you see in the image
      "confidence": <number>,        // 0-1 (how confident you are in the verified text)
      "changed": <boolean>,          // true if text was corrected, false if confirmed as correct
      "reasoning": "<string>"        // Brief explanation (e.g., "confirmed correct", "corrected spacing", "added parentheses")
    },
    ... (one entry for each text)
  ]
}

IMPORTANT:
- Return verification for ALL ${textsToVerify.length} texts in the same order as the input
- Each entry MUST include the "bbox_index" field matching the input
- Be honest: if the original OCR was correct, say so (changed: false)
- If you can't clearly see the text, return the original text with lower confidence
- Confidence should be high (0.9+) when text is clearly visible

RESPONSE FORMAT:
Return a valid JSON object with the "verified_texts" array containing all results.`;

  const result = await model.generateContent([imagePart, prompt]);

  const response = result.response;
  const jsonText = response.text();

  try {
    const parsedOutput = JSON.parse(jsonText);

    const validatedOutput = BatchVerificationOutputSchema.parse(parsedOutput);

    return validatedOutput.verified_texts;
  } catch (error) {
    console.error('Failed to parse batch verification output:', error);
    console.error('Raw response:', jsonText);
    throw new Error('Batch text verification failed');
  }
}
