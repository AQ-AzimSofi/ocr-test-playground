import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.development' });

/**
 * OCR Test Playground
 *
 * R&D system for evaluating OCR and AI tools on construction layout drawings (配置図).
 *
 * Usage:
 *   npm run test:all          - Test all processors (Cloud Vision, Gemini, Hybrid)
 *   npm run test:cloud-vision - Test only Cloud Vision
 *   npm run test:gemini       - Test only Gemini
 *   npm run test:hybrid       - Test hybrid approach
 *
 * See README.md for setup instructions.
 */

console.log('🚀 OCR Test Playground');
console.log('');
console.log('Available commands:');
console.log('  npm run test:all          - Test all processors');
console.log('  npm run test:cloud-vision - Test Cloud Vision only');
console.log('  npm run test:gemini       - Test Gemini only');
console.log('  npm run test:hybrid       - Test hybrid approach');
console.log('');
console.log('See README.md for setup instructions.');
