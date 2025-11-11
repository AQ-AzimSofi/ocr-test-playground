import * as path from 'path';
import {
  analyzeFloorPlanGlobally,
  GlobalAnalysisOutput,
} from '../mastra/agents/global-analyzer-agent.js';
import {
  detectGeometricElements,
  GeometricAnalysisOutput,
} from '../mastra/agents/geometric-specialist-agent.js';
import {
  extractDimensionsWithLeaderLines,
  DimensionAnalysisOutput,
} from '../mastra/agents/dimension-specialist-agent.js';
import {
  associateDimensionsToElements,
  AssociationAnalysisOutput,
} from '../mastra/agents/association-agent.js';
import {
  validateExtractionResults,
  ValidationOutput,
} from '../mastra/agents/validation-agent.js';
import { coordinateTransformationTool } from '../mastra/tools/coordinate-transformation-tool.js';
import { scalingCalculatorTool } from '../mastra/tools/scaling-calculator-tool.js';
import { getRevitMCPClient } from '../mastra/clients/revit-mcp-client.js';
import type { GeometricElement } from '../types.js';
import * as fs from 'fs';

/**
 * Mastra AI Pipeline Processor
 *
 * Complete end-to-end workflow using AI agents for floor plan analysis:
 * 1. Global Analysis - Identify regions of interest
 * 2. Geometric Detection - Find all structural elements
 * 3. Dimension Extraction - Extract dimension text and leader lines
 * 4. Association - Link dimensions to elements
 * 5. Scaling Calculation - Calculate mm/pixel conversion
 * 6. Coordinate Transformation - Convert pixels to millimeters
 * 7. Validation - QA check and error detection
 * 8. Revit Output - Generate JSON/CSV for Dynamo
 */

export interface MastraAIPipelineOptions {
  drawing_id: string;
  file_path: string;
  output_dir?: string;
  flip_y_axis?: boolean;
  default_scaling_factor?: number;
  enable_validation?: boolean;
  min_validation_score?: number;
  enable_revit_mcp?: boolean;
  revit_mcp_path?: string; // Path to revit-mcp/build/index.js
  revit_level?: string;
  stop_on_error?: boolean;
}

export interface MastraAIPipelineResult {
  drawing_id: string;
  success: boolean;

  global_analysis?: GlobalAnalysisOutput;
  geometric_analysis?: GeometricAnalysisOutput;
  dimension_analysis?: DimensionAnalysisOutput;
  association_analysis?: AssociationAnalysisOutput;
  validation_result?: ValidationOutput;

  scaling_factor?: number;
  scaling_confidence?: number;
  coordinate_transformation_info?: any;

  revit_json_path?: string;
  revit_csv_path?: string;

  revit_mcp_enabled?: boolean;
  revit_mcp_available?: boolean;
  revit_mcp_result?: {
    success: boolean;
    totalElements: number;
    successCount: number;
    failureCount: number;
    errors: Array<{ index: number; error: string }>;
  };

  processing_time_ms: number;
  errors: string[];
  warnings: string[];
}

/**
 * Helper function to save Revit JSON output
 */
async function saveRevitJSON(data: any, drawingId: string, outputDir: string): Promise<string> {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const filename = `${drawingId}-revit.json`;
  const filepath = path.join(outputDir, filename);

  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');

  return filepath;
}

/**
 * Helper function to save Revit CSV output
 */
