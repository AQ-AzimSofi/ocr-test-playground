import { Mastra } from '@mastra/core';
import { cloudVisionWorkflow } from './workflows/cloud-vision-workflow.js';
import { geminiWorkflow } from './workflows/gemini-workflow.js';
import { hybridWorkflow } from './workflows/hybrid-workflow.js';
import { dimensionExtractorTool } from './tools/dimension-extractor.js';
import { accuracyCalculatorTool } from './tools/accuracy-calculator.js';
import { reportGeneratorTool } from './tools/report-generator.js';

/**
 * Mastra instance configuration for OCR testing
 */
export const mastra = new Mastra({
  workflows: {
    cloudVisionWorkflow,
    geminiWorkflow,
    hybridWorkflow,
  },
  tools: {
    dimensionExtractorTool,
    accuracyCalculatorTool,
    reportGeneratorTool,
  },
});
