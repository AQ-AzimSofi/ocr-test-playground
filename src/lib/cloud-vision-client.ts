// External imports
import vision from '@google-cloud/vision';
import * as fs from 'fs';

// Internal imports
import { isPdfFile } from '../utils/pdf-converter.js';

/**
 * Google Cloud Vision API client wrapper
 * Handles document text detection optimized for construction drawings
 */
export class CloudVisionClient {
  private client: vision.ImageAnnotatorClient;

  constructor() {
    this.client = new vision.ImageAnnotatorClient();
  }

  /**
   * Extract text from image using Document Text Detection
   * This is better for dense documents like construction drawings
   */
  async extractText(imagePath: string) {
    const [result] = await this.client.documentTextDetection(imagePath);
    const fullTextAnnotation = result.fullTextAnnotation;

    if (!fullTextAnnotation) {
      return {
        text: '',
        pages: [],
        blocks: [],
      };
    }

    return {
      text: fullTextAnnotation.text || '',
      pages: fullTextAnnotation.pages || [],
      blocks: this.extractBlocks(fullTextAnnotation),
    };
  }

  /**
   * Extract text with bounding boxes for precise location tracking
   * Note: This method only supports image files (PNG, JPEG, etc.)
   * PDFs must be converted to images first using convertPdfToImages()
   */
  async extractTextWithBoundingBoxes(imagePath: string) {
    // Validate that the file is an image, not a PDF
    if (isPdfFile(imagePath)) {
      throw new Error(
        'PDF files are not supported by Cloud Vision documentTextDetection API. ' +
        'PDFs must be converted to images first using the convertPdfToImages() utility from pdf-converter.ts. ' +
        'The processor should handle this conversion automatically.'
      );
    }

    const [result] = await this.client.documentTextDetection(imagePath);
    const fullTextAnnotation = result.fullTextAnnotation;

    if (!fullTextAnnotation || !fullTextAnnotation.pages) {
      return [];
    }

    const boundingBoxes: Array<{
      text: string;
      bounds: Array<{ x: number; y: number }>;
      confidence: number;
    }> = [];

    for (const page of fullTextAnnotation.pages) {
      for (const block of page.blocks || []) {
        for (const paragraph of block.paragraphs || []) {
          const text =
            paragraph.words
              ?.map(
                (word) =>
                  word.symbols?.map((symbol) => symbol.text).join('') || ''
              )
              .join(' ') || '';

          const vertices = paragraph.boundingBox?.vertices || [];
          const confidence = paragraph.confidence || 0;

          boundingBoxes.push({
            text,
            bounds: vertices.map((v) => ({ x: v.x || 0, y: v.y || 0 })),
            confidence,
          });
        }
      }
    }

    return boundingBoxes;
  }

  /**
   * Extract blocks of text with their positions
   */
  private extractBlocks(
    fullTextAnnotation: vision.protos.google.cloud.vision.v1.ITextAnnotation
  ) {
    const blocks: Array<{
      text: string;
      bounds: Array<{ x: number; y: number }>;
      confidence: number;
    }> = [];

    if (!fullTextAnnotation.pages) {
      return blocks;
    }

    for (const page of fullTextAnnotation.pages) {
      for (const block of page.blocks || []) {
        const text =
          block.paragraphs
            ?.map(
              (p) =>
                p.words
                  ?.map((w) => w.symbols?.map((s) => s.text).join('') || '')
                  .join(' ') || ''
            )
            .join('\n') || '';

        const vertices = block.boundingBox?.vertices || [];
        const confidence = block.confidence || 0;

        blocks.push({
          text,
          bounds: vertices.map((v) => ({ x: v.x || 0, y: v.y || 0 })),
          confidence,
        });
      }
    }

    return blocks;
  }

  /**
   * Estimate API cost based on features used
   * Cloud Vision pricing: ~$1.50 per 1000 images for Document Text Detection
   */
  estimateCost(imageCount: number = 1): number {
    const costPerImage = 0.15; // yen (approximately $0.0015 * 100 yen/dollar)
    return imageCount * costPerImage;
  }
}

export const cloudVisionClient = new CloudVisionClient();
