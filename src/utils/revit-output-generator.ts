import {
  db,
  geometricObjects,
  extractionResults,
  testDrawings,
} from '../db/index.js';
import { eq } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';
import {
  calculateScalingFactor,
  logScalingResults,
  type ScalingResult,
} from './scaling-calculator.js';
import {
  CoordinateTransformer,
  type TransformedLine,
  type PointWithUnit,
} from './coordinate-transformer.js';
import {
  validateData,
  applyDefaults,
  logValidationReport,
  type DataQualityReport,
} from './data-validator.js';

/**
 * Revit Output Generator
 * Converts geometric objects from the database into a Revit/Dynamo-compatible JSON format
 */

export interface RevitElement {
  id: string;
  type: 'wall' | 'door' | 'window' | 'room' | 'floor' | 'other';
  subType?: string;
  geometry: {
    type: 'line' | 'point' | 'polygon' | 'rectangle';
    coordinates_px: Array<{ x: number; y: number }>; // Original pixel coordinates
    coordinates_mm: Array<{ x: number; y: number }>; // Transformed real-world coordinates
  };
  properties: {
    length_px?: number; // Calculated from pixel coordinates
    length_mm?: number; // Transformed to millimeters
    length_verified?: boolean; // Matches dimension text within tolerance
    width?: number; // mm
    thickness?: number; // mm
    height?: number; // mm (default height for extrusion)
    area?: number; // m²
    name?: string;
    dimension_text?: string;
    defaults_applied?: string[]; // List of properties that used defaults
    [key: string]: any;
  };
  level?: string; // Floor level
  confidence?: number;
}

export interface RevitDrawingMetadata {
  drawing_id: string;
  file_name: string;
  scale?: string; // e.g., "1:100"
  units: string; // "mm", "m", "ft"
  image_width: number;
  image_height: number;
  processing_date: string;
  tool: string;
  // Enhanced transformation metadata
  coordinate_transformation: {
    scaling_factor: number; // mm per pixel
    pixels_per_mm: number;
    scaling_confidence: number; // 0-1
    anchor_count: number; // Number of objects used to calculate scaling
    coordinate_system: string; // Description of coordinate system used
  };
  data_quality: {
    overall_completeness: number; // 0-100%
    total_issues: number;
    errors: number;
    warnings: number;
  };
}

export interface RevitOutput {
  metadata: RevitDrawingMetadata;
  elements: RevitElement[];
  statistics: {
    total_elements: number;
    elements_by_type: Record<string, number>;
    elements_with_dimensions: number;
    elements_with_verified_dimensions: number;
    defaults_applied_count: number;
  };
  validation_report?: DataQualityReport; // Optional full validation report
  scaling_details?: ScalingResult; // Optional scaling calculation details
}

/**
 * Generate Revit-compatible JSON from extraction result
 * Enhanced with automatic scaling calculation, coordinate transformation, and data validation
 */
