import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

/**
 * PDF to image conversion utility for Electron app
 * Uses pdf2img-electron which leverages Chromium's built-in PDF viewer
 */

export interface PdfConversionResult {
  imagePaths: string[];
  pageCount: number;
  tempDir: string;
}

/**
 * Get page count from a PDF file without converting it
 * Uses unpdf - a modern, serverless-friendly PDF parser with no dynamic requires
 * @param pdfPath - Path to PDF file
 * @returns Number of pages in the PDF
 */
export async function getPdfPageCount(pdfPath: string): Promise<number> {
  try {
    const { getDocumentProxy } = await import('unpdf');
    const dataBuffer = await fs.readFile(pdfPath);
    const pdf = await getDocumentProxy(new Uint8Array(dataBuffer));
    return pdf.numPages;
  } catch (error) {
    console.error(`Failed to get page count for ${pdfPath}:`, error);
    return 0; // Return 0 if we can't read the PDF
  }
}

/**
 * Convert PDF to PNG images (one per page)
 * Uses pdf2img-electron which leverages Chromium's built-in PDF viewer
 * @param pdfPath - Path to PDF file
 * @returns Array of image paths and temp directory
 */
export async function convertPdfToImages(
  pdfPath: string
): Promise<PdfConversionResult> {
  // Create temp directory for images
  const tempDir = path.join(os.tmpdir(), `ocr-pdf-${Date.now()}`);
  await fs.mkdir(tempDir, { recursive: true });

  try {
    // Dynamically import pdf2img-electron (CommonJS module)
    const { default: pdf } = await import('pdf2img-electron');

    // Initialize pdf2img-electron
    const PDF = pdf(pdfPath);

    // Convert all pages to PNG buffers
    // Scale of 4.17 ≈ 300 DPI (300/72 = 4.17)
    const pngBuffers = await PDF.toPNG({
      scale: 4.17,
      logging: false
    });

    const imagePaths: string[] = [];

    // Save each PNG buffer to a file
    for (let i = 0; i < pngBuffers.length; i++) {
      const outputPath = path.join(tempDir, `page.${i + 1}.png`);
      await fs.writeFile(outputPath, pngBuffers[i]);
      imagePaths.push(outputPath);
    }

    return {
      imagePaths,
      pageCount: pngBuffers.length,
      tempDir,
    };
  } catch (error) {
    // Clean up temp directory on error
    await cleanupTempImages(tempDir);
    throw error;
  }
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
