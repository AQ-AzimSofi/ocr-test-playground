import type { ProcessorInfo, ProcessorCategory } from './types';

/**
 * Comprehensive processor metadata for all 14 OCR processors
 * Used by UI to display processor information, categories, and requirements
 */

export const PROCESSOR_INFO: ProcessorInfo[] = [
  // ==================== CONFIDENTIAL-SAFE PROCESSORS ====================
  {
    id: 'cloud-vision',
    name: 'Google Cloud Vision',
    description: 'Fast, reliable paragraph-level OCR with high accuracy',
    category: 'confidential-safe',
    cost: '~0.15 yen per image',
    requiresApiKeys: ['googleCloudVision'],
    confidentialSafe: true,
  },
  {
    id: 'azure-read',
    name: 'Azure Read API',
    description: 'Cost-effective word-level OCR with good accuracy',
    category: 'confidential-safe',
    cost: '~0.225 yen per page',
    requiresApiKeys: ['azureComputerVision', 'azureEndpoint'],
    confidentialSafe: true,
  },
  {
    id: 'azure-layout',
    name: 'Azure Layout API',
    description: 'Structure-aware OCR with table detection',
    category: 'confidential-safe',
    cost: '~1.50 yen per page',
    requiresApiKeys: ['azureComputerVision', 'azureEndpoint'],
    confidentialSafe: true,
  },
  {
    id: 'document-ai',
    name: 'Document AI',
    description: 'Advanced word-level OCR with structure analysis',
    category: 'confidential-safe',
    cost: '~0.225 yen per page',
    requiresApiKeys: ['documentAiProjectId', 'documentAiCredentials', 'documentAiProcessorId', 'documentAiLocation'],
    confidentialSafe: true,
  },

  // ==================== HYBRID PROCESSORS ====================
  {
    id: 'cloud-vision-gemini-hybrid',
    name: 'Cloud Vision + Gemini Hybrid',
    description: 'Region-level fusion with AI correction',
    category: 'hybrids',
    cost: '~0.15-0.30 yen per image (depends on low-confidence region count)',
    requiresApiKeys: ['googleCloudVision', 'googleGemini'],
    confidentialSafe: false,
  },
  {
    id: 'azure-read-gemini-hybrid',
    name: 'Azure Read + Gemini Hybrid',
    description: 'Budget-friendly hybrid with word-level precision',
    category: 'hybrids',
    cost: '~0.225-0.40 yen per image (depends on low-confidence word count)',
    requiresApiKeys: ['azureComputerVision', 'azureEndpoint', 'googleGemini'],
    confidentialSafe: false,
  },
  {
    id: 'document-ai-gemini-hybrid',
    name: 'Document AI + Gemini Hybrid',
    description: 'Advanced hybrid with Document AI validation workflow',
    category: 'hybrids',
    cost: '~0.25-0.50 yen per image (depends on validation issues)',
    requiresApiKeys: ['documentAiProjectId', 'documentAiCredentials', 'googleGemini'],
    confidentialSafe: false,
  },
  {
    id: 'gemini-self-calibrating',
    name: 'Gemini Self-Calibrating',
    description: 'AI-powered coordinate calibration using Cloud Vision as reference',
    category: 'hybrids',
    cost: '~0.25-0.40 yen per image (depends on Gemini-only text count)',
    requiresApiKeys: ['googleCloudVision', 'googleGemini'],
    confidentialSafe: false,
  },

  // ==================== EXPERIMENTAL PROCESSORS ====================
  {
    id: 'hybrid',
    name: 'Hybrid (Legacy)',
    description: 'Simple parallel processing (Cloud Vision + Gemini)',
    category: 'experimental',
    cost: '~0.20 yen per image',
    requiresApiKeys: ['googleCloudVision', 'googleGemini'],
    confidentialSafe: false,
  },
  {
    id: 'gemini-coordinates',
    name: 'Gemini Coordinates',
    description: 'Asks Gemini for text + percentage coordinates (EXPERIMENTAL)',
    category: 'experimental',
    cost: '~0.05 yen per image',
    requiresApiKeys: ['googleGemini'],
    confidentialSafe: false,
  },
  {
    id: 'gemini-bbox-synthesis',
    name: 'Gemini Bbox Synthesis',
    description: 'Matches Gemini text to Cloud Vision bboxes (EXPERIMENTAL)',
    category: 'experimental',
    cost: '~0.20 yen per image',
    requiresApiKeys: ['googleCloudVision', 'googleGemini'],
    confidentialSafe: false,
  },
  {
    id: 'gemini-validation-azure',
    name: 'Gemini Validation - Azure Read',
    description: 'Uses Gemini as QA reviewer to validate Azure Read results (EXPERIMENTAL)',
    category: 'experimental',
    cost: '~0.30-0.50 yen per image (depends on issues found)',
    requiresApiKeys: ['azureComputerVision', 'azureEndpoint', 'googleGemini'],
    confidentialSafe: false,
  },
  {
    id: 'region-classifier',
    name: 'Region Classifier',
    description: 'Smart routing: Azure for high confidence, Gemini for low (EXPERIMENTAL)',
    category: 'experimental',
    cost: '~1.50-1.70 yen per image (depends on low-confidence region count)',
    requiresApiKeys: ['azureComputerVision', 'azureEndpoint', 'googleGemini'],
    confidentialSafe: false,
  },
  {
    id: 'gemini-geometric',
    name: 'Gemini Geometric',
    description: 'AI-powered floor plan analysis with wall and room detection',
    category: 'experimental',
    cost: '~1.50 yen per floor plan',
    requiresApiKeys: ['googleGemini'],
    confidentialSafe: false,
  },
];

