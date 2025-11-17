import { PDFDocument } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export interface PdfChunkInfo {
  chunkPath: string;
  chunkIndex: number;
  totalChunks: number;
  pageRange: { start: number; end: number };
  originalFile: string;
}

/**
 * Get the number of pages in a PDF file
 * @param filePath Path to the PDF file
 * @returns Number of pages in the PDF
 */
export async function getPdfPageCount(filePath: string): Promise<number> {
  try {
    const pdfBuffer = fs.readFileSync(filePath);
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    return pdfDoc.getPageCount();
  } catch (error) {
    console.error(`Error getting page count for ${filePath}:`, error);
    throw new Error(`Failed to get page count: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Split a PDF file into smaller chunks based on max pages
 * @param filePath Path to the PDF file
 * @param maxPages Maximum pages per chunk
 * @returns Array of chunk information including paths to split files
 */
export async function splitPdfIntoChunks(
  filePath: string,
  maxPages: number
): Promise<PdfChunkInfo[]> {
  try {
    const pdfBuffer = fs.readFileSync(filePath);
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const totalPages = pdfDoc.getPageCount();

    // Log original file size
    const originalSizeMB = (pdfBuffer.length / 1024 / 1024).toFixed(2);
    const fileName = path.basename(filePath);
    console.log(`[PDF File] ${fileName}: ${totalPages} pages, ${originalSizeMB}MB`);

    if (totalPages <= maxPages) {
      // No need to split
      return [
        {
          chunkPath: filePath,
          chunkIndex: 0,
          totalChunks: 1,
          pageRange: { start: 1, end: totalPages },
          originalFile: filePath,
        },
      ];
    }

    // Calculate number of chunks needed
    const totalChunks = Math.ceil(totalPages / maxPages);
    const chunks: PdfChunkInfo[] = [];

    // Create temp directory for chunks
    const tempDir = path.join(app.getPath('temp'), 'ocr-pdf-chunks');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const originalFileName = path.basename(filePath, path.extname(filePath));
    const ext = path.extname(filePath);

    // Split PDF into chunks
    for (let i = 0; i < totalChunks; i++) {
      const startPage = i * maxPages;
      const endPage = Math.min((i + 1) * maxPages, totalPages);
      const pageIndices = Array.from(
        { length: endPage - startPage },
        (_, idx) => startPage + idx
      );

      // Create new PDF with selected pages
      const newPdf = await PDFDocument.create();
      const copiedPages = await newPdf.copyPages(pdfDoc, pageIndices);
      copiedPages.forEach((page) => newPdf.addPage(page));

      // Save chunk
      const chunkFileName = `${originalFileName}_chunk${i + 1}of${totalChunks}${ext}`;
      const chunkPath = path.join(tempDir, chunkFileName);
      const pdfBytes = await newPdf.save();
      fs.writeFileSync(chunkPath, pdfBytes);

      // Log chunk size
      const chunkSizeMB = (pdfBytes.length / 1024 / 1024).toFixed(2);
      const pageCount = endPage - startPage;
      console.log(`[PDF Chunk] ${fileName} - Chunk ${i + 1}/${totalChunks}: ${pageCount} pages, ${chunkSizeMB}MB (pages ${startPage + 1}-${endPage})`);

      chunks.push({
        chunkPath,
        chunkIndex: i,
        totalChunks,
        pageRange: { start: startPage + 1, end: endPage },
        originalFile: filePath,
      });
    }

    return chunks;
  } catch (error) {
    console.error(`Error splitting PDF ${filePath}:`, error);
    throw new Error(`Failed to split PDF: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Clean up temporary chunk files
 * @param chunks Array of chunk information
 */
export function cleanupPdfChunks(chunks: PdfChunkInfo[]): void {
  chunks.forEach((chunk) => {
    // Only delete if it's a chunk (not the original file)
    if (chunk.totalChunks > 1 && chunk.chunkPath !== chunk.originalFile) {
      try {
        if (fs.existsSync(chunk.chunkPath)) {
          fs.unlinkSync(chunk.chunkPath);
        }
      } catch (error) {
        console.error(`Error deleting chunk ${chunk.chunkPath}:`, error);
      }
    }
  });

  // Try to clean up temp directory if empty
  try {
    const tempDir = path.join(app.getPath('temp'), 'ocr-pdf-chunks');
    if (fs.existsSync(tempDir)) {
      const files = fs.readdirSync(tempDir);
      if (files.length === 0) {
        fs.rmdirSync(tempDir);
      }
    }
  } catch (error) {
    // Ignore errors when cleaning up directory
  }
}

/**
 * Check if a file is a PDF
 * @param filePath Path to the file
 * @returns true if the file is a PDF
 */
export function isPdfFile(filePath: string): boolean {
  return filePath.toLowerCase().endsWith('.pdf');
}
