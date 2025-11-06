import { geminiClient } from '../lib/gemini-client.js';
import { db, extractionResults } from '../db/index.js';

/**
 * Process drawing with Gemini 2.0 Flash multimodal
 */
export async function processWithGemini(imagePath: string, drawingId: string) {
  console.log(`  Processing with Gemini...`);
  const startTime = Date.now();

  try {
    // Extract data using Gemini
    const extractedData = await geminiClient.extractDrawingData(imagePath);

    // Validate equipment against known construction terms
    const validEquipmentTypes = [
      'タワークレーン',
      'ラフタークレーン',
      'クローラクレーン',
      '仮囲い',
      '資材置場',
      '事務所棟',
      'ゲート',
      '安全柵',
      '足場',
      'ダンプ',
      'トラック',
      'バックホー',
      'ショベル',
      'ポンプ車',
      // Architectural terms
      '浴室',
      '洗面室',
      '押入',
      '床の間',
      '板の間',
      'トイレ',
      'キッチン',
      '玄関',
      '和室',
      'リビング',
    ];

    const validatedEquipment = (extractedData.equipment || []).map((eq: any) => ({
      ...eq,
      isValid: validEquipmentTypes.some((type) => eq.name?.includes(type)),
      confidence: eq.confidence || 0.9,
    }));

    const validatedData = {
      ...extractedData,
      equipment: validatedEquipment,
    };

    const processingTime = Date.now() - startTime;
    const estimatedCost = geminiClient.estimateCost(1);

    // Save to database
    const [dbResult] = await db
      .insert(extractionResults)
      .values({
        drawingId,
        tool: 'gemini-2.0-flash',
        extractedData: validatedData,
        processingTimeMs: processingTime,
        apiCost: estimatedCost,
      })
      .returning();

    console.log(`  ✅ Gemini completed in ${(processingTime / 1000).toFixed(2)}s`);

    return {
      success: true,
      extractionResultId: dbResult.id,
      tool: 'gemini-2.0-flash',
      processingTime,
      cost: estimatedCost,
    };
  } catch (error) {
    console.error(`  ❌ Gemini failed:`, error);
    throw error;
  }
}
