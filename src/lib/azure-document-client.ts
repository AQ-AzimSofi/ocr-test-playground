import {
  AzureKeyCredential,
  DocumentAnalysisClient,
} from '@azure/ai-form-recognizer';
import * as fs from 'fs';

/**
 * Azure AI Document Intelligence client wrapper
 * Uses the prebuilt-layout model optimized for technical drawings and documents
 */
export class AzureDocumentClient {
  private client: DocumentAnalysisClient;

  constructor() {
    const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
    const apiKey = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY;

    if (!endpoint || !apiKey) {
      throw new Error(
        'Azure Document Intelligence credentials not found. Please set AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT and AZURE_DOCUMENT_INTELLIGENCE_KEY in .env.development'
      );
    }

    this.client = new DocumentAnalysisClient(
      endpoint,
      new AzureKeyCredential(apiKey)
    );
  }

  /**
   * Analyze document using prebuilt-read model
   * Optimized for OCR with word-level confidence scores
   * Best for text extraction from technical drawings
   */
  async analyzeRead(imagePath: string) {
    const imageStream = fs.createReadStream(imagePath);

    const poller = await this.client.beginAnalyzeDocument(
      'prebuilt-read',
      imageStream
    );
    const result = await poller.pollUntilDone();

    if (!result) {
      return {
        content: '',
        pages: [],
        words: [],
      };
    }

    return {
      content: result.content || '',
      pages: result.pages || [],
      words: this.extractWords(result),
    };
  }

  /**
   * Analyze document using prebuilt-layout model
   * This model is optimized for extracting text, tables, and structure from technical documents
   */
  async analyzeLayout(imagePath: string) {
    const imageStream = fs.createReadStream(imagePath);

    const poller = await this.client.beginAnalyzeDocument(
      'prebuilt-layout',
      imageStream
    );
    const result = await poller.pollUntilDone();

    if (!result) {
      return {
        content: '',
        pages: [],
        tables: [],
        paragraphs: [],
        lines: [],
      };
    }

    return {
      content: result.content || '',
      pages: result.pages || [],
      tables: result.tables || [],
      paragraphs: result.paragraphs || [],
      lines: this.extractLines(result),
    };
  }

  /**
   * Normalize bounding box polygon to always have 4 points
   * Azure API sometimes returns only 2 points (diagonal corners)
   * This converts 2-point boxes to proper 4-point rectangles
   *
   * Also handles two polygon formats:
   * - Flat array: [x1, y1, x2, y2, x3, y3, x4, y4]
   * - Object array: [{x, y}, {x, y}, {x, y}, {x, y}]
   */
  private normalizeBoundingBox(
    polygon: any[]
  ): Array<{ x: number; y: number }> {
    if (!polygon || polygon.length === 0) {
      return [];
    }

    let points: Array<{ x: number; y: number }>;

    // Handle flat array format from Azure [x1, y1, x2, y2, ...]
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

    const inputLength = points.length;

    // Debug: Always log to verify this method is being called
    const debugEnabled = process.env.DEBUG_BBOX === 'true';

    // If we already have 4 or more points, return as-is
    if (points.length >= 4) {
      if (debugEnabled) {
        console.log(
          `[Azure] Bbox already has ${inputLength} points (no normalization needed)`
        );
      }
      return points;
    }

    // If we have exactly 2 points, convert to 4-point rectangle
    if (points.length === 2) {
      const [topLeft, bottomRight] = points;
      const normalized = [
        topLeft, // Top-left
        { x: bottomRight.x, y: topLeft.y }, // Top-right
        bottomRight, // Bottom-right
        { x: topLeft.x, y: bottomRight.y }, // Bottom-left
      ];

      // Debug log for 2-point to 4-point conversion
      if (debugEnabled) {
        console.log(
          `[Azure] Normalized bbox: ${inputLength} points -> ${normalized.length} points`
        );
        console.log(
          `  Input: [${JSON.stringify(points[0])}, ${JSON.stringify(points[1])}]`
        );
        console.log(`  Output: 4-point rectangle`);
      }

      return normalized;
    }

    // If we have 3 points or 1 point, return as-is (frontend will skip these)
    if (points.length === 1 || points.length === 3) {
      console.warn(
        `[Azure] WARNING: Bbox with ${points.length} point(s) cannot be normalized - returning as-is`
      );
    }

    return points;
  }

