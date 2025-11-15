import { DocumentProcessorServiceClient } from '@google-cloud/documentai';
import fs from 'fs';
import sharp from 'sharp';
import type { ProcessorResult } from './types';

/**
 * Google Document AI processor for Electron app
 */

export class DocumentAIProcessor {
  private client: DocumentProcessorServiceClient;
  private projectId: string;
  private processorId: string;
  private location: string;

  constructor(
    projectId: string,
    credentials: string,
    processorId: string,
    location: string
  ) {
    this.projectId = projectId;
    this.processorId = processorId;
    this.location = location;

    // Parse credentials JSON
    let credentialsObj;
    try {
      credentialsObj = JSON.parse(credentials);
    } catch (error) {
      throw new Error('Invalid Document AI credentials JSON');
    }

    this.client = new DocumentProcessorServiceClient({
      credentials: credentialsObj,
    });
  }

  /**
   * Process document with Document AI OCR
   */
  async process(filePath: string): Promise<ProcessorResult> {
    const startTime = Date.now();

    try {
      const imageBuffer = fs.readFileSync(filePath);
      const encodedImage = imageBuffer.toString('base64');

      // Get actual image dimensions for coordinate conversion
      const metadata = await sharp(imageBuffer).metadata();
      const imageWidth = metadata.width || 1000;
      const imageHeight = metadata.height || 1000;

      // Determine MIME type
      const ext = filePath.toLowerCase().split('.').pop();
      let mimeType = 'application/pdf';
      if (ext === 'png') mimeType = 'image/png';
      else if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';

      const request = {
        name: `projects/${this.projectId}/locations/${this.location}/processors/${this.processorId}`,
        rawDocument: {
          content: encodedImage,
          mimeType,
        },
      };

      const [result] = await this.client.processDocument(request);

      if (!result.document) {
        return {
          success: true,
          tool: 'document-ai',
          rawText: '',
          boundingBoxes: [],
          confidence: 0,
          processingTime: Date.now() - startTime,
          cost: this.estimateCost(1),
          metadata: {
            granularity: 'word',
            pageCount: 0,
            avgConfidence: 0,
          },
        };
      }

      // Extract text and bounding boxes
      const boundingBoxes: Array<{
        text: string;
        bounds: Array<{ x: number; y: number }>;
        confidence: number;
        page: number;
      }> = [];

      let pageNum = 1;
      for (const page of result.document.pages || []) {
        for (const token of page.tokens || []) {
          const text = this.getTextFromLayout(
            token.layout,
            result.document.text || ''
          );

          const vertices = token.layout?.boundingPoly?.normalizedVertices || [];
          const confidence = token.layout?.confidence || 0;

          boundingBoxes.push({
            text,
            bounds: vertices.map((v) => ({
              x: (v.x || 0) * imageWidth,  // Convert normalized (0-1) to pixel coordinates
              y: (v.y || 0) * imageHeight,
            })),
            confidence,
            page: pageNum,
          });
        }
        pageNum++;
      }

      const rawText = result.document.text || '';

      // Calculate average confidence
      const avgConfidence =
        boundingBoxes.length > 0
          ? boundingBoxes.reduce((sum, b) => sum + b.confidence, 0) /
            boundingBoxes.length
          : 0;

      return {
        success: true,
        tool: 'document-ai',
        rawText,
        boundingBoxes,
        confidence: avgConfidence,
        processingTime: Date.now() - startTime,
        cost: this.estimateCost(result.document.pages?.length || 1),
        metadata: {
          granularity: 'word',
          wordCount: boundingBoxes.length,
          pageCount: result.document.pages?.length || 0,
          avgConfidence,
        },
      };
    } catch (error) {
      return {
        success: false,
        tool: 'document-ai',
        rawText: '',
        boundingBoxes: [],
        confidence: 0,
        processingTime: Date.now() - startTime,
        cost: 0,
        metadata: {
          granularity: 'word',
          pageCount: 0,
          avgConfidence: 0,
        },
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Extract text from layout using text anchors
   */
  private getTextFromLayout(layout: any, fullText: string): string {
    if (!layout || !layout.textAnchor) {
      return '';
    }

    const { textSegments } = layout.textAnchor;
    if (!textSegments || textSegments.length === 0) {
      return '';
    }

    let text = '';
    for (const segment of textSegments) {
      const startIndex = parseInt(segment.startIndex || '0');
      const endIndex = parseInt(segment.endIndex || '0');
      text += fullText.substring(startIndex, endIndex);
    }

    return text;
  }

  /**
   * Estimate API cost
   * Document AI pricing: ~0.225 yen per page
   */
  estimateCost(pageCount: number = 1): number {
    return pageCount * 0.225;
  }
}
