import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Image cropping utility for extracting regions from OCR images
 * Used for region-level hybrid OCR processing
 */

export interface BoundingBox {
  x: number;
  y: number;
}

export interface CropRegion {
  bounds: BoundingBox[];
  text: string;
  confidence?: number;
  index: number;
}

export interface CroppedRegion {
  buffer: Buffer;
  base64: string;
  region: CropRegion;
  cropBox: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}

/**
 * Convert polygon bounds to rectangular crop box
 * Takes 4 corner points and returns min/max coordinates
 */
function boundsToRect(bounds: BoundingBox[]): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  const xCoords = bounds.map((b) => b.x);
  const yCoords = bounds.map((b) => b.y);

  const minX = Math.min(...xCoords);
  const maxX = Math.max(...xCoords);
  const minY = Math.min(...yCoords);
  const maxY = Math.max(...yCoords);

  return {
    left: Math.max(0, Math.floor(minX)),
    top: Math.max(0, Math.floor(minY)),
    width: Math.ceil(maxX - minX),
    height: Math.ceil(maxY - minY),
  };
}

/**
 * Add padding around crop region for context
 * Helps Gemini understand surrounding text
 */
function addPadding(
  cropBox: { left: number; top: number; width: number; height: number },
  padding: number,
  imageWidth: number,
  imageHeight: number
): { left: number; top: number; width: number; height: number } {
  return {
    left: Math.max(0, cropBox.left - padding),
    top: Math.max(0, cropBox.top - padding),
    width: Math.min(
      imageWidth - cropBox.left + padding,
      cropBox.width + padding * 2
    ),
    height: Math.min(
      imageHeight - cropBox.top + padding,
      cropBox.height + padding * 2
    ),
  };
}

/**
 * Crop a single region from an image
 */
export async function cropImageRegion(
  imagePath: string,
  region: CropRegion,
  padding: number = 10
): Promise<CroppedRegion> {
  try {
    // Load image metadata to get dimensions
    const metadata = await sharp(imagePath).metadata();
    const imageWidth = metadata.width || 0;
    const imageHeight = metadata.height || 0;

    // Convert bounds to rectangle
    let cropBox = boundsToRect(region.bounds);

    // Add padding for context
    cropBox = addPadding(cropBox, padding, imageWidth, imageHeight);

    // Ensure valid crop dimensions
    if (cropBox.width <= 0 || cropBox.height <= 0) {
      throw new Error(`Invalid crop dimensions: ${JSON.stringify(cropBox)}`);
    }

    // Crop the image
    const croppedBuffer = await sharp(imagePath).extract(cropBox).toBuffer();

    // Convert to base64 for API calls
    const base64 = croppedBuffer.toString('base64');

    return {
      buffer: croppedBuffer,
      base64,
      region,
      cropBox,
    };
  } catch (error) {
    console.error(`Error cropping region ${region.index}:`, error);
    throw error;
  }
}

/**
 * Batch crop multiple regions from an image
 * More efficient than cropping one by one
 */
export async function batchCropRegions(
  imagePath: string,
  regions: CropRegion[],
  padding: number = 10
): Promise<CroppedRegion[]> {
  console.log(`  Cropping ${regions.length} regions from image...`);

  const results: CroppedRegion[] = [];

  // Process regions in parallel with concurrency limit
  const concurrency = 5;
  for (let i = 0; i < regions.length; i += concurrency) {
    const batch = regions.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((region) => cropImageRegion(imagePath, region, padding))
    );
    results.push(...batchResults);
  }

  console.log(`  Cropped ${results.length} regions`);
  return results;
}

/**
 * Save cropped regions to disk for debugging
 */
export async function saveCroppedRegions(
  croppedRegions: CroppedRegion[],
  outputDir: string
): Promise<void> {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  for (const cropped of croppedRegions) {
    const filename = `region_${cropped.region.index}_conf_${(cropped.region.confidence * 100).toFixed(0)}.png`;
    const filepath = path.join(outputDir, filename);
    await fs.promises.writeFile(filepath, cropped.buffer);
  }

  console.log(
    `  Saved ${croppedRegions.length} cropped regions to ${outputDir}`
  );
}

/**
 * Merge cropped regions back into full text
 * Replaces original text with Gemini-corrected text
 */
export function mergeRegionTexts(
  originalRegions: CropRegion[],
  correctedTexts: Map<number, string>
): string {
  // Sort regions by their position in the image (top to bottom, left to right)
  const sortedRegions = [...originalRegions].sort((a, b) => {
    const aTop = Math.min(...a.bounds.map((b) => b.y));
    const bTop = Math.min(...b.bounds.map((b) => b.y));
    if (Math.abs(aTop - bTop) < 20) {
      // Same line, sort by x
      const aLeft = Math.min(...a.bounds.map((b) => b.x));
      const bLeft = Math.min(...b.bounds.map((b) => b.x));
      return aLeft - bLeft;
    }
    return aTop - bTop;
  });

  // Build merged text
  const texts = sortedRegions.map((region) => {
    // Use corrected text if available, otherwise use original
    return correctedTexts.get(region.index) || region.text;
  });

  return texts.join('\n');
}
