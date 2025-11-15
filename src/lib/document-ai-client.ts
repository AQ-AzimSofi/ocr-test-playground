import { DocumentProcessorServiceClient } from '@google-cloud/documentai';
import * as fs from 'fs';
import {
  getPageCount,
  splitPDFIntoChunks,
  cleanupChunks,
  type PDFChunkInfo,
} from '../utils/pdf-splitter.js';

const isDevelopment = process.env.NODE_ENV !== 'production';

/**
 * Google Cloud Document AI client wrapper
 * Uses Document AI processors for advanced OCR with word-level confidence
 * Better for structured documents and technical drawings than basic Cloud Vision
 */
export class DocumentAIClient {
  private client: DocumentProcessorServiceClient;
  private processorName: string;

  constructor() {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
    const location =
      process.env.GOOGLE_DOCUMENT_AI_PROCESSOR_LOCATION || 'us';
    const processorId = process.env.GOOGLE_DOCUMENT_AI_PROCESSOR_ID;

    if (!projectId) {
      throw new Error(
        'Google Cloud Project ID not found. Please set GOOGLE_CLOUD_PROJECT_ID in .env.development'
      );
    }

    if (!processorId) {
      throw new Error(
        'Google Document AI Processor ID not found. Please set GOOGLE_DOCUMENT_AI_PROCESSOR_ID in .env.development'
      );
    }

    // Initialize the client (uses GOOGLE_APPLICATION_CREDENTIALS from environment)
    this.client = new DocumentProcessorServiceClient();

    // Format: projects/{project}/locations/{location}/processors/{processor}
    this.processorName = `projects/${projectId}/locations/${location}/processors/${processorId}`;
  }

  /**
   * Analyze document using Document AI processor
   * Extracts word-level tokens with confidence scores and bounding boxes
   */
  async analyzeDocument(imagePath: string) {
    try {
      // Read the file into memory
      const imageBuffer = fs.readFileSync(imagePath);

      // Determine MIME type based on file extension
      const mimeType = this.getMimeType(imagePath);

      // Prepare the request
      const request = {
        name: this.processorName,
        rawDocument: {
          content: imageBuffer,
          mimeType,
        },
      };

      // Process the document
      const [result] = await this.client.processDocument(request);

      if (!result.document) {
        return {
          content: '',
          pages: [],
          words: [],
        };
      }

      // Extract word-level tokens with confidence
      const words = this.extractWords(result.document);

      return {
        content: result.document.text || '',
        pages: result.document.pages || [],
        words,
      };
    } catch (error) {
      console.error('Document AI processing error:', error);
      throw error;
    }
  }

