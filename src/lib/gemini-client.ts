import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.development' });

/**
 * Google Gemini API client wrapper
 * Handles multimodal image analysis for construction drawings
 */
export class GeminiClient {
  private genAI: GoogleGenerativeAI;
  private model: string;

  constructor(model: string = 'gemini-2.0-flash-exp') {
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_GEMINI_API_KEY environment variable not set');
    }

    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = model;
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
  estimateCost(imageCount: number = 1): number {
    // Gemini 2.0 Flash is very cheap
    // Estimate: ~0.05 yen per image (rough estimate)
    const costPerImage = 0.05;
    return imageCount * costPerImage;
  }
}

export const geminiClient = new GeminiClient();
