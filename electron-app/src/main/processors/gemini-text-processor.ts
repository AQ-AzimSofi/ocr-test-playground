import { GoogleGenerativeAI } from '@google/generative-ai';
import { GeminiRequestQueue, QueueConfig, QueueProgress, RateLimitDecision } from '../utils/gemini-queue';
import { GeminiRateLimitError } from '../utils/gemini-errors';

const isDevelopment = process.env.NODE_ENV !== 'production';

/**
 * Gemini Text Processor for Electron App
 * Handles text extraction from images and image regions
 * Simplified version without database dependencies
 */

/**
 * Clean AI-generated commentary/preambles from Gemini responses
 * Gemini sometimes adds explanatory text even when told not to
 */
function cleanAICommentary(text: string): {
  cleaned: string;
  hadCommentary: boolean;
  removedPatterns: string[];
} {
  const removedPatterns: string[] = [];
  let cleaned = text;

  // Remove common preamble patterns
  const patterns = [
    /^Here (?:is|are) the (?:extracted )?text[:\s]*/im,
    /^(?:I found|I extracted|I see|Based on)[^\n]*:?\s*/im,
    /^The (?:extracted )?text (?:is|appears to be|reads)[:\s]*/im,
    /^```(?:text)?\n/im,
    /\n```$/im,
  ];

  for (const pattern of patterns) {
    if (pattern.test(cleaned)) {
      removedPatterns.push(pattern.toString());
      cleaned = cleaned.replace(pattern, '');
    }
  }

  const hadCommentary = removedPatterns.length > 0;

  return {
    cleaned: cleaned.trim(),
    hadCommentary,
    removedPatterns,
  };
}

export class GeminiTextProcessor {
  private genAI: GoogleGenerativeAI;
  private model: string;
  private queue: GeminiRequestQueue;

  constructor(
    apiKey: string,
    model: string = 'gemini-2.5-flash',
    queueConfig?: Partial<QueueConfig>
  ) {
    if (!apiKey) {
      throw new Error('Gemini API key is required');
    }

    if (isDevelopment) console.log('[DEBUG] GeminiTextProcessor constructor - API key:', {
      received: !!apiKey,
      length: apiKey?.length,
      type: typeof apiKey,
      preview: apiKey?.substring(0, 15) + '...',
      model: model
    });

    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = model;
    this.queue = new GeminiRequestQueue(queueConfig);
  }

  /**
   * Update queue configuration
   */
  updateQueueConfig(config: Partial<QueueConfig>): void {
    this.queue.updateConfig(config);
  }

  /**
   * Get current queue stats
   */
  getQueueStats(): QueueProgress {
    return this.queue.getStats();
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
    },
    useQueue: boolean = true
  ): Promise<{ text: string; confidence?: number }> {
    // Wrap the API call in a function that can be queued
    const executeRequest = async () => {
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

      if (isDevelopment) console.log('[DEBUG] About to call Gemini API:', {
        genAIExists: !!this.genAI,
        modelType: this.model,
        hasPrompt: !!prompt,
        hasImage: !!base64Image,
        imageLength: base64Image?.length
      });

      try {
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
      } catch (error) {
        // Check if it's a rate limit error and enhance it
        const rateLimitError = GeminiRateLimitError.fromGoogleError(error);
        if (rateLimitError) {
          throw rateLimitError;
        }
        throw error;
      }
    };

    // Use queue if enabled, otherwise execute directly
    if (useQueue) {
      return this.queue.enqueue(executeRequest);
    } else {
      return executeRequest();
    }
  }

  /**
   * Batch extract text from multiple regions
   * Uses queue system for smart rate limiting
   */
  async batchExtractTextFromRegions(
    regions: Array<{
      base64: string;
      originalText?: string;
    }>
  ): Promise<Array<{ text: string; confidence?: number }>> {
    // Queue all requests - the queue will handle concurrency and rate limiting
    const promises = regions.map((region) =>
      this.extractTextFromRegion(
        region.base64,
        {
          originalText: region.originalText,
        },
        true // Use queue
      )
    );

    // Wait for all requests to complete
    const results = await Promise.all(promises);
    return results;
  }

  /**
   * Extract text with custom prompt
   * Used for validation and other specialized tasks
   */
  async extractWithCustomPrompt(
    imagePath: string,
    prompt: string,
    useQueue: boolean = true
  ): Promise<string> {
    const executeRequest = async () => {
      const model = this.genAI.getGenerativeModel({ model: this.model });

      // Read image file and convert to base64
      const fs = await import('fs');
      const imageBuffer = fs.readFileSync(imagePath);
      const base64Image = imageBuffer.toString('base64');

      try {
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
        return response.text();
      } catch (error) {
        // Check if it's a rate limit error and enhance it
        const rateLimitError = GeminiRateLimitError.fromGoogleError(error);
        if (rateLimitError) {
          throw rateLimitError;
        }
        throw error;
      }
    };

    // Use queue if enabled, otherwise execute directly
    if (useQueue) {
      return this.queue.enqueue(executeRequest);
    } else {
      return executeRequest();
    }
  }

  /**
   * Estimate API cost based on number of requests
   * Gemini 2.5 Flash pricing: Very cheap
   */
  estimateCost(imageCount: number = 1, isRegion: boolean = false): number {
    // Gemini 2.5 Flash is very cheap
    // Full image: ~0.05 yen per image
    // Small region: ~0.02 yen per region (smaller input)
    const costPerImage = isRegion ? 0.02 : 0.05;
    return imageCount * costPerImage;
  }
}
