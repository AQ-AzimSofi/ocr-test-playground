/**
 * PDF-to-Image Converter Utility
 *
 * Provides utilities for converting PDF files to high-resolution PNG images
 * for OCR processing with Cloud Vision API.
 *
 * Uses pdftoppm from Poppler utils (already installed for Document AI).
 * Automatically sanitizes PDFs to fix corrupted metadata issues.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { sanitizePdf } from './pdf-sanitizer.js';

const isDevelopment = process.env.NODE_ENV !== 'production';
const execFileAsync = promisify(execFile);

/**
 * Converts a PDF file to PNG images (one per page)
 * Uses pdftoppm from Poppler utils
 *
 * @param pdfPath - Absolute path to the PDF file
 * @returns Array of absolute paths to generated PNG files
 */
export async function convertPdfToImages(pdfPath: string): Promise<string[]> {
  if (!fs.existsSync(pdfPath)) {
    throw new Error(`PDF file not found: ${pdfPath}`);
  }

  if (!isPdfFile(pdfPath)) {
    throw new Error(`File is not a PDF: ${pdfPath}`);
  }

  // Sanitize PDF to fix corrupted metadata
  let workingPdfPath = pdfPath;
  try {
    const sanitizedPath = await sanitizePdf(pdfPath);
    if (sanitizedPath !== pdfPath) {
      if (isDevelopment) console.log(`    PDF sanitized to fix metadata issues`);
      workingPdfPath = sanitizedPath;
    }
  } catch (error) {
    if (isDevelopment) console.warn(`    Warning: PDF sanitization failed, using original: ${error}`);
  }

  // Create temporary directory for images
  const pdfDir = path.dirname(pdfPath);
  const pdfBaseName = path.basename(pdfPath, path.extname(pdfPath));
  const outputDir = path.join(pdfDir, '.pdf-temp', pdfBaseName);

  // Clean output directory if it exists
  if (fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
  fs.mkdirSync(outputDir, { recursive: true });

  // Get PDF page count
  const pageCount = await getPageCount(workingPdfPath);

  if (isDevelopment) console.log(`    Converting ${pageCount} PDF pages to PNG (225 DPI)...`);

  // Output file prefix
  const outputPrefix = path.join(outputDir, 'page');

  try {
    // Use pdftoppm to convert PDF to PNG images
    // -r 225: 225 DPI resolution (3x scale for OCR)
    // -png: output format
    const result = await execFileAsync('pdftoppm', [
      '-r', '225',      // 225 DPI resolution
      '-png',           // Output format
      workingPdfPath,   // Input PDF (sanitized)
      outputPrefix,     // Output prefix
    ]);

    // Filter stderr warnings (pdftoppm outputs metadata warnings that don't affect conversion)
    if (result.stderr) {
      const errors = result.stderr
        .split('\n')
        .filter(line =>
          line &&
          !line.includes('Ignoring invalid character') &&
          !line.includes('Warning:')
        );

      if (errors.length > 0) {
        if (isDevelopment) console.warn(`    pdftoppm warnings: ${errors.join('; ')}`);
      }
    }

    // Find all generated PNG files
    const files = fs.readdirSync(outputDir);
    const imagePaths = files
      .filter(f => f.endsWith('.png'))
      .sort() // Ensure correct page order
      .map(f => path.join(outputDir, f));

    if (imagePaths.length === 0) {
      throw new Error('No images were generated from PDF');
    }

    if (isDevelopment) console.log(`    [OK] All ${imagePaths.length} pages converted successfully`);
    return imagePaths;

  } catch (error) {
    throw new Error(`Failed to convert PDF to images: ${error}`);
  }
}

/**
 * Gets the number of pages in a PDF file
 *
 * @param pdfPath - Absolute path to the PDF file
 * @returns Number of pages in the PDF
 */
async function getPageCount(pdfPath: string): Promise<number> {
  const pdfParse = await import('pdf-parse');
  const dataBuffer = fs.readFileSync(pdfPath);
  const data = await pdfParse.default(dataBuffer);
  return data.numpages;
}

/**
 * Checks if a file is a PDF based on its extension
 *
 * @param filePath - Path to the file
 * @returns True if the file has a .pdf extension
 */
export function isPdfFile(filePath: string): boolean {
  return filePath.toLowerCase().endsWith('.pdf');
}

/**
 * Cleans up temporary image files and their directory
 *
 * @param imagePaths - Array of image file paths to delete
 */
export function cleanupTempImages(imagePaths: string[]): void {
  if (imagePaths.length === 0) {
    return;
  }

  // Get the parent directory (should be .pdf-temp/[pdf-basename]/)
  const firstImageDir = path.dirname(imagePaths[0]);

  // Delete all image files
  for (const imagePath of imagePaths) {
    try {
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    } catch (error) {
      console.warn(`Failed to delete temp image: ${imagePath}`, error);
    }
  }

  // Delete the PDF-specific temp directory
  try {
    if (fs.existsSync(firstImageDir)) {
      fs.rmdirSync(firstImageDir);
      if (isDevelopment) console.log(`    [OK] Cleaned up temp directory: ${path.basename(firstImageDir)}`);
    }
  } catch (error) {
    if (isDevelopment) console.warn(`Failed to delete temp directory: ${firstImageDir}`, error);
  }

  // Try to delete the parent .pdf-temp directory if empty
  try {
    const pdfTempDir = path.dirname(firstImageDir);
    if (pdfTempDir.endsWith('.pdf-temp') && fs.existsSync(pdfTempDir)) {
      const remaining = fs.readdirSync(pdfTempDir);
      if (remaining.length === 0) {
        fs.rmdirSync(pdfTempDir);
        console.log(`    [OK] Cleaned up .pdf-temp directory`);
      }
    }
  } catch (error) {
    // Ignore - directory might not be empty or might not exist
  }
}
