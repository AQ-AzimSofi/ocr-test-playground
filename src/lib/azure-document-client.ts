import { AzureKeyCredential, DocumentAnalysisClient } from '@azure/ai-form-recognizer';
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

    this.client = new DocumentAnalysisClient(endpoint, new AzureKeyCredential(apiKey));
  }

  /**
   * Analyze document using prebuilt-layout model
   * This model is optimized for extracting text, tables, and structure from technical documents
   */
  async analyzeLayout(imagePath: string) {
    const imageStream = fs.createReadStream(imagePath);

    const poller = await this.client.beginAnalyzeDocument('prebuilt-layout', imageStream);
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
   * Extract all lines with their bounding boxes and confidence
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
        const bounds = [];

        // Convert flat array [x1, y1, x2, y2, ...] to array of {x, y}
        for (let i = 0; i < polygon.length; i += 2) {
          bounds.push({
            x: polygon[i] || 0,
            y: polygon[i + 1] || 0,
          });
        }

        lines.push({
          text: line.content || '',
          bounds,
          confidence: 1.0, // Azure doesn't provide line-level confidence in layout model
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
   * Estimate API cost based on features used
   * Azure Document Intelligence pricing (Layout model):
   * - First 500 pages: $10 per 1000 pages
   * - After 500 pages: $5 per 1000 pages
   * For simplicity, using $10 per 1000 pages = $0.01 per page
   */
  estimateCost(pageCount: number = 1): number {
    const costPerPage = 1.5; // yen (approximately $0.01 * 150 yen/dollar)
    return pageCount * costPerPage;
  }
}

export const azureDocumentClient = new AzureDocumentClient();
