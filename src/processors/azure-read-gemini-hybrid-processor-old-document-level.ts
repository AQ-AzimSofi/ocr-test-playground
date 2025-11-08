import { azureDocumentClient } from '../lib/azure-document-client.js';
import { geminiClient } from '../lib/gemini-client.js';
import { db, extractionResults } from '../db/index.js';
import Levenshtein from 'fast-levenshtein';

/**
 * Azure Read + Gemini Hybrid Processor
 *
 * Strategy:
 * 1. Run Azure Read (prebuilt-read) to get word-level bounding boxes + confidence
 * 2. Run Gemini in parallel for robust text extraction
 * 3. Analyze word-level confidence scores from Azure
 * 4. Compare results and identify discrepancies
 * 5. Combine intelligently:
 *    - Use Azure Read for spatial data (word-level bounding boxes)
 *    - Use Gemini text where Azure has low word-level confidence
 *    - Flag disagreements for user review
 */

interface WordConfidenceRegion {
  index: number;
  text: string;
  confidence: number;
  bounds: Array<{ x: number; y: number }>;
  page: number;
  isLowConfidence: boolean;
}

interface ComparisonResult {
  azureText: string;
  geminiText: string;
  similarity: number;
  editDistance: number;
  selectedText: string;
  selectionReason: string;
  lowConfidenceWords: WordConfidenceRegion[];
  highConfidenceWords: WordConfidenceRegion[];
  discrepancies: Array<{
    word: WordConfidenceRegion;
    geminiVersion: string;
    reason: string;
  }>;
}

