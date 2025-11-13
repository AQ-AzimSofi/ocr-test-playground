/**
 * PDF Sanitization Utility
 *
 * Repairs corrupted PDFs by loading and re-saving them with pdf-lib.
 * This cleanses malformed metadata and ensures compatibility with all OCR services.
 *
 * Sanitized PDFs are cached to avoid re-processing.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { PDFDocument } from 'pdf-lib';

/**
 * Get the cache directory for sanitized PDFs
 * Located in the same directory as the original PDF
 */
function getCacheDir(pdfPath: string): string {
  const pdfDir = path.dirname(pdfPath);
  return path.join(pdfDir, '.pdf-sanitized');
}

/**
 * Generate a cache key for a PDF file based on its content hash
 */
function getCacheKey(pdfPath: string): string {
  const content = fs.readFileSync(pdfPath);
  const hash = crypto.createHash('md5').update(content).digest('hex');
  return hash.substring(0, 12); // Use first 12 chars of hash
}

/**
 * Get the cached sanitized PDF path if it exists
 */
function getCachedPath(pdfPath: string): string | null {
  try {
    const cacheDir = getCacheDir(pdfPath);
    const cacheKey = getCacheKey(pdfPath);
    const basename = path.basename(pdfPath, '.pdf');
    const cachedPath = path.join(cacheDir, `${basename}_${cacheKey}.pdf`);

    if (fs.existsSync(cachedPath)) {
      return cachedPath;
    }
  } catch (error) {
    // Ignore cache lookup errors
  }
  return null;
}

/**
 * Sanitize a PDF file by loading and re-saving it with pdf-lib
 * This repairs corrupted metadata and ensures compatibility
 *
 * @param pdfPath - Path to the PDF file to sanitize
 * @returns Path to the sanitized PDF (may be the original if no issues found)
 */
export async function sanitizePdf(pdfPath: string): Promise<string> {
  // Check cache first
  const cachedPath = getCachedPath(pdfPath);
  if (cachedPath) {
    return cachedPath;
  }

  try {
    // Load the PDF
    const pdfBytes = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBytes, {
      ignoreEncryption: true,
      updateMetadata: false,
    });

    // Save to cache directory
    const cacheDir = getCacheDir(pdfPath);
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    const cacheKey = getCacheKey(pdfPath);
    const basename = path.basename(pdfPath, '.pdf');
    const sanitizedPath = path.join(cacheDir, `${basename}_${cacheKey}.pdf`);

    // Save the sanitized PDF
    const sanitizedBytes = await pdfDoc.save({
      useObjectStreams: false, // Better compatibility
    });
    fs.writeFileSync(sanitizedPath, sanitizedBytes);

    return sanitizedPath;
  } catch (error) {
    // If sanitization fails, return original path
    // Some PDFs may be too corrupted even for pdf-lib
    console.warn(`  Warning: Could not sanitize PDF, using original: ${error}`);
    return pdfPath;
  }
}

/**
 * Check if a PDF needs sanitization by attempting a quick parse
 * This is a lightweight check that doesn't fully process the PDF
 *
 * @param pdfPath - Path to the PDF file
 * @returns True if the PDF appears to have issues
 */
export async function needsSanitization(pdfPath: string): Promise<boolean> {
  try {
    const pdfBytes = fs.readFileSync(pdfPath);
    await PDFDocument.load(pdfBytes, {
      ignoreEncryption: true,
      throwOnInvalidObject: true,
    });
    return false; // PDF loaded cleanly
  } catch (error) {
    return true; // PDF has issues
  }
}

/**
 * Clean up the sanitization cache directory
 * Useful for reclaiming disk space
 *
 * @param pdfPath - Path to a PDF (to locate its cache directory)
 */
export function cleanSanitizationCache(pdfPath: string): void {
  const cacheDir = getCacheDir(pdfPath);
  if (fs.existsSync(cacheDir)) {
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }
}
