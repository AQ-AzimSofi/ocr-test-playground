import { fromPath } from 'pdf2pic';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

/**
 * PDF to image conversion utility for Electron app
 */

export interface PdfConversionResult {
  imagePaths: string[];
  pageCount: number;
  tempDir: string;
}

/**
 * Convert PDF to PNG images (one per page)
 * @param pdfPath - Path to PDF file
 * @returns Array of image paths and temp directory
 */
export async function convertPdfToImages(
  pdfPath: string
): Promise<PdfConversionResult> {
  // Create temp directory for images
  const tempDir = path.join(os.tmpdir(), `ocr-pdf-${Date.now()}`);
  await fs.mkdir(tempDir, { recursive: true });

  // Configure pdf2pic
  const options = {
    density: 300, // DPI
    saveFilename: 'page',
    savePath: tempDir,
    format: 'png',
    width: 2480, // A4 at 300 DPI
    height: 3508,
  };

  const convert = fromPath(pdfPath, options);

  // Get page count from PDF
  const pdfParse = (await import('pdf-parse')).default;
  const dataBuffer = await fs.readFile(pdfPath);
  const pdfData = await pdfParse(dataBuffer);
  const pageCount = pdfData.numpages;

  // Convert each page
  const imagePaths: string[] = [];

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    try {
      const result = await convert(pageNum, {
        responseType: 'image',
      });

      if (result && result.path) {
        imagePaths.push(result.path);
      }
    } catch (error) {
      console.error(`Failed to convert PDF page ${pageNum}:`, error);
      throw new Error(`PDF conversion failed on page ${pageNum}`);
    }
  }

  return {
    imagePaths,
    pageCount,
    tempDir,
  };
}

/**
 * Clean up temporary image files
 * @param tempDir - Directory containing temporary files
 */
export async function cleanupTempImages(tempDir: string): Promise<void> {
  try {
    await fs.rm(tempDir, { recursive: true, force: true });
  } catch (error) {
    console.error('Failed to cleanup temp images:', error);
    // Don't throw - cleanup failure shouldn't break the flow
  }
}

/**
 * Check if file is a PDF
 */
export function isPdf(filePath: string): boolean {
  return filePath.toLowerCase().endsWith('.pdf');
}
