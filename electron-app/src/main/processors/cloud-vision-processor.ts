import vision from '@google-cloud/vision';
import fs from 'fs';
import path from 'path';
import os from 'os';

const isDevelopment = process.env.NODE_ENV !== 'production';

/**
 * Google Cloud Vision processor for Electron app
 * Simplified version without database - returns results directly
 */

export interface CloudVisionResult {
  success: boolean;
  tool: string;
  rawText: string;
  boundingBoxes: Array<{
    text: string;
    bounds: Array<{ x: number; y: number }>;
    confidence: number;
    page: number;
  }>;
  confidence: number;
  processingTime: number;
  cost: number;
  metadata: {
    granularity: string;
    avgConfidence: number;
    regionCount: number;
    pageCount: number;
  };
  error?: string;
}

export interface CloudVisionCredentials {
  apiKey?: string;
  serviceAccountJson?: string;
  projectId?: string;
}

export class CloudVisionProcessor {
  private client: any; // vision.ImageAnnotatorClient
  private tempCredentialsPath?: string;

  constructor(credentials: CloudVisionCredentials) {
    // Method 1 (Recommended): Service Account JSON
    if (credentials.serviceAccountJson && credentials.projectId) {
      // Write service account JSON to temp file
      const tmpDir = os.tmpdir();
      this.tempCredentialsPath = path.join(
        tmpDir,
        `gcp-credentials-${Date.now()}.json`
      );

      fs.writeFileSync(
        this.tempCredentialsPath,
        credentials.serviceAccountJson,
        'utf-8'
      );

      // Initialize client with service account
      this.client = new vision.ImageAnnotatorClient({
        keyFilename: this.tempCredentialsPath,
        projectId: credentials.projectId,
      });
    }
    // Method 2 (Fallback): API Key
    else if (credentials.apiKey) {
      this.client = new vision.ImageAnnotatorClient({
        apiKey: credentials.apiKey,
      });
    }
    // Method 3 (Last resort): Use environment variable
    else {
      this.client = new vision.ImageAnnotatorClient();
    }
  }

  /**
   * Clean up temp credentials file
   */
  cleanup() {
    if (this.tempCredentialsPath && fs.existsSync(this.tempCredentialsPath)) {
      try {
        fs.unlinkSync(this.tempCredentialsPath);
      } catch (error) {
        console.error('Failed to cleanup temp credentials:', error);
      }
    }
  }

