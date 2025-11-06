import { mastra } from './mastra/index.js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.development' });

/**
 * Main entry point for OCR Test Playground
 * This starts the Mastra server (if needed for API access)
 */
async function main() {
  console.log('🚀 OCR Test Playground - Mastra initialized');
  console.log('');
  console.log('Available workflows:');
  console.log('  - cloud-vision-ocr: Google Cloud Vision text extraction');
  console.log('  - gemini-multimodal: Gemini 2.0 Flash multimodal extraction');
  console.log('  - hybrid-comparison: Combined approach with both tools');
  console.log('');
  console.log('Available tools:');
  console.log('  - dimension-extractor: Extract dimensions from text');
  console.log('  - accuracy-calculator: Calculate accuracy metrics');
  console.log('  - report-generator: Generate comparison reports');
  console.log('');
  console.log('Use the test runner CLI to run tests:');
  console.log('  npm run test:all');
  console.log('  npm run test:cloud-vision');
  console.log('  npm run test:gemini');
  console.log('  npm run test:hybrid');
}

main().catch(console.error);