async function saveRevitCSV(data: any, drawingId: string, outputDir: string): Promise<string> {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const filename = `${drawingId}-revit.csv`;
  const filepath = path.join(outputDir, filename);

  const csvLines = [
    'ID,Type,SubType,GeometryType,StartX_mm,StartY_mm,EndX_mm,EndY_mm,Length_mm,Width_mm,Thickness_mm,Height_mm,Level,DimensionTexts,Confidence',
  ];

  for (const element of data.elements) {
    const coords_mm = element.geometry.coordinates_mm;
    const start = coords_mm[0] || { x: 0, y: 0 };
    const end = coords_mm[1] || start;

    const row = [
      element.id,
      element.type,
      element.subType || '',
      element.geometry.type,
      start.x.toFixed(2),
      start.y.toFixed(2),
      end.x.toFixed(2),
      end.y.toFixed(2),
      element.properties.length_mm?.toFixed(2) || '',
      element.properties.width_mm?.toFixed(2) || '',
      element.properties.thickness_mm?.toFixed(2) || '',
      element.properties.height_mm?.toFixed(2) || '',
      element.level || 'Level 1',
      (element.properties.dimension_texts || []).join(';'),
      element.properties.confidence?.toFixed(2) || '',
    ];

    csvLines.push(row.map((v) => `"${v}"`).join(','));
  }

  const csvContent = csvLines.join('\n');
  fs.writeFileSync(filepath, csvContent, 'utf-8');

  return filepath;
}

/**
 * Run the complete Mastra AI pipeline on a floor plan image
 */