  /**
   * Process a single image with Cloud Vision OCR
   * @param imagePath - Path to image file (PNG, JPEG, PDF, etc.)
   * @param pageNumber - Page number for multi-page documents (default: 1)
   */
  async processImage(
    imagePath: string,
    pageNumber: number = 1
  ): Promise<CloudVisionResult> {
    const startTime = Date.now();

    try {
      // Validate file exists
      if (!fs.existsSync(imagePath)) {
        throw new Error(`Image file not found: ${imagePath}`);
      }

      // For PDFs, read as buffer and pass as content. For images, use file path.
      const isPdf = imagePath.toLowerCase().endsWith('.pdf');
      let result;

      if (isPdf) {
        // Read PDF file and send as buffer content
        const pdfBuffer = fs.readFileSync(imagePath);
        [result] = await this.client.documentTextDetection({
          image: { content: pdfBuffer }
        });
      } else {
        // For images, use file path as before
        [result] = await this.client.documentTextDetection(imagePath);
      }
      const fullTextAnnotation = result.fullTextAnnotation;

      if (!fullTextAnnotation || !fullTextAnnotation.pages) {
        return {
          success: true,
          tool: 'cloud-vision',
          rawText: '',
          boundingBoxes: [],
          confidence: 0,
          processingTime: Date.now() - startTime,
          cost: this.estimateCost(1),
          metadata: {
            granularity: 'paragraph',
            avgConfidence: 0,
            regionCount: 0,
            pageCount: 1,
          },
        };
      }

      // Extract bounding boxes at paragraph level
      const boundingBoxes: Array<{
        text: string;
        bounds: Array<{ x: number; y: number }>;
        confidence: number;
        page: number;
      }> = [];

      for (const page of fullTextAnnotation.pages) {
        for (const block of page.blocks || []) {
          for (const paragraph of block.paragraphs || []) {
            const text =
              paragraph.words
                ?.map(
                  (word: any) =>
                    word.symbols?.map((symbol: any) => symbol.text).join('') || ''
                )
                .join(' ') || '';

            const vertices = paragraph.boundingBox?.vertices || [];
            const confidence = paragraph.confidence || 0;

            boundingBoxes.push({
              text,
              bounds: vertices.map((v: any) => ({ x: v.x || 0, y: v.y || 0 })),
              confidence,
              page: pageNumber,
            });
          }
        }
      }

      const rawText = boundingBoxes.map((b) => b.text).join('\n');

      // Calculate average confidence
      const avgConfidence =
        boundingBoxes.length > 0
          ? boundingBoxes.reduce((sum, b) => sum + b.confidence, 0) /
            boundingBoxes.length
          : 0;

      const processingTime = Date.now() - startTime;
      const cost = this.estimateCost(1);

      return {
        success: true,
        tool: 'cloud-vision',
        rawText,
        boundingBoxes,
        confidence: avgConfidence,
        processingTime,
        cost,
        metadata: {
          granularity: 'paragraph',
          avgConfidence,
          regionCount: boundingBoxes.length,
          pageCount: 1,
        },
      };
    } catch (error) {
      return {
        success: false,
        tool: 'cloud-vision',
        rawText: '',
        boundingBoxes: [],
        confidence: 0,
        processingTime: Date.now() - startTime,
        cost: 0,
        metadata: {
          granularity: 'paragraph',
          avgConfidence: 0,
          regionCount: 0,
          pageCount: 1,
        },
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Process multiple images (e.g., from PDF pages)
   */
  async processImages(
    imagePaths: string[]
  ): Promise<CloudVisionResult> {
    const startTime = Date.now();

    try {
      const allBboxes: Array<{
        text: string;
        bounds: Array<{ x: number; y: number }>;
        confidence: number;
        page: number;
      }> = [];

      let totalCost = 0;

      // Process each page
      for (let i = 0; i < imagePaths.length; i++) {
        const pageNum = i + 1;
        const result = await this.processImage(imagePaths[i], pageNum);

        if (result.success) {
          allBboxes.push(...result.boundingBoxes);
          totalCost += result.cost;
        } else {
          // If any page fails, return error
          return {
            ...result,
            processingTime: Date.now() - startTime,
            error: `Failed on page ${pageNum}: ${result.error}`,
          };
        }
      }

      const rawText = allBboxes.map((b) => b.text).join('\n');

      // Calculate average confidence
      const avgConfidence =
        allBboxes.length > 0
          ? allBboxes.reduce((sum, b) => sum + b.confidence, 0) /
            allBboxes.length
          : 0;

      return {
        success: true,
        tool: 'cloud-vision',
        rawText,
        boundingBoxes: allBboxes,
        confidence: avgConfidence,
        processingTime: Date.now() - startTime,
        cost: totalCost,
        metadata: {
          granularity: 'paragraph',
          avgConfidence,
          regionCount: allBboxes.length,
          pageCount: imagePaths.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        tool: 'cloud-vision',
        rawText: '',
        boundingBoxes: [],
        confidence: 0,
        processingTime: Date.now() - startTime,
        cost: 0,
        metadata: {
          granularity: 'paragraph',
          avgConfidence: 0,
          regionCount: 0,
          pageCount: imagePaths.length,
        },
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Estimate API cost
   * Cloud Vision pricing: ~0.15 yen per image
   */
  estimateCost(imageCount: number = 1): number {
    return imageCount * 0.15;
  }
}
