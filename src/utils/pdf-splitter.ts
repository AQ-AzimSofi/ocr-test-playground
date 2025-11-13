import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PDFDocument } from 'pdf-lib';

export interface PDFChunkInfo {
  filePath: string;
  startPage: number;
  endPage: number;
  pageCount: number;
}

/**
 * Get the page count of a PDF file without loading the entire document
 */
export async function getPageCount(filePath: string): Promise<number> {
  const pdfBytes = fs.readFileSync(filePath);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  return pdfDoc.getPageCount();
}

/**
 * Split a PDF into chunks of specified page count
 * @param filePath Path to the PDF file
 * @param pagesPerChunk Maximum pages per chunk (default: 30)
 * @returns Array of chunk information including temporary file paths
 */
export async function splitPDFIntoChunks(
  filePath: string,
  pagesPerChunk: number = 30
): Promise<PDFChunkInfo[]> {
  const pdfBytes = fs.readFileSync(filePath);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const totalPages = pdfDoc.getPageCount();

  // If document is within limit, return original file
  if (totalPages <= pagesPerChunk) {
    return [
      {
        filePath,
        startPage: 1,
        endPage: totalPages,
        pageCount: totalPages,
      },
    ];
  }

  const chunks: PDFChunkInfo[] = [];
  const baseName = path.basename(filePath, path.extname(filePath));
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-chunks-'));

  for (let startPage = 0; startPage < totalPages; startPage += pagesPerChunk) {
    const endPage = Math.min(startPage + pagesPerChunk, totalPages);
    const chunkNumber = Math.floor(startPage / pagesPerChunk) + 1;

    // Create new PDF with chunk pages
    const chunkDoc = await PDFDocument.create();
    const pages = await chunkDoc.copyPages(
      pdfDoc,
      Array.from({ length: endPage - startPage }, (_, i) => startPage + i)
    );

    pages.forEach((page) => {
      chunkDoc.addPage(page);
    });

    // Save chunk to temporary file
    const chunkFileName = `${baseName}_chunk${chunkNumber}.pdf`;
    const chunkPath = path.join(tempDir, chunkFileName);
    const chunkBytes = await chunkDoc.save();
    fs.writeFileSync(chunkPath, chunkBytes);

    chunks.push({
      filePath: chunkPath,
      startPage: startPage + 1, // 1-indexed
      endPage: endPage, // 1-indexed
      pageCount: endPage - startPage,
    });
  }

  return chunks;
}

/**
 * Clean up temporary chunk files
 * @param chunks Array of chunk information
 */
export function cleanupChunks(chunks: PDFChunkInfo[]): void {
  if (chunks.length <= 1) {
    return; // Original file, nothing to clean up
  }

  // Get temp directory from first chunk
  const tempDir = path.dirname(chunks[0].filePath);

  try {
    // Remove all chunk files
    chunks.forEach((chunk) => {
      if (fs.existsSync(chunk.filePath)) {
        fs.unlinkSync(chunk.filePath);
      }
    });

    // Remove temp directory
    if (fs.existsSync(tempDir) && tempDir.includes('pdf-chunks-')) {
      fs.rmdirSync(tempDir);
    }
  } catch (error) {
    console.error('Error cleaning up chunk files:', error);
    // Don't throw - cleanup failures shouldn't break the main process
  }
}