  /**
   * Extract all words with their bounding boxes and confidence
   * Used with prebuilt-read model for word-level precision
   *
   * Note: Azure SDK returns coordinates in pixels for images, inches for PDFs.
   * For images, we can use coordinates directly without conversion.
   */
  private extractWords(result: any) {
    const words: Array<{
      text: string;
      bounds: Array<{ x: number; y: number }>;
      confidence: number;
      page: number;
    }> = [];

    if (!result.pages) {
      return words;
    }

    for (const page of result.pages) {
      if (!page.words) continue;

      for (const word of page.words) {
        const polygon = word.polygon || [];

        // Normalize polygon to always have 4 points (converts 2-point to 4-point)
        // Azure coordinates are already in pixels for images, no scaling needed
        const bounds = this.normalizeBoundingBox(polygon);

        words.push({
          text: word.content || '',
          bounds,
          confidence: word.confidence || 0,
          page: page.pageNumber || 1,
        });
      }
    }

    return words;
  }

  /**
   * Extract all lines with their bounding boxes and confidence
   * Used with prebuilt-layout model for line-level extraction
   *
   * Note: Azure SDK returns coordinates in pixels for images, inches for PDFs.
   * For images, we can use coordinates directly without conversion.
   */
  private extractLines(result: any) {
    const lines: Array<{
      text: string;
      bounds: Array<{ x: number; y: number }>;
      confidence: number;
      page: number;
    }> = [];

    if (!result.pages) {
      return lines;
    }

    for (const page of result.pages) {
      if (!page.lines) continue;

      for (const line of page.lines) {
        const polygon = line.polygon || [];

        // Normalize polygon to always have 4 points (converts 2-point to 4-point)
        // Azure coordinates are already in pixels for images, no scaling needed
        const bounds = this.normalizeBoundingBox(polygon);

        lines.push({
          text: line.content || '',
          bounds,
          confidence: undefined, // Azure doesn't provide line-level confidence in layout model
          page: page.pageNumber || 1,
        });
      }
    }

    return lines;
  }

  /**
   * Extract tables from the document
   * Useful for equipment schedules and structured data
   */
  extractTables(result: any) {
    if (!result.tables) {
      return [];
    }

    return result.tables.map((table: any) => ({
      rowCount: table.rowCount,
      columnCount: table.columnCount,
      cells: table.cells.map((cell: any) => ({
        content: cell.content,
        rowIndex: cell.rowIndex,
        columnIndex: cell.columnIndex,
        rowSpan: cell.rowSpan || 1,
        columnSpan: cell.columnSpan || 1,
      })),
    }));
  }

  /**
   * Extract key-value pairs from the document
   * Useful for labeled dimensions and specifications
   */
  extractKeyValuePairs(result: any) {
    if (!result.keyValuePairs) {
      return [];
    }

    return result.keyValuePairs
      .filter((pair: any) => pair.key && pair.value)
      .map((pair: any) => ({
        key: pair.key.content,
        value: pair.value.content,
        confidence: pair.confidence || 0,
      }));
  }

  /**
   * Estimate API cost based on model and pages
   * Azure Document Intelligence pricing:
   * - Read model: $1.50 per 1000 pages = $0.0015 per page
   * - Layout model: $10 per 1000 pages = $0.01 per page
   */
  estimateCost(
    pageCount: number = 1,
    model: 'read' | 'layout' = 'layout'
  ): number {
    const costPerPageUSD = model === 'read' ? 0.0015 : 0.01;
    const yenPerDollar = 150;
    return pageCount * costPerPageUSD * yenPerDollar;
  }
}

export const azureDocumentClient = new AzureDocumentClient();