export async function processWithAzureReadGeminiHybrid(imagePath: string, drawingId: string) {
  console.log(`  Processing with Azure Read + Gemini Hybrid...`);
  const startTime = Date.now();

  try {
    // Run both tools in parallel for speed
    const [azureResult, geminiResult] = await Promise.all([
      azureDocumentClient.analyzeRead(imagePath),
      geminiClient.extractText(imagePath),
    ]);

    const azureText = azureResult.content;
    const geminiText = geminiResult.text;

    // Analyze word-level confidence scores
    const LOW_CONFIDENCE_THRESHOLD = 0.85; // Adjustable threshold

    const lowConfidenceWords: WordConfidenceRegion[] = [];
    const highConfidenceWords: WordConfidenceRegion[] = [];

    azureResult.words.forEach((word, index) => {
      const region: WordConfidenceRegion = {
        index,
        text: word.text,
        confidence: word.confidence || 0,
        bounds: word.bounds,
        page: word.page,
        isLowConfidence: (word.confidence || 0) < LOW_CONFIDENCE_THRESHOLD,
      };

      if (region.isLowConfidence) {
        lowConfidenceWords.push(region);
      } else {
        highConfidenceWords.push(region);
      }
    });

    // Calculate similarity between Azure and Gemini results
    const editDistance = Levenshtein.get(azureText, geminiText);
    const maxLength = Math.max(azureText.length, geminiText.length);
    const similarity = maxLength > 0 ? ((maxLength - editDistance) / maxLength) * 100 : 0;

    // Decision logic for text selection
    let selectedText: string;
    let selectionReason: string;
    const discrepancies: ComparisonResult['discrepancies'] = [];

    // Calculate low-confidence percentage at word level
    const lowConfidencePercentage = (lowConfidenceWords.length / azureResult.words.length) * 100;

    // Calculate average confidence
    const avgConfidence = azureResult.words.length > 0
      ? azureResult.words.reduce((sum, w) => sum + (w.confidence || 0), 0) / azureResult.words.length
      : 0;

    if (lowConfidencePercentage > 30) {
      // Many low-confidence words - prefer Gemini
      selectedText = geminiText;
      selectionReason = `High percentage of low-confidence words (${lowConfidencePercentage.toFixed(1)}%) - using Gemini`;

      // Flag all low-confidence words as discrepancies
      lowConfidenceWords.forEach(word => {
        discrepancies.push({
          word,
          geminiVersion: 'Used Gemini due to low confidence',
          reason: `Word confidence ${(word.confidence * 100).toFixed(1)}% < ${LOW_CONFIDENCE_THRESHOLD * 100}%`,
        });
      });
    } else if (similarity < 70) {
      // Low agreement - prefer longer/more complete extraction
      if (geminiText.length > azureText.length) {
        selectedText = geminiText;
        selectionReason = `Low agreement (${similarity.toFixed(1)}%), Gemini extracted more text (${geminiText.length} vs ${azureText.length} chars)`;
      } else {
        selectedText = azureText;
        selectionReason = `Low agreement (${similarity.toFixed(1)}%), Azure extracted more text (${azureText.length} vs ${geminiText.length} chars)`;
      }
    } else {
      // High agreement - use Azure (has word-level spatial data)
      selectedText = azureText;
      selectionReason = `High agreement (${similarity.toFixed(1)}%) - using Azure with word-level spatial data`;

      // Still flag low-confidence words for user awareness
      lowConfidenceWords.forEach(word => {
        discrepancies.push({
          word,
          geminiVersion: 'Alternative extraction available from Gemini',
          reason: `Low confidence: ${(word.confidence * 100).toFixed(1)}%`,
        });
      });
    }

    const processingTime = Date.now() - startTime;

    // Estimate combined cost
    const azureCost = azureDocumentClient.estimateCost(azureResult.pages.length, 'read');
    const geminiCost = geminiClient.estimateCost(geminiText.length);
    const estimatedCost = azureCost + geminiCost;

    // Save to database with comprehensive metadata
    const [dbResult] = await db
      .insert(extractionResults)
      .values({
        drawingId,
        tool: 'azure-read-gemini-hybrid',
        rawText: selectedText,
        boundingBoxes: azureResult.words.map((word, index) => ({
          text: word.text,
          bounds: word.bounds,
          confidence: word.confidence,
          page: word.page,
          metadata: {
            isLowConfidence: lowConfidenceWords.some(w => w.index === index),
            usedGeminiFallback: selectedText === geminiText && lowConfidenceWords.some(w => w.index === index),
            granularity: 'word',
          },
        })),
        processingTimeMs: processingTime,
        apiCost: estimatedCost,
        metadata: {
          azureCharCount: azureText.length,
          azureWordCount: azureResult.words.length,
          geminiCharCount: geminiText.length,
          selectedSource: selectedText === azureText ? 'azure-read' : 'gemini',
          selectionReason,
          similarity,
          editDistance,
          avgConfidence,
          lowConfidenceWordsCount: lowConfidenceWords.length,
          highConfidenceWordsCount: highConfidenceWords.length,
          lowConfidencePercentage,
          discrepanciesCount: discrepancies.length,
          confidenceThreshold: LOW_CONFIDENCE_THRESHOLD,
          granularity: 'word',
        },
      })
      .returning();

    console.log(`  ✅ Azure Read + Gemini Hybrid completed in ${(processingTime / 1000).toFixed(2)}s`);
    console.log(`     Selected: ${selectedText === azureText ? 'Azure Read' : 'Gemini'} (${selectedText.length} chars)`);
    console.log(`     Azure Read: ${azureText.length} chars, ${azureResult.words.length} words (avg confidence: ${(avgConfidence * 100).toFixed(1)}%)`);
    console.log(`     Gemini: ${geminiText.length} chars`);
    console.log(`     Agreement: ${similarity.toFixed(1)}%`);
    console.log(`     Low confidence words: ${lowConfidenceWords.length}/${azureResult.words.length} (${lowConfidencePercentage.toFixed(1)}%)`);
    if (discrepancies.length > 0) {
      console.log(`     ⚠️  ${discrepancies.length} words flagged for review`);
    }

    return {
      success: true,
      extractionResultId: dbResult.id,
      tool: 'azure-read-gemini-hybrid',
      rawText: selectedText,
      confidence: avgConfidence,
      processingTime,
      cost: estimatedCost,
      metadata: {
        azureText,
        geminiText,
        similarity,
        selectionReason,
        lowConfidenceWords: lowConfidenceWords.length,
        discrepancies: discrepancies.length,
        granularity: 'word',
      },
    };
  } catch (error) {
    console.error(`  ❌ Azure Read + Gemini Hybrid failed:`, error);
    throw error;
  }
}