/**
 * Get processor info by ID
 */
export function getProcessorInfo(id: string): ProcessorInfo | undefined {
  return PROCESSOR_INFO.find((p) => p.id === id);
}

/**
 * Get processors by category
 */
export function getProcessorsByCategory(
  category: ProcessorCategory
): ProcessorInfo[] {
  return PROCESSOR_INFO.filter((p) => p.category === category);
}

/**
 * Helper: Check if Cloud Vision authentication is configured
 * Cloud Vision accepts EITHER service account OR API key
 */
function hasCloudVisionAuth(apiKeys: Record<string, string>): boolean {
  const hasServiceAccount =
    !!(apiKeys.cloudVisionServiceAccount &&
    apiKeys.cloudVisionServiceAccount.trim().length > 0 &&
    apiKeys.cloudVisionProjectId &&
    apiKeys.cloudVisionProjectId.trim().length > 0);

  const hasApiKey =
    !!(apiKeys.googleCloudVision &&
    apiKeys.googleCloudVision.trim().length > 0);

  return hasServiceAccount || hasApiKey;
}

/**
 * Check if processor is available based on configured API keys
 */
export function isProcessorAvailable(
  processorId: string,
  apiKeys: Record<string, string>
): boolean {
  const processor = getProcessorInfo(processorId);
  if (!processor) return false;

  // Check if all required API keys are configured
  return processor.requiresApiKeys.every((key) => {
    // Special case: Cloud Vision accepts EITHER service account OR API key
    if (key === 'googleCloudVision') {
      return hasCloudVisionAuth(apiKeys);
    }

    const value = apiKeys[key];
    return value !== undefined && value.trim().length > 0;
  });
}

/**
 * Get list of unavailable processors with reasons
 */
export function getUnavailableProcessors(
  apiKeys: Record<string, string>
): Array<{ processor: ProcessorInfo; missingKeys: string[] }> {
  return PROCESSOR_INFO.filter(
    (p) => !isProcessorAvailable(p.id, apiKeys)
  ).map((processor) => ({
    processor,
    missingKeys: processor.requiresApiKeys.filter(
      (key) => !apiKeys[key] || apiKeys[key].trim().length === 0
    ),
  }));
}

/**
 * Get confidential-safe processors only
 */
export function getConfidentialSafeProcessors(): ProcessorInfo[] {
  return PROCESSOR_INFO.filter((p) => p.confidentialSafe);
}

/**
 * Get all processor IDs
 */
export function getAllProcessorIds(): string[] {
  return PROCESSOR_INFO.map((p) => p.id);
}

/**
 * Estimate total cost for a batch of images
 */
export function estimateCost(
  processorIds: string[],
  imageCount: number
): { min: number; max: number; note: string } {
  let minTotal = 0;
  let maxTotal = 0;

  for (const id of processorIds) {
    const processor = getProcessorInfo(id);
    if (!processor) continue;

    // Parse cost range from description
    const costMatch = processor.cost.match(/([0-9.]+)(?:-([0-9.]+))?/);
    if (costMatch) {
      const min = parseFloat(costMatch[1]);
      const max = costMatch[2] ? parseFloat(costMatch[2]) : min;
      minTotal += min * imageCount;
      maxTotal += max * imageCount;
    }
  }

  const note =
    minTotal === maxTotal
      ? `Estimated cost: ¥${minTotal.toFixed(2)}`
      : `Estimated cost: ¥${minTotal.toFixed(2)} - ¥${maxTotal.toFixed(2)} (varies based on content)`;

  return { min: minTotal, max: maxTotal, note };
}
