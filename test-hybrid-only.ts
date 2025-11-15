#!/usr/bin/env tsx

import * as dotenv from 'dotenv';
import { processWithHybridDetector } from './src/processors/hybrid-wall-detector-processor.js';
import { db, testDrawings } from './src/db/index.js';
import { eq } from 'drizzle-orm';

dotenv.config({ path: '.env.development' });

const drawingName = process.argv[2] || 'just-box-sample';

const [drawing] = await db
  .select()
  .from(testDrawings)
  .where(eq(testDrawings.drawingId, drawingName))
  .limit(1);

if (!drawing) {
  console.error(`Drawing "${drawingName}" not found`);
  process.exit(1);
}

console.log(`\nRunning Hybrid CV+AI on: ${drawingName}\n`);
const result = await processWithHybridDetector(drawing.filePath, drawing.drawingId);

console.log('\n[OK] Complete!');
console.log(`  Objects: ${result.objectCount}`);
console.log(`  Time: ${(result.processingTime / 1000).toFixed(2)}s`);
console.log(`  Cost: ¥${result.cost.toFixed(2)}`);
console.log(`  Result ID: ${result.extractionResultId}`);
console.log(`\nNote: Individual extraction results cannot be viewed directly in the UI.`);
console.log(`To view results in the UI, run a test using test-runner.ts:`);
console.log(`  npx tsx src/test-runner.ts --workflow hybrid-cv-ai --drawing ${drawingName}`);
console.log(`\nOr view the drawing page:`);
console.log(`  http://localhost:5173/drawing/${drawingName}\n`);

process.exit(0);