export async function generateRevitOutput(
  extractionResultId: string,
  outputPath?: string,
  options: {
    includeValidationReport?: boolean;
    includeScalingDetails?: boolean;
    flipYAxis?: boolean;
  } = {}
): Promise<RevitOutput> {
  // Fetch extraction result
  const [result] = await db
    .select()
    .from(extractionResults)
    .where(eq(extractionResults.id, extractionResultId));

  if (!result) {
    throw new Error(`Extraction result not found: ${extractionResultId}`);
  }

  // Fetch drawing metadata
  const [drawing] = await db
    .select()
    .from(testDrawings)
    .where(eq(testDrawings.drawingId, result.drawingId));

  // Fetch all geometric objects for this extraction
  const objects = await db
    .select()
    .from(geometricObjects)
    .where(eq(geometricObjects.extractionResultId, extractionResultId));

  console.log(
    `\n  Generating Enhanced Revit Output for ${result.drawingId}...`
  );
  console.log(`    Found ${objects.length} geometric objects`);

  // Extract image metadata
  const imageMetadata = result.metadata?.imageMetadata || {};
  const imageWidth = imageMetadata.image_width || 0;
  const imageHeight = imageMetadata.image_height || 0;

  // STEP 1: Calculate scaling factor from geometric objects
  console.log(`\n  STEP 1: Calculating scaling factor...`);
  const scalingResult = calculateScalingFactor(objects);
  logScalingResults(scalingResult);

  // STEP 2: Create coordinate transformer
  console.log(`  STEP 2: Setting up coordinate transformation...`);
  const transformer = new CoordinateTransformer({
    scalingFactor: scalingResult.scalingFactor,
    imageHeight,
    flipYAxis: options.flipYAxis || false,
    outputUnit: 'mm',
  });

  // STEP 3: Validate data and apply defaults
  console.log(`  STEP 3: Validating data quality...`);
  const validationReport = validateData(objects as any);
  const defaultsApplied = applyDefaults(objects as any);
  logValidationReport(validationReport);

  // STEP 4: Transform geometric objects to Revit elements with dual coordinates
  console.log(`  STEP 4: Transforming coordinates and generating elements...`);
  const elements: RevitElement[] = [];
  let verifiedDimensionsCount = 0;

  for (const obj of objects) {
    const coordinates_px = obj.geometry?.coordinates || [];
    const coordinates_mm = transformer.transformCoordinates(coordinates_px);

    // Calculate length in both coordinate systems
    let length_px: number | undefined;
    let length_mm: number | undefined;
    let length_verified = false;

    if (coordinates_px.length === 2) {
      // Line object
      const dx = coordinates_px[1].x - coordinates_px[0].x;
      const dy = coordinates_px[1].y - coordinates_px[0].y;
      length_px = Math.sqrt(dx * dx + dy * dy);
      length_mm = transformer.transformLength(length_px);

      // Verify against dimension text if available
      if (obj.properties?.dimension_text) {
        const dimValue = parseFloat(
          obj.properties.dimension_text
            .replace(/[,\s]/g, '')
            .replace(/mm.*/, '')
        );
        if (!isNaN(dimValue)) {
          const difference = Math.abs(length_mm - dimValue);
          const tolerance = dimValue * 0.05; // 5% tolerance
          length_verified = difference <= tolerance;
          if (length_verified) verifiedDimensionsCount++;
        }
      }
    }

    const element: RevitElement = {
      id: obj.id,
      type: obj.objectType as any,
      subType: obj.subType || undefined,
      geometry: {
        type: obj.geometry?.type || 'line',
        coordinates_px,
        coordinates_mm: coordinates_mm.map((p) => ({ x: p.x, y: p.y })),
      },
      properties: {
        ...obj.properties,
        length_px,
        length_mm,
        length_verified,
      },
      level: 'Level 1',
      confidence: obj.confidence || undefined,
    };

    elements.push(element);
  }

  // Calculate statistics
  const elementsByType = elements.reduce(
    (acc, el) => {
      acc[el.type] = (acc[el.type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const elementsWithDimensions = elements.filter(
    (el) => el.properties.dimension_text || el.properties.length_mm
  ).length;

  // Build enhanced metadata
  const metadata: RevitDrawingMetadata = {
    drawing_id: result.drawingId,
    file_name: drawing?.fileName || result.drawingId,
    scale: imageMetadata.scale || '1:100',
    units: 'mm',
    image_width: imageWidth,
    image_height: imageHeight,
    processing_date: new Date().toISOString(),
    tool: result.tool,
    coordinate_transformation: {
      scaling_factor: scalingResult.scalingFactor,
      pixels_per_mm: scalingResult.pixelsPerMm,
      scaling_confidence: scalingResult.confidence,
      anchor_count: scalingResult.anchors.length,
      coordinate_system: transformer.getMetadata().coordinateSystem,
    },
    data_quality: {
      overall_completeness: validationReport.overall_completeness,
      total_issues: validationReport.issues.length,
      errors: validationReport.issues.filter((i) => i.severity === 'error')
        .length,
      warnings: validationReport.issues.filter((i) => i.severity === 'warning')
        .length,
    },
  };

  // Build output
  const output: RevitOutput = {
    metadata,
    elements,
    statistics: {
      total_elements: elements.length,
      elements_by_type: elementsByType,
      elements_with_dimensions: elementsWithDimensions,
      elements_with_verified_dimensions: verifiedDimensionsCount,
      defaults_applied_count: Object.values(defaultsApplied).reduce(
        (sum, count) => sum + count,
        0
      ),
    },
  };

  // Optionally include full reports
  if (options.includeValidationReport) {
    output.validation_report = validationReport;
  }
  if (options.includeScalingDetails) {
    output.scaling_details = scalingResult;
  }

  // Save to file if output path is provided
  if (outputPath) {
    const fullPath = path.resolve(outputPath);
    fs.writeFileSync(fullPath, JSON.stringify(output, null, 2), 'utf-8');
    console.log(`\n  Revit JSON saved to: ${fullPath}`);
  }

  console.log(`\n  Revit Output Statistics:`);
  console.log(`    Total elements: ${output.statistics.total_elements}`);
  Object.entries(elementsByType).forEach(([type, count]) => {
    console.log(`      - ${count} ${type}(s)`);
  });
  console.log(`    With dimensions: ${elementsWithDimensions}`);
  console.log(`    With verified dimensions: ${verifiedDimensionsCount}`);
  console.log(
    `    Defaults applied: ${output.statistics.defaults_applied_count}`
  );

  return output;
}

/**
 * Generate Revit CSV format (simplified tabular format for Dynamo import)
 * Uses transformed millimeter coordinates for direct use in Revit
 */
export async function generateRevitCSV(
  extractionResultId: string,
  outputPath: string
): Promise<void> {
  const revitOutput = await generateRevitOutput(extractionResultId);

  // CSV Header (using mm coordinates, ready for Revit/Dynamo)
  const csvLines = [
    'ID,Type,SubType,GeometryType,StartX_mm,StartY_mm,EndX_mm,EndY_mm,Length_mm,Width_mm,Thickness_mm,Height_mm,Level,DimensionText,LengthVerified,Confidence',
  ];

  // Convert each element to CSV row
  for (const element of revitOutput.elements) {
    // Use transformed mm coordinates (ready for Revit)
    const coords_mm = element.geometry.coordinates_mm;
    const start = coords_mm[0] || { x: 0, y: 0 };
    const end = coords_mm[1] || start;

    const row = [
      element.id,
      element.type,
      element.subType || '',
      element.geometry.type,
      start.x.toFixed(2), // mm coordinates
      start.y.toFixed(2),
      end.x.toFixed(2),
      end.y.toFixed(2),
      element.properties.length_mm?.toFixed(2) || '', // Transformed length
      element.properties.width?.toFixed(2) || '',
      element.properties.thickness?.toFixed(2) || '',
      element.properties.height?.toFixed(2) || '',
      element.level || 'Level 1',
      element.properties.dimension_text || '',
      element.properties.length_verified ? 'YES' : 'NO',
      element.confidence?.toFixed(2) || '',
    ];

    csvLines.push(row.map((v) => `"${v}"`).join(','));
  }

  const csvContent = csvLines.join('\n');
  fs.writeFileSync(outputPath, csvContent, 'utf-8');

  console.log(`  Revit CSV saved to: ${outputPath}`);
}

/**
 * Generate both JSON and CSV outputs for a drawing
 */
export async function generateAllRevitOutputs(
  extractionResultId: string,
  baseOutputPath: string
): Promise<{ jsonPath: string; csvPath: string }> {
  const jsonPath = `${baseOutputPath}.json`;
  const csvPath = `${baseOutputPath}.csv`;

  await generateRevitOutput(extractionResultId, jsonPath);
  await generateRevitCSV(extractionResultId, csvPath);

  return { jsonPath, csvPath };
}