export async function processMastraAIPipeline(
  options: MastraAIPipelineOptions
): Promise<MastraAIPipelineResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  const warnings: string[] = [];

  const {
    drawing_id,
    file_path,
    output_dir = './revit-outputs',
    flip_y_axis = false,
    default_scaling_factor = 15.0,
    enable_validation = true,
    min_validation_score = 50,
    enable_revit_mcp = false,
    revit_mcp_path,
    revit_level = 'Level 1',
    stop_on_error = false,
  } = options;

  console.log('\n=== MASTRA AI PIPELINE ===');
  console.log(`Drawing: ${drawing_id}`);
  console.log(`File: ${file_path}`);
  console.log();

  try {
    console.log('[1/7] Running Global Analyzer Agent...');
    const globalAnalysis = await analyzeFloorPlanGlobally(file_path);
    console.log(`  ✓ Detected ${globalAnalysis.dimension_zones.length} dimension zones`);
    console.log(`  ✓ Detected ${globalAnalysis.text_annotation_areas.length} annotation areas`);
    console.log(`  ✓ Drawing type: ${globalAnalysis.drawing_metadata.drawing_type}`);
    console.log(`  ✓ Complexity: ${globalAnalysis.drawing_metadata.complexity}`);
    console.log();

    console.log('[2/7] Running Geometric Specialist Agent...');
    const geometricAnalysis = await detectGeometricElements(
      file_path,
      globalAnalysis.main_building_area.bounding_box
    );
    console.log(`  ✓ Detected ${geometricAnalysis.detection_summary.total_elements} elements:`);
    console.log(`    - Walls: ${geometricAnalysis.detection_summary.walls_count}`);
    console.log(`    - Doors: ${geometricAnalysis.detection_summary.doors_count}`);
    console.log(`    - Windows: ${geometricAnalysis.detection_summary.windows_count}`);
    console.log(`    - Rooms: ${geometricAnalysis.detection_summary.rooms_count}`);
    console.log(`    - Stairs: ${geometricAnalysis.detection_summary.stairs_count}`);
    console.log(`    - Columns: ${geometricAnalysis.detection_summary.columns_count}`);
    console.log();

    console.log('[3/7] Running Dimension Specialist Agent...');
    const dimensionAnalysis = await extractDimensionsWithLeaderLines(
      file_path,
      globalAnalysis.dimension_zones
    );
    console.log(`  ✓ Extracted ${dimensionAnalysis.summary.total_dimensions} dimensions:`);
    console.log(`    - Overall: ${dimensionAnalysis.summary.by_type.overall}`);
    console.log(`    - Segment: ${dimensionAnalysis.summary.by_type.segment}`);
    console.log(`    - Detail: ${dimensionAnalysis.summary.by_type.detail}`);
    console.log(`    - Primary unit: ${dimensionAnalysis.summary.primary_unit}`);
    if (dimensionAnalysis.scale_indicators.length > 0) {
      console.log(`  ✓ Found scale indicator: ${dimensionAnalysis.scale_indicators[0].text}`);
    }
    console.log();

    console.log('[4/7] Running Association Agent...');
    const associationAnalysis = await associateDimensionsToElements(
      geometricAnalysis.elements,
      dimensionAnalysis.dimensions,
      geometricAnalysis.image_dimensions.width_px,
      geometricAnalysis.image_dimensions.height_px
    );
    console.log(`  ✓ Created ${associationAnalysis.associations.length} associations`);
    console.log(`  ✓ Association rate: ${((associationAnalysis.summary.associated_dimensions / associationAnalysis.summary.total_dimensions) * 100).toFixed(1)}%`);
    console.log(`  ✓ Average confidence: ${associationAnalysis.summary.association_confidence_avg.toFixed(2)}`);
    if (associationAnalysis.unassociated_dimensions.length > 0) {
      warnings.push(`${associationAnalysis.unassociated_dimensions.length} dimensions could not be associated`);
    }
    console.log();

    console.log('[5/7] Calculating scaling factor...');

    const scalingAssociations = associationAnalysis.associations
      .map((assoc) => {
        const element = geometricAnalysis.elements.find(
          (e, idx) => `elem_${idx}` === assoc.element_id
        );
        const dimension = dimensionAnalysis.dimensions.find(
          (d, idx) => `dim_${idx}` === assoc.dimension_id
        );

        if (!element || !dimension || !dimension.value_mm) {
          return null;
        }

        let element_length_px = 0;
        if (element.element_type === 'wall') {
          const wall = element as any;
          element_length_px = Math.sqrt(
            Math.pow(wall.end_point.x - wall.start_point.x, 2) +
            Math.pow(wall.end_point.y - wall.start_point.y, 2)
          );
        }

        if (element_length_px === 0) return null;

        return {
          element_length_px,
          dimension_value_mm: dimension.value_mm,
          confidence: assoc.confidence,
        };
      })
      .filter((a) => a !== null) as Array<{
        element_length_px: number;
        dimension_value_mm: number;
        confidence: number;
      }>;

    const scalingResult = await scalingCalculatorTool.execute({
      context: {
        associations: scalingAssociations,
        default_scaling_factor,
      },
    });

    console.log(`  ✓ Scaling factor: ${scalingResult.scaling_factor.toFixed(3)} mm/pixel`);
    console.log(`  ✓ Method: ${scalingResult.calculation_method}`);
    console.log(`  ✓ Confidence: ${(scalingResult.confidence * 100).toFixed(1)}%`);
    console.log(`  ✓ Anchor count: ${scalingResult.anchor_count}`);
    if (scalingResult.confidence < 0.6) {
      warnings.push('Low scaling factor confidence - manual verification recommended');
    }
    console.log();

    console.log('[6/7] Transforming coordinates...');

    const transformedElements = await Promise.all(
      geometricAnalysis.elements.map(async (element) => {
        let coordinates_px: Array<{ x: number; y: number }> = [];

        if (element.element_type === 'wall') {
          const wall = element as any;
          coordinates_px = [wall.start_point, wall.end_point];
        } else if (element.element_type === 'door' || element.element_type === 'window' || element.element_type === 'column') {
          const el = element as any;
          coordinates_px = [el.center_point];
        } else if (element.element_type === 'room') {
          const room = element as any;
          coordinates_px = room.boundary_polygon;
        } else if (element.element_type === 'stair') {
          const stair = element as any;
          coordinates_px = [stair.start_point, stair.end_point];
        }

        const transformedCoords = await coordinateTransformationTool.execute({
          context: {
            coordinates_px,
            scaling_factor: scalingResult.scaling_factor,
            flip_y_axis,
            image_height: geometricAnalysis.image_dimensions.height_px,
          },
        });

        return {
          ...element,
          coordinates_px,
          coordinates_mm: transformedCoords.coordinates_mm,
        };
      })
    );

    console.log(`  ✓ Transformed ${transformedElements.length} elements to millimeters`);
    console.log();

    let validationResult: ValidationOutput | undefined;
    if (enable_validation) {
      console.log('[7/7] Running Validation Agent...');
      validationResult = await validateExtractionResults(
        transformedElements,
        dimensionAnalysis.dimensions,
        associationAnalysis.associations,
        {
          imageWidth: geometricAnalysis.image_dimensions.width_px,
          imageHeight: geometricAnalysis.image_dimensions.height_px,
          scalingFactor: scalingResult.scaling_factor,
          scaleText: dimensionAnalysis.scale_indicators[0]?.text,
        }
      );

      console.log(`  ✓ Overall quality: ${validationResult.overall_quality.score}/100 (${validationResult.overall_quality.grade})`);
      console.log(`  ✓ Data completeness: ${validationResult.overall_quality.data_completeness_pct.toFixed(1)}%`);
      console.log(`  ✓ Association success: ${validationResult.overall_quality.association_success_rate.toFixed(1)}%`);
      console.log(`  ✓ Issues found: ${validationResult.statistics.total_issues} (${validationResult.statistics.errors} errors, ${validationResult.statistics.warnings} warnings)`);
      console.log(`  ✓ Ready for Revit: ${validationResult.ready_for_revit ? 'YES' : 'NO'}`);

      if (validationResult.overall_quality.score < min_validation_score) {
        warnings.push(`Quality score (${validationResult.overall_quality.score}) below threshold (${min_validation_score})`);
      }

      if (!validationResult.ready_for_revit) {
        warnings.push('Data is not ready for Revit import - review validation issues');
      }

      console.log();
    }

    let revitMCPResult;
    let revitMCPAvailable = false;

    if (enable_revit_mcp) {
      console.log('[7.5/8] Checking Revit MCP availability...');

      const revitClient = getRevitMCPClient({
        mcpPath: revit_mcp_path,
        autoConnect: true,
      });

      const revitStatus = await revitClient.getStatus();
      revitMCPAvailable = revitStatus.isAvailable && revitStatus.isConnected;

      if (revitMCPAvailable) {
        console.log('  ✓ Revit MCP server is available');
        console.log(`  ✓ Revit version: ${revitStatus.revitVersion || 'Unknown'}`);
        console.log(`  ✓ Active document: ${revitStatus.activeDocument || 'Unknown'}`);

        if (revitStatus.projectInfo) {
          console.log(`  ✓ Available levels: ${revitStatus.projectInfo.levels.join(', ')}`);
        }

        console.log('\n[7.6/8] Creating elements in Revit via MCP...');

        const geometricElements: GeometricElement[] = transformedElements.map((element, idx) => {
          const associations = associationAnalysis.associations.filter(
            (a) => a.element_id === `elem_${idx}`
          );
          const dimensionTexts = associations.map((a) => a.dimension_text);

          let properties: any = {
            confidence: element.confidence,
            dimension_texts: dimensionTexts,
          };

          if (element.element_type === 'wall') {
            const wall = element as any;
            const length_mm = Math.sqrt(
              Math.pow(wall.coordinates_mm[1].x - wall.coordinates_mm[0].x, 2) +
              Math.pow(wall.coordinates_mm[1].y - wall.coordinates_mm[0].y, 2)
            );

            properties = {
              ...properties,
              subType: wall.wall_type,
              length_mm: Math.round(length_mm * 100) / 100,
              thickness_mm: wall.thickness_px ? wall.thickness_px * scalingResult.scaling_factor : (wall.wall_type === 'exterior' ? 200 : 150),
              height_mm: wall.height_mm || (wall.wall_type === 'exterior' ? 3000 : 2700),
            };
          } else if (element.element_type === 'door') {
            const door = element as any;
            properties = {
              ...properties,
              subType: door.door_type,
              width_mm: door.width_px * scalingResult.scaling_factor,
              height_mm: 2000,
            };
          } else if (element.element_type === 'window') {
            const window = element as any;
            properties = {
              ...properties,
              subType: window.window_type,
              width_mm: window.width_px * scalingResult.scaling_factor,
              height_mm: window.height_px ? window.height_px * scalingResult.scaling_factor : 1200,
              sill_height_mm: window.sill_height_mm || 900,
            };
          } else if (element.element_type === 'room') {
            const room = element as any;
            properties = {
              ...properties,
              room_label: room.room_label,
              room_number: room.room_type,
            };
          }

          return {
            id: `elem_${idx}`,
            type: element.element_type,
            geometry: {
              type: element.element_type === 'wall' ? 'line' : element.element_type === 'room' ? 'polygon' : 'point',
              coordinates_mm: (element as any).coordinates_mm,
            },
            properties,
            metadata: {
              confidence: element.confidence,
            },
          } as GeometricElement;
        });

        revitMCPResult = await revitClient.createElementsBatch(geometricElements, {
          level: revit_level,
          stopOnError: stop_on_error,
          onProgress: (progress) => {
            console.log(`  Progress: ${progress.current}/${progress.total} - Creating ${progress.element.type} (${progress.element.id})`);
          },
        });

        console.log(`  Created ${revitMCPResult.successCount}/${revitMCPResult.totalElements} elements`);
        if (revitMCPResult.failureCount > 0) {
          console.log(`  ${revitMCPResult.failureCount} elements failed to create`);
          revitMCPResult.errors.forEach((err) => {
            console.log(`    - Element ${err.index}: ${err.error}`);
            warnings.push(`MCP: Element ${err.index} failed - ${err.error}`);
          });
        }
        console.log();
      } else {
        console.log('  Revit MCP server not available - falling back to JSON/CSV export');
        warnings.push('Revit MCP was enabled but server is not available');
        console.log();
      }
    }

    console.log('[8/8] Generating Revit outputs (JSON/CSV)...');

    const revitData = {
      metadata: {
        drawing_id,
        file_name: path.basename(file_path),
        scale: dimensionAnalysis.scale_indicators[0]?.parsed_scale || 'unknown',
        units: 'mm',
        image_width: geometricAnalysis.image_dimensions.width_px,
        image_height: geometricAnalysis.image_dimensions.height_px,
        tool: 'mastra-ai-pipeline',
        coordinate_transformation: {
          scaling_factor: scalingResult.scaling_factor,
          pixels_per_mm: scalingResult.pixels_per_mm,
          scaling_confidence: scalingResult.confidence,
          anchor_count: scalingResult.anchor_count,
          coordinate_system: flip_y_axis ? 'bottom-left origin' : 'top-left origin',
        },
        data_quality: validationResult ? {
          overall_completeness: validationResult.overall_quality.data_completeness_pct,
          quality_score: validationResult.overall_quality.score,
          quality_grade: validationResult.overall_quality.grade,
          total_issues: validationResult.statistics.total_issues,
          errors: validationResult.statistics.errors,
          warnings: validationResult.statistics.warnings,
        } : undefined,
      },
      elements: transformedElements.map((element, idx) => {
        const associations = associationAnalysis.associations.filter(
          (a) => a.element_id === `elem_${idx}`
        );
        const dimensionTexts = associations.map((a) => a.dimension_text);

        let properties: any = {
          confidence: element.confidence,
        };

        if (element.element_type === 'wall') {
          const wall = element as any;
          const length_mm = Math.sqrt(
            Math.pow(wall.coordinates_mm[1].x - wall.coordinates_mm[0].x, 2) +
            Math.pow(wall.coordinates_mm[1].y - wall.coordinates_mm[0].y, 2)
          );

          properties = {
            ...properties,
            dimension_texts: dimensionTexts,
            length_mm: Math.round(length_mm * 100) / 100,
            thickness_mm: wall.thickness_px ? wall.thickness_px * scalingResult.scaling_factor : (wall.wall_type === 'exterior' ? 200 : 150),
            height_mm: wall.height_mm || (wall.wall_type === 'exterior' ? 3000 : 2700),
          };
        } else if (element.element_type === 'door') {
          const door = element as any;
          properties = {
            ...properties,
            dimension_texts: dimensionTexts,
            width_mm: door.width_px * scalingResult.scaling_factor,
            height_mm: 2000, // Default door height
            swing_direction: door.swing_direction,
            opening_angle: door.opening_angle_degrees,
          };
        } else if (element.element_type === 'window') {
          const window = element as any;
          properties = {
            ...properties,
            dimension_texts: dimensionTexts,
            width_mm: window.width_px * scalingResult.scaling_factor,
            height_mm: window.height_px ? window.height_px * scalingResult.scaling_factor : 1200,
            sill_height_mm: window.sill_height_mm || 900,
          };
        } else if (element.element_type === 'room') {
          const room = element as any;
          properties = {
            ...properties,
            room_label: room.room_label,
            room_type: room.room_type,
          };
        }

        return {
          id: `elem_${idx}`,
          type: element.element_type,
          subType: (element as any).wall_type || (element as any).door_type || (element as any).window_type || (element as any).room_type,
          geometry: {
            type: element.element_type === 'wall' ? 'line' : element.element_type === 'room' ? 'polygon' : 'point',
            coordinates_px: (element as any).coordinates_px,
            coordinates_mm: (element as any).coordinates_mm,
          },
          properties,
          level: 'Level 1',
        };
      }),
      statistics: {
        total_elements: transformedElements.length,
        elements_by_type: {
          wall: geometricAnalysis.detection_summary.walls_count,
          door: geometricAnalysis.detection_summary.doors_count,
          window: geometricAnalysis.detection_summary.windows_count,
          room: geometricAnalysis.detection_summary.rooms_count,
          stair: geometricAnalysis.detection_summary.stairs_count,
          column: geometricAnalysis.detection_summary.columns_count,
        },
        elements_with_dimensions: associationAnalysis.summary.elements_with_dimensions,
        total_dimensions: dimensionAnalysis.summary.total_dimensions,
        association_rate: (associationAnalysis.summary.associated_dimensions / associationAnalysis.summary.total_dimensions) * 100,
      },
    };

    const jsonPath = await saveRevitJSON(revitData, drawing_id, output_dir);
    const csvPath = await saveRevitCSV(revitData, drawing_id, output_dir);

    console.log(`  ✓ Generated: ${jsonPath}`);
    console.log(`  ✓ Generated: ${csvPath}`);
    console.log();

    const processingTime = Date.now() - startTime;
    console.log(`=== PIPELINE COMPLETE ===`);
    console.log(`Total time: ${(processingTime / 1000).toFixed(2)}s`);
    if (warnings.length > 0) {
      console.log(`Warnings: ${warnings.length}`);
      warnings.forEach((w) => console.log(`  - ${w}`));
    }
    console.log();

    return {
      drawing_id,
      success: true,
      global_analysis: globalAnalysis,
      geometric_analysis: geometricAnalysis,
      dimension_analysis: dimensionAnalysis,
      association_analysis: associationAnalysis,
      validation_result: validationResult,
      scaling_factor: scalingResult.scaling_factor,
      scaling_confidence: scalingResult.confidence,
      revit_json_path: jsonPath,
      revit_csv_path: csvPath,
      revit_mcp_enabled: enable_revit_mcp,
      revit_mcp_available: revitMCPAvailable,
      revit_mcp_result: revitMCPResult,
      processing_time_ms: processingTime,
      errors,
      warnings,
    };
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('Pipeline failed:', error);
    errors.push(error instanceof Error ? error.message : String(error));

    return {
      drawing_id,
      success: false,
      processing_time_ms: processingTime,
      errors,
      warnings,
    };
  }
}
