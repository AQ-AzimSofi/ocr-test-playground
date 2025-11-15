// External imports
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

// Internal imports
import { cleanAICommentary } from './utils.js';

dotenv.config({ path: '.env.development' });

/**
 * Google Gemini API client wrapper
 * Handles multimodal image analysis for construction drawings
 */
export class GeminiClient {
  private genAI: GoogleGenerativeAI;
  private model: string;

  constructor(model: string = 'gemini-2.5-flash') {
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_GEMINI_API_KEY environment variable not set');
    }

    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = model;
  }

  /**
   * Extract all visible text from an image using OCR
   * Includes post-processing to remove AI commentary/preambles
   */
  async extractText(
    imagePath: string
  ): Promise<{ text: string; confidence?: number }> {
    const model = this.genAI.getGenerativeModel({ model: this.model });

    const prompt = `You are a pure OCR system. Extract ALL visible text from this image.

CRITICAL RULES:
- Return ONLY the raw text characters exactly as they appear
- NO explanations, NO comments, NO markdown formatting
- NO preambles like "Here is...", "I found...", "Based on..."
- Just the text itself, nothing else
- Maintain reading order and use newlines to separate text sections

Include:
- All numbers and digits
- All characters (Japanese, English, symbols)
- All special characters (×, ㎡, m², etc.)

WRONG (DO NOT DO THIS):
"Here is the extracted text:
10,920
浴室"

CORRECT (DO THIS):
"10,920
浴室"`;

    const imageData = fs.readFileSync(imagePath);
    const base64Image = imageData.toString('base64');

    const mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: base64Image,
          mimeType,
        },
      },
    ]);

    const response = result.response;
    const rawText = response.text();

    // Clean the response to remove any AI-generated commentary
    const { cleaned, hadCommentary, removedPatterns } =
      cleanAICommentary(rawText);

    // Log warning if commentary was detected and removed
    if (hadCommentary) {
      console.warn(
        `  Gemini added commentary (removed: ${removedPatterns.join(', ')})`
      );
    }

    // Gemini doesn't provide confidence scores for raw text extraction
    return {
      text: cleaned,
    };
  }

  /**
   * Extract text from a specific region (cropped image)
   * Optimized for small text regions in hybrid OCR workflows
   */
  async extractTextFromRegion(
    base64Image: string,
    context?: {
      originalText?: string;
      surroundingText?: string;
    }
  ): Promise<{ text: string; confidence?: number }> {
    const model = this.genAI.getGenerativeModel({ model: this.model });

    let prompt = `You are a pure OCR system. This is a SMALL REGION cropped from a larger image.
Extract ONLY the visible text in this cropped region.

CRITICAL RULES:
- Return ONLY the raw text characters exactly as they appear
- NO explanations, NO comments, NO formatting
- NO preambles like "Here is...", "I found...", "The text is..."
- Just the text itself, nothing else
- This is a small region, output should be short`;

    if (context?.originalText) {
      prompt += `\n\nOriginal OCR detected: "${context.originalText}"
Please verify or correct this text based on what you see in the image.`;
    }

    if (context?.surroundingText) {
      prompt += `\n\nSurrounding context: "${context.surroundingText}"
This may help you understand the text in this region.`;
    }

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: base64Image,
          mimeType: 'image/png',
        },
      },
    ]);

    const response = result.response;
    const rawText = response.text();

    // Clean the response
    const { cleaned, hadCommentary } = cleanAICommentary(rawText);

    if (hadCommentary) {
      console.warn(`  Gemini added commentary in region extraction`);
    }

    return {
      text: cleaned.trim(),
      // Gemini doesn't provide confidence scores
    };
  }

  /**
   * Batch extract text from multiple regions
   * More efficient than calling extractTextFromRegion multiple times
   */
  async batchExtractTextFromRegions(
    regions: Array<{
      base64: string;
      originalText?: string;
    }>
  ): Promise<Array<{ text: string; confidence?: number }>> {
    // Process regions in parallel with concurrency limit
    const concurrency = 3; // Gemini rate limits
    const results: Array<{ text: string; confidence?: number }> = [];

    for (let i = 0; i < regions.length; i += concurrency) {
      const batch = regions.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map((region) =>
          this.extractTextFromRegion(region.base64, {
            originalText: region.originalText,
          })
        )
      );
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Extract structured data from construction drawing image
   */
  async extractDrawingData(imagePath: string) {
    const model = this.genAI.getGenerativeModel({ model: this.model });

    const prompt = `
あなたは建設図面の専門家です。この配置図（layout drawing）を分析してください。

以下のデータを抽出してJSON形式で返してください：

1. **寸法・測定値** (dimensions):
   - すべての数値と単位（mm、cm、mなど）
   - 例: "3500mm", "1255×960", "R=450"

2. **設備・機器ラベル** (equipment):
   - 機器名称（タワークレーン、仮囲い、事務所棟など）
   - 仕様（13t、25tなど）
   - おおよその配置位置

3. **エリア情報** (areas):
   - エリア名（資材置場、駐車場など）
   - サイズ情報

4. **距離・間隔** (distances):
   - 要素間の距離測定値

JSONフォーマット（このフォーマット以外は返さないでください）:
{
  "dimensions": [
    {
      "value": "3500mm",
      "location": "top-left",
      "element": "資材置場",
      "type": "length"
    }
  ],
  "equipment": [
    {
      "name": "タワークレーン",
      "spec": "13t",
      "position": {"x": 100, "y": 200}
    }
  ],
  "areas": [
    {
      "name": "資材置場",
      "size": "3500mm × 4200mm"
    }
  ],
  "distances": [
    {
      "value": "1500mm",
      "between": ["element1", "element2"]
    }
  ]
}

重要な注意事項：
- 図面に書かれている内容のみを抽出してください
- 推測は避けてください
- すべての数値は正確に抽出してください
- JSONのみを返してください（他のテキストは不要）
`;

    const imageData = fs.readFileSync(imagePath);
    const base64Image = imageData.toString('base64');

    const mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: base64Image,
          mimeType,
        },
      },
    ]);

    const response = result.response;
    const text = response.text();

    // Extract JSON from markdown code blocks if present
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/);
    const jsonText = jsonMatch ? jsonMatch[1] : text;

    try {
      return JSON.parse(jsonText);
    } catch (error) {
      console.error('Failed to parse Gemini response as JSON:', text);
      throw new Error(`Failed to parse Gemini response: ${error}`);
    }
  }

  /**
   * Custom extraction with user-provided prompt
   */
  async extractWithCustomPrompt(imagePath: string, prompt: string) {
    const model = this.genAI.getGenerativeModel({ model: this.model });

    const imageData = fs.readFileSync(imagePath);
    const base64Image = imageData.toString('base64');

    const mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: base64Image,
          mimeType,
        },
      },
    ]);

    return result.response.text();
  }

  /**
   * Estimate API cost based on tokens
   * Gemini 2.0 Flash pricing: Very cheap, often free tier covers it
   */
  estimateCost(imageCount: number = 1, isRegion: boolean = false): number {
    // Gemini 2.0 Flash is very cheap
    // Full image: ~0.05 yen per image
    // Small region: ~0.02 yen per region (smaller input)
    const costPerImage = isRegion ? 0.02 : 0.05;
    return imageCount * costPerImage;
  }
}

export const geminiClient = new GeminiClient();
