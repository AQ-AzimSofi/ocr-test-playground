import { CloudVisionProcessor } from './cloud-vision-processor';
import { AzureDocumentProcessor } from './azure-processors';
import { DocumentAIProcessor } from './document-ai-processor';
import type { ProcessorResult, ProcessorConfig } from './types';

/**
 * Processor factory - creates and executes OCR processors
 * For processors not yet fully implemented, returns stub implementations
 */

export async function runProcessor(
  processorId: string,
  filePath: string,
  config: ProcessorConfig
): Promise<ProcessorResult> {
  const { apiKeys } = config;

  try {
    switch (processorId) {
      // ==================== CONFIDENTIAL-SAFE PROCESSORS ====================
      case 'cloud-vision': {
        // Check for either service account or API key
        const hasServiceAccount =
          apiKeys.cloudVisionServiceAccount && apiKeys.cloudVisionProjectId;
        const hasApiKey = apiKeys.googleCloudVision;

        if (!hasServiceAccount && !hasApiKey) {
          throw new Error(
            'Google Cloud Vision credentials not configured. ' +
            'Please provide either Service Account JSON + Project ID or API Key in Settings.'
          );
        }

        const processor = new CloudVisionProcessor({
          serviceAccountJson: apiKeys.cloudVisionServiceAccount,
          projectId: apiKeys.cloudVisionProjectId,
          apiKey: apiKeys.googleCloudVision,
        });

        try {
          const result = await processor.processImage(filePath);
          return result;
        } finally {
          // Clean up temp credentials file
          processor.cleanup();
        }
      }

      case 'azure-read': {
        if (!apiKeys.azureComputerVision || !apiKeys.azureEndpoint) {
          throw new Error('Azure credentials not configured');
        }
        const processor = new AzureDocumentProcessor(
          apiKeys.azureEndpoint,
          apiKeys.azureComputerVision
        );
        return await processor.processRead(filePath);
      }

      case 'azure-layout': {
        if (!apiKeys.azureComputerVision || !apiKeys.azureEndpoint) {
          throw new Error('Azure credentials not configured');
        }
        const processor = new AzureDocumentProcessor(
          apiKeys.azureEndpoint,
          apiKeys.azureComputerVision
        );
        return await processor.processLayout(filePath);
      }

      case 'document-ai': {
        if (!apiKeys.documentAiProjectId || !apiKeys.documentAiCredentials) {
          throw new Error('Document AI credentials not configured');
        }
        const processor = new DocumentAIProcessor(
          apiKeys.documentAiProjectId,
          apiKeys.documentAiCredentials
        );
        return await processor.process(filePath);
      }

      // ==================== HYBRID & EXPERIMENTAL PROCESSORS ====================
      // For now, these return stub implementations
      // TODO: Implement full hybrid logic in future iterations

      case 'cloud-vision-gemini-hybrid':
      case 'azure-read-gemini-hybrid':
      case 'document-ai-gemini-hybrid':
      case 'gemini-self-calibrating':
      case 'hybrid':
      case 'gemini-coordinates':
      case 'gemini-bbox-synthesis':
      case 'gemini-validation-azure':
      case 'region-classifier':
      case 'gemini-geometric':
        return createStubResult(processorId);

      default:
        throw new Error(`Unknown processor: ${processorId}`);
    }
  } catch (error) {
    // Return error result
    return {
      success: false,
      tool: processorId,
      rawText: '',
      boundingBoxes: [],
      confidence: 0,
      processingTime: 0,
      cost: 0,
      metadata: {
        pageCount: 0,
        avgConfidence: 0,
      },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Create stub result for processors not yet implemented
 * This allows the UI to work even though not all processors are ready
 */
function createStubResult(processorId: string): ProcessorResult {
  return {
    success: false,
    tool: processorId,
    rawText: '',
    boundingBoxes: [],
    confidence: 0,
    processingTime: 0,
    cost: 0,
    metadata: {
      pageCount: 0,
      avgConfidence: 0,
    },
    error: `Processor '${processorId}' is not yet fully implemented in this version. Currently available processors: cloud-vision, azure-read, azure-layout, document-ai`,
  };
}

/**
 * Check if processor is implemented
 */
export function isProcessorImplemented(processorId: string): boolean {
  const implemented = [
    'cloud-vision',
    'azure-read',
    'azure-layout',
    'document-ai',
  ];
  return implemented.includes(processorId);
}

/**
 * Get list of implemented processors
 */
export function getImplementedProcessors(): string[] {
  return [
    'cloud-vision',
    'azure-read',
    'azure-layout',
    'document-ai',
  ];
}