  /**
   * Analyze document with automatic chunking for large PDFs
   * Splits PDFs over 15 pages into chunks, processes each, and merges results
   * Note: Document OCR Processor has 15-page limit in non-imageless mode
   */
  async analyzeDocumentWithChunking(
    imagePath: string,
    pagesPerChunk: number = 15
  ) {
    const mimeType = this.getMimeType(imagePath);

    // For non-PDFs, use standard processing
    if (mimeType !== 'application/pdf') {
      return this.analyzeDocument(imagePath);
    }

    let chunks: PDFChunkInfo[] = [];

    try {
      // Check page count and split if needed
      const totalPages = await getPageCount(imagePath);

      // If within limit, process normally
      if (totalPages <= pagesPerChunk) {
        const result = await this.analyzeDocument(imagePath);
        return {
          ...result,
          chunkCount: 1,
          totalPages,
        };
      }

      // Split PDF into chunks
      if (isDevelopment) {
        console.log(
          `  PDF has ${totalPages} pages, splitting into ${Math.ceil(totalPages / pagesPerChunk)} chunks of ${pagesPerChunk} pages...`
        );
      }
      chunks = await splitPDFIntoChunks(imagePath, pagesPerChunk);

      // Process each chunk
      const chunkResults = [];
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (isDevelopment) {
          console.log(
            `  Processing chunk ${i + 1}/${chunks.length} (pages ${chunk.startPage}-${chunk.endPage})...`
          );
        }

        const chunkResult = await this.analyzeDocument(chunk.filePath);

        // Adjust page numbers to reflect absolute page numbers
        const adjustedWords = chunkResult.words.map((word) => ({
          ...word,
          page: word.page + chunk.startPage - 1,
        }));

        chunkResults.push({
          ...chunkResult,
          words: adjustedWords,
        });
      }

      // Merge results from all chunks
      const mergedContent = chunkResults.map((r) => r.content).join('\n');
      const mergedPages = chunkResults.flatMap((r) => r.pages);
      const mergedWords = chunkResults.flatMap((r) => r.words);

      if (isDevelopment) {
        console.log(
          `  Successfully processed ${chunks.length} chunks (${totalPages} total pages)`
        );
      }

      return {
        content: mergedContent,
        pages: mergedPages,
        words: mergedWords,
        chunkCount: chunks.length,
        totalPages,
      };
    } catch (error) {
      console.error('Error processing document with chunking:', error);
      throw error;
    } finally {
      // Always clean up temporary chunk files
      if (chunks.length > 0) {
        cleanupChunks(chunks);
      }
    }
  }

  /**
   * Extract word-level tokens from Document AI response
   * Returns words with normalized bounding boxes and confidence scores
   */
  private extractWords(document: any) {
    const words: Array<{
      text: string;
      bounds: Array<{ x: number; y: number }>;
      confidence: number;
      page: number;
    }> = [];

    if (!document.pages) {
      return words;
    }

    for (const page of document.pages) {
      if (!page.tokens) continue;

      const pageNumber = page.pageNumber || 1;
      const imageWidth = page.dimension?.width || 1;
      const imageHeight = page.dimension?.height || 1;

      for (const token of page.tokens) {
        // Extract text from text anchor
        const text = this.getTextFromTextAnchor(
          document.text,
          token.layout?.textAnchor
        );

        // Extract bounding box vertices and normalize to pixel coordinates
        const bounds = this.extractBounds(
          token.layout?.boundingPoly,
          imageWidth,
          imageHeight
        );

        // Get confidence score (from layout if available)
        const confidence = token.layout?.confidence || 0;

        words.push({
          text,
          bounds,
          confidence,
          page: pageNumber,
        });
      }
    }

    return words;
  }

  /**
   * Extract text content from a text anchor reference
   * Text anchor points to segments in the full document text
   */
  private getTextFromTextAnchor(fullText: string, textAnchor: any): string {
    if (!textAnchor || !textAnchor.textSegments) {
      return '';
    }

    const segments = textAnchor.textSegments;
    let text = '';

    for (const segment of segments) {
      const startIndex = parseInt(segment.startIndex || '0');
      const endIndex = parseInt(segment.endIndex || '0');
      text += fullText.substring(startIndex, endIndex);
    }

    return text;
  }

  /**
   * Extract and normalize bounding box vertices
   * Document AI returns normalized coordinates (0-1), we convert to pixel coordinates
   */
  private extractBounds(
    boundingPoly: any,
    imageWidth: number,
    imageHeight: number
  ): Array<{ x: number; y: number }> {
    if (!boundingPoly || !boundingPoly.normalizedVertices) {
      return [];
    }

    // Document AI uses normalized coordinates (0-1), convert to pixels
    return boundingPoly.normalizedVertices.map((vertex: any) => ({
      x: (vertex.x || 0) * imageWidth,
      y: (vertex.y || 0) * imageHeight,
    }));
  }

  /**
   * Determine MIME type from file extension
   */
  private getMimeType(filePath: string): string {
    const ext = filePath.toLowerCase().split('.').pop();

    const mimeTypes: { [key: string]: string } = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      bmp: 'image/bmp',
      webp: 'image/webp',
      tiff: 'image/tiff',
      tif: 'image/tiff',
      pdf: 'application/pdf',
    };

    return mimeTypes[ext || ''] || 'image/png';
  }

  /**
   * Estimate API cost based on processor usage
   * Document AI pricing varies by processor type:
   * - Document OCR Processor: $1.50 per 1000 pages
   * - Form Parser: $10 per 1000 pages
   * - Specialized processors: $30-$65 per 1000 pages
   *
   * Using Document OCR Processor cost as default
   */
  estimateCost(pageCount: number = 1): number {
    const costPerPageUSD = 0.0015; // $1.50 per 1000 pages
    const yenPerDollar = 150;
    return pageCount * costPerPageUSD * yenPerDollar; // ~0.225 yen per page
  }
}

export const documentAIClient = new DocumentAIClient();
