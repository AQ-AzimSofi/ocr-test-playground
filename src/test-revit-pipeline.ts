#!/usr/bin/env node

import { processForRevit } from './processors/revit-complete-processor.js';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.development' });

/**
 * Test script for the complete Revit processing pipeline
 * Usage: tsx src/test-revit-pipeline.ts [drawing-path]
 */

async function main() {
  console.log(
    '\n╔════════════════════════════════════════════════════════════════════╗'
  );
  console.log(
    '║         REVIT PROCESSING PIPELINE - TEST SCRIPT                   ║'
  );
  console.log(
    '╚════════════════════════════════════════════════════════════════════╝\n'
  );

  // Get drawing path from command line or use default
  const drawingPath = process.argv[2] || 'test-drawings/sample01/zumen_04b.png';
  const fullPath = path.resolve(drawingPath);

  // Validate file exists
  if (!fs.existsSync(fullPath)) {
    console.error(`Error: Drawing file not found: ${fullPath}`);
    console.log('\nUsage: tsx src/test-revit-pipeline.ts [path-to-drawing]\n');
    process.exit(1);
  }

  // Extract drawing ID from filename
  const drawingId = path.basename(fullPath, path.extname(fullPath));

  console.log(`Input Drawing:`);
  console.log(`  File: ${path.basename(fullPath)}`);
  console.log(`  Path: ${fullPath}`);
  console.log(`  ID:   ${drawingId}\n`);

  try {
    // Run the complete pipeline
    const result = await processForRevit(fullPath, drawingId);

    if (result.success) {
      console.log(`\n${'═'.repeat(70)}`);
      console.log(`SUCCESS - Revit files generated`);
      console.log(`${'═'.repeat(70)}\n`);

      console.log(`Summary:`);
      console.log(`  Detected objects: ${result.objectCount}`);
      console.log(`  Dimension associations: ${result.dimensionAssociations}`);
      console.log(
        `  Processing time: ${(result.processingTime / 1000).toFixed(2)}s`
      );
      console.log(`  Total cost: ¥${result.totalCost.toFixed(2)}\n`);

      console.log(`Output Files:`);
      console.log(`  JSON: ${result.outputs.json}`);
      console.log(`  CSV:  ${result.outputs.csv}\n`);

      console.log(`Next Steps:`);
      console.log(`  1. Install Dynamo for Revit`);
      console.log(`  2. Create a Dynamo script that reads the JSON file`);
      console.log(`  3. Use JSON data to generate 3D geometry in Revit`);
      console.log(`  4. Refer to: docs/REVIT_INTEGRATION.md (to be created)\n`);
    }
  } catch (error) {
    console.error(`\nPipeline failed:`, error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
