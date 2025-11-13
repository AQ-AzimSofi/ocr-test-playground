import {
  AzureKeyCredential,
  DocumentAnalysisClient,
} from '@azure/ai-form-recognizer';
import fs from 'fs';

/**
 * Azure AI Document Intelligence processors for Electron app
 * Includes both Read and Layout models
 */

export interface AzureResult {
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
    model: string;
    wordCount?: number;
    pageCount: number;
    avgConfidence: number;
  };
  error?: string;
}

export class AzureDocumentProcessor {
  private client: DocumentAnalysisClient;

  constructor(endpoint: string, apiKey: string) {
    this.client = new DocumentAnalysisClient(
      endpoint,
      new AzureKeyCredential(apiKey)
    );
  }

  /**
   * Normalize bounding box polygon to always have 4 points
   */
  private normalizeBoundingBox(
    polygon: any[]
  ): Array<{ x: number; y: number }> {
    if (!polygon || polygon.length === 0) {
      return [];
    }

    let points: Array<{ x: number; y: number }>;

    // Handle flat array format [x1, y1, x2, y2, ...]
    if (typeof polygon[0] === 'number') {
      points = [];
      for (let i = 0; i < polygon.length; i += 2) {
        points.push({
          x: polygon[i] || 0,
          y: polygon[i + 1] || 0,
        });
      }
    } else {
      // Handle object array format [{x, y}, ...]
      points = polygon.map((point: any) => ({
        x: point.x || 0,
        y: point.y || 0,
      }));
    }

    // If we already have 4+ points, return as-is
    if (points.length >= 4) {
      return points;
    }

    // If we have exactly 2 points, convert to 4-point rectangle
    if (points.length === 2) {
      const [topLeft, bottomRight] = points;
      return [
        topLeft, // Top-left
        { x: bottomRight.x, y: topLeft.y }, // Top-right
        bottomRight, // Bottom-right
        { x: topLeft.x, y: bottomRight.y }, // Bottom-left
      ];
    }

    return points;
  }

  /**
   * Process with Azure Read model (word-level OCR)
   */
  async processRead(
    filePath: string
  ): Promise<AzureResult> {
    const startTime = Date.now();

    try {
      const imageStream = fs.createReadStream(filePath);

      const poller = await this.client.beginAnalyzeDocument(
        'prebuilt-read',
        imageStream
      );
      const result = await poller.pollUntilDone();

      if (!result || !result.pages) {
        return {
          success: true,
          tool: 'azure-read',
          rawText: '',
          boundingBoxes: [],
          confidence: 0,
          processingTime: Date.now() - startTime,
          cost: this.estimateCost(1, 'read'),
          metadata: {
            granularity: 'word',
            model: 'prebuilt-read',
            wordCount: 0,
            pageCount: 0,
            avgConfidence: 0,
          },
        };
      }

      // Extract words with bounding boxes
      const words: Array<{
        text: string;
        bounds: Array<{ x: number; y: number }>;
        confidence: number;
        page: number;
      }> = [];

      let pageNum = 1;
      for (const page of result.pages) {
        if (!page.words) continue;

        for (const word of page.words) {
          const polygon = word.polygon || [];
          const normalized = this.normalizeBoundingBox(polygon);

          words.push({
            text: word.content || '',
            bounds: normalized,
            confidence: word.confidence || 0,
            page: pageNum,
          });
        }
        pageNum++;
      }

      const rawText = result.content || '';

      // Calculate average confidence
      const avgConfidence =
        words.length > 0
          ? words.reduce((sum, w) => sum + w.confidence, 0) / words.length
          : 0;

      return {
        success: true,
        tool: 'azure-read',
        rawText,
        boundingBoxes: words,
        confidence: avgConfidence,
        processingTime: Date.now() - startTime,
        cost: this.estimateCost(result.pages.length, 'read'),
        metadata: {
          granularity: 'word',
          model: 'prebuilt-read',
          wordCount: words.length,
          pageCount: result.pages.length,
          avgConfidence,
        },
      };
    } catch (error) {
      return {
        success: false,
        tool: 'azure-read',
        rawText: '',
        boundingBoxes: [],
        confidence: 0,
        processingTime: Date.now() - startTime,
        cost: 0,
        metadata: {
          granularity: 'word',
          model: 'prebuilt-read',
          wordCount: 0,
          pageCount: 0,
          avgConfidence: 0,
        },
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Process with Azure Layout model (structure-aware OCR with tables)
   */
  async processLayout(
    filePath: string
  ): Promise<AzureResult> {
    const startTime = Date.now();

    try {
      const imageStream = fs.createReadStream(filePath);

      const poller = await this.client.beginAnalyzeDocument(
        'prebuilt-layout',
        imageStream
      );
      const result = await poller.pollUntilDone();

      if (!result || !result.pages) {
        return {
          success: true,
          tool: 'azure-layout',
          rawText: '',
          boundingBoxes: [],
          confidence: 0,
          processingTime: Date.now() - startTime,
          cost: this.estimateCost(1, 'layout'),
          metadata: {
            granularity: 'line',
            model: 'prebuilt-layout',
            pageCount: 0,
            avgConfidence: 0,
          },
        };
      }

      // Extract lines with bounding boxes
      const lines: Array<{
        text: string;
        bounds: Array<{ x: number; y: number }>;
        confidence: number;
        page: number;
      }> = [];

      let pageNum = 1;
      for (const page of result.pages) {
        if (!page.lines) continue;

        for (const line of page.lines) {
          const polygon = line.polygon || [];
          const normalized = this.normalizeBoundingBox(polygon);

          lines.push({
            text: line.content || '',
            bounds: normalized,
            confidence: 1.0, // Lines don't have confidence in Layout model
            page: pageNum,
          });
        }
        pageNum++;
      }

      const rawText = result.content || '';

      return {
        success: true,
        tool: 'azure-layout',
        rawText,
        boundingBoxes: lines,
        confidence: 1.0,
        processingTime: Date.now() - startTime,
        cost: this.estimateCost(result.pages.length, 'layout'),
        metadata: {
          granularity: 'line',
          model: 'prebuilt-layout',
          pageCount: result.pages.length,
          avgConfidence: 1.0,
        },
      };
    } catch (error) {
      return {
        success: false,
        tool: 'azure-layout',
        rawText: '',
        boundingBoxes: [],
        confidence: 0,
        processingTime: Date.now() - startTime,
        cost: 0,
        metadata: {
          granularity: 'line',
          model: 'prebuilt-layout',
          pageCount: 0,
          avgConfidence: 0,
        },
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Estimate API cost
   * Azure pricing: Read ~0.225 yen/page, Layout ~1.50 yen/page
   */
  estimateCost(pageCount: number, model: 'read' | 'layout'): number {
    const costPerPage = model === 'read' ? 0.225 : 1.5;
    return pageCount * costPerPage;
  }
}
