import { geminiClient } from '../lib/gemini-client.js';
import { db, extractionResults } from '../db/index.js';

/**
 * Process drawing with Gemini 2.0 Flash multimodal for character-level OCR
 */
export async function processWithGemini(imagePath: string, drawingId: string) {
  console.log(`  Processing with Gemini...`);
  const startTime = Date.now();

  try {
    // Extract text using Gemini
    const result = await geminiClient.extractText(imagePath);

    const processingTime = Date.now() - startTime;
    const estimatedCost = geminiClient.estimateCost(1);

    // Save to database (only raw text, no semantic extraction)
    const [dbResult] = await db
      .insert(extractionResults)
      .values({
        drawingId,
        tool: 'gemini-2.0-flash',
        rawText: result.text,
        processingTimeMs: processingTime,
        apiCost: estimatedCost,
      })
      .returning();

    console.log(`  Gemini completed in ${(processingTime / 1000).toFixed(2)}s`);
    console.log(`     Extracted ${result.text.length} characters`);

    return {
      success: true,
      extractionResultId: dbResult.id,
      tool: 'gemini-2.0-flash',
      rawText: result.text,
      confidence: result.confidence,
      processingTime,
      cost: estimatedCost,
    };
  } catch (error) {
    console.error(`  Gemini failed:`, error);
    throw error;
  }
}
