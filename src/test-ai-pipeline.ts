#!/usr/bin/env tsx

import * as path from 'path';
import * as fs from 'fs';
import { processMastraAIPipeline } from './processors/mastra-ai-pipeline-processor.js';

/**
 * Test script for the Mastra AI Pipeline
 *
 * Usage:
 *   npm run test:ai-pipeline
 *   npm run test:ai-pipeline -- --drawing clean-sample01
 *   npm run test:ai-pipeline -- --drawing clean-sample01 --no-validation
 */

async function main() {
  const args = process.argv.slice(2);

  let drawingId = 'clean-sample01';
  let enableValidation = true;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--drawing' && args[i + 1]) {
      drawingId = args[i + 1];
      i++;
    } else if (args[i] === '--no-validation') {
      enableValidation = false;
    }
  }

  const testDrawingDir = path.join(process.cwd(), 'test-drawings', drawingId);
  const imagePath = fs.readdirSync(testDrawingDir).find((f) => f.match(/\.(png|jpg|jpeg)$/i));

  if (!imagePath) {
    console.error(`No image file found in ${testDrawingDir}`);
    process.exit(1);
  }

  const fullImagePath = path.join(testDrawingDir, imagePath);

  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║           MASTRA AI PIPELINE - FLOOR PLAN ANALYSIS           ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log();

  try {
    const result = await processMastraAIPipeline({
      drawing_id: drawingId,
      file_path: fullImagePath,
      output_dir: './revit-outputs',
      flip_y_axis: false,
      default_scaling_factor: 15.0,
      enable_validation: enableValidation,
      min_validation_score: 50,
    });

    if (result.success) {
      console.log('╔═══════════════════════════════════════════════════════════════╗');
      console.log('║                        SUCCESS SUMMARY                        ║');
      console.log('╚═══════════════════════════════════════════════════════════════╝');
      console.log();
      console.log(`Drawing: ${result.drawing_id}`);
      console.log(`Processing time: ${(result.processing_time_ms / 1000).toFixed(2)}s`);
      console.log();

      if (result.geometric_analysis) {
        console.log('Detected Elements:');
        console.log(`  Walls:   ${result.geometric_analysis.detection_summary.walls_count}`);
        console.log(`  Doors:   ${result.geometric_analysis.detection_summary.doors_count}`);
        console.log(`  Windows: ${result.geometric_analysis.detection_summary.windows_count}`);
        console.log(`  Rooms:   ${result.geometric_analysis.detection_summary.rooms_count}`);
        console.log(`  Stairs:  ${result.geometric_analysis.detection_summary.stairs_count}`);
        console.log(`  Columns: ${result.geometric_analysis.detection_summary.columns_count}`);
        console.log();
      }

      if (result.dimension_analysis) {
        console.log('Dimensions:');
        console.log(`  Total: ${result.dimension_analysis.summary.total_dimensions}`);
        console.log(`  Overall: ${result.dimension_analysis.summary.by_type.overall}`);
        console.log(`  Segment: ${result.dimension_analysis.summary.by_type.segment}`);
        console.log(`  Detail: ${result.dimension_analysis.summary.by_type.detail}`);
        console.log();
      }

      if (result.association_analysis) {
        console.log('Associations:');
        console.log(`  Total: ${result.association_analysis.associations.length}`);
        console.log(`  Rate: ${((result.association_analysis.summary.associated_dimensions / result.association_analysis.summary.total_dimensions) * 100).toFixed(1)}%`);
        console.log(`  Avg confidence: ${result.association_analysis.summary.association_confidence_avg.toFixed(2)}`);
        console.log();
      }

      if (result.scaling_factor) {
        console.log('Scaling:');
        console.log(`  Factor: ${result.scaling_factor.toFixed(3)} mm/pixel`);
        console.log(`  Confidence: ${((result.scaling_confidence || 0) * 100).toFixed(1)}%`);
        console.log();
      }

      if (result.validation_result) {
        console.log('Validation:');
        console.log(`  Quality score: ${result.validation_result.overall_quality.score}/100`);
        console.log(`  Grade: ${result.validation_result.overall_quality.grade}`);
        console.log(`  Data completeness: ${result.validation_result.overall_quality.data_completeness_pct.toFixed(1)}%`);
        console.log(`  Ready for Revit: ${result.validation_result.ready_for_revit ? '✓ YES' : '✗ NO'}`);
        console.log(`  Issues: ${result.validation_result.statistics.total_issues} (${result.validation_result.statistics.errors} errors, ${result.validation_result.statistics.warnings} warnings)`);
        console.log();
      }

      console.log('Output Files:');
      console.log(`  JSON: ${result.revit_json_path}`);
      console.log(`  CSV:  ${result.revit_csv_path}`);
      console.log();

      if (result.warnings.length > 0) {
        console.log('Warnings:');
        result.warnings.forEach((w) => console.log(`  ⚠ ${w}`));
        console.log();
      }

      console.log('✓ Pipeline completed successfully!');
      console.log();
    } else {
      console.error('╔═══════════════════════════════════════════════════════════════╗');
      console.error('║                          FAILURE                              ║');
      console.error('╚═══════════════════════════════════════════════════════════════╝');
      console.error();
      console.error('Errors:');
      result.errors.forEach((e) => console.error(`  ✗ ${e}`));
      console.error();
      process.exit(1);
    }
  } catch (error) {
    console.error('╔═══════════════════════════════════════════════════════════════╗');
    console.error('║                      UNEXPECTED ERROR                         ║');
    console.error('╚═══════════════════════════════════════════════════════════════╝');
    console.error();
    console.error(error);
    process.exit(1);
  }
}

main();
