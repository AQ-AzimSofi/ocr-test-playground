import type { GeometricObject, GeometricDetectionResult } from '../processors/gemini-geometric-processor';

/**
 * Simplified Revit Output Generator for Electron
 * Converts geometric objects into Revit/Dynamo-compatible JSON format
 */

export interface RevitElement {
  id: string;
  type: 'wall' | 'door' | 'window' | 'room';
  subType?: string;
  geometry: {
    type: 'line' | 'point' | 'polygon';
    coordinates_px: Array<{ x: number; y: number }>;
    coordinates_mm: Array<{ x: number; y: number }>;
  };
  properties: {
    length_px?: number;
    length_mm?: number;
    thickness?: number;
    height?: number;
    area?: number;
    name?: string;
    dimension_text?: string;
    orientation?: string;
    [key: string]: any;
  };
  level: string;
  confidence: number;
}

export interface RevitOutput {
  metadata: {
    file_name: string;
    scale?: string;
    units: string;
    image_width: number;
    image_height: number;
    processing_date: string;
    tool: string;
    coordinate_transformation: {
      scaling_factor: number;
      pixels_per_mm: number;
      scaling_confidence: number;
      coordinate_system: string;
    };
  };
  elements: RevitElement[];
  statistics: {
    total_elements: number;
    elements_by_type: Record<string, number>;
    walls: number;
    doors: number;
    windows: number;
    rooms: number;
  };
}

/**
 * Simple scaling calculation from dimension text (simplified version)
 */
function calculateScalingFactor(
  objects: GeometricObject[]
): number {
  // Default: assume 1:100 scale, typical for Japanese floor plans
  // This gives us approximately 10 pixels = 1000mm
  // So 1 pixel ≈ 100mm
  let scalingFactor = 100; // mm per pixel

  // Try to find dimension text to calculate actual scale
  const objectsWithDimensions = objects.filter(
    (obj) => obj.properties.dimension_text && obj.properties.length
  );

  if (objectsWithDimensions.length > 0) {
    // Use first object with dimension for scaling
    const obj = objectsWithDimensions[0];
    const dimensionText = obj.properties.dimension_text;
    const pixelLength = obj.properties.length;

    // Extract number from dimension text (e.g., "4200" from "4200mm")
    const match = dimensionText?.match(/(\d+)/);
    if (match && pixelLength) {
      const mmLength = parseInt(match[1], 10);
      scalingFactor = mmLength / pixelLength;
    }
  }

  return scalingFactor;
}

/**
 * Transform pixel coordinates to millimeters
 */
function transformCoordinates(
  coordinates: Array<{ x: number; y: number }>,
  scalingFactor: number
): Array<{ x: number; y: number }> {
  return coordinates.map((coord) => ({
    x: Math.round(coord.x * scalingFactor),
    y: Math.round(coord.y * scalingFactor),
  }));
}

/**
 * Calculate distance between two points in pixels
 */
function calculateDistance(
  p1: { x: number; y: number },
  p2: { x: number; y: number }
): number {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

/**
 * Generate Revit-compatible JSON from detected geometric objects
 */
export function generateRevitOutput(
  detection: GeometricDetectionResult,
  fileName: string
): RevitOutput {
  const scalingFactor = calculateScalingFactor(detection.objects);

  // Convert each geometric object to Revit element
  const elements: RevitElement[] = detection.objects.map((obj, index) => {
    // Calculate geometry type
    let geometryType: 'line' | 'point' | 'polygon' = 'line';
    if (obj.coordinates.length === 1) {
      geometryType = 'point';
    } else if (obj.coordinates.length > 2) {
      geometryType = 'polygon';
    }

    // Calculate length in pixels
    let length_px: number | undefined;
    if (obj.coordinates.length === 2) {
      length_px = calculateDistance(obj.coordinates[0], obj.coordinates[1]);
    }

    // Transform coordinates to mm
    const coordinates_mm = transformCoordinates(
      obj.coordinates,
      scalingFactor
    );

    // Calculate length in mm
    let length_mm: number | undefined;
    if (coordinates_mm.length === 2) {
      length_mm = calculateDistance(coordinates_mm[0], coordinates_mm[1]);
    }

    // Apply default heights for Revit
    let height = 3000; // Default 3000mm = 3m for walls
    if (obj.type === 'door') {
      height = 2100; // Standard door height 2.1m
    } else if (obj.type === 'window') {
      height = 1200; // Standard window height 1.2m
    }

    const element: RevitElement = {
      id: `${obj.type}-${index + 1}`,
      type: obj.type,
      subType: obj.subType,
      geometry: {
        type: geometryType,
        coordinates_px: obj.coordinates,
        coordinates_mm,
      },
      properties: {
        length_px,
        length_mm,
        thickness: obj.properties.thickness,
        height,
        area: obj.properties.area,
        name: obj.properties.label,
        dimension_text: obj.properties.dimension_text,
        orientation: obj.properties.orientation,
      },
      level: 'Level 1',
      confidence: obj.confidence,
    };

    return element;
  });

  // Calculate statistics
  const elementsByType: Record<string, number> = {};
  elements.forEach((element) => {
    elementsByType[element.type] = (elementsByType[element.type] || 0) + 1;
  });

  return {
    metadata: {
      file_name: fileName,
      scale: detection.metadata.scale,
      units: detection.metadata.units || 'mm',
      image_width: detection.metadata.image_width,
      image_height: detection.metadata.image_height,
      processing_date: new Date().toISOString(),
      tool: 'gemini-geometric',
      coordinate_transformation: {
        scaling_factor: scalingFactor,
        pixels_per_mm: 1 / scalingFactor,
        scaling_confidence: 0.8,
        coordinate_system:
          'Top-left origin, X increases right, Y increases down',
      },
    },
    elements,
    statistics: {
      total_elements: elements.length,
      elements_by_type: elementsByType,
      walls: elementsByType['wall'] || 0,
      doors: elementsByType['door'] || 0,
      windows: elementsByType['window'] || 0,
      rooms: elementsByType['room'] || 0,
    },
  };
}

/**
 * Save Revit JSON to file
 */
export function saveRevitJSON(output: RevitOutput, filePath: string): void {
  const fs = require('fs');
  fs.writeFileSync(filePath, JSON.stringify(output, null, 2), 'utf-8');
}
