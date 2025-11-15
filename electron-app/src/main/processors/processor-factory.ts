// Internal imports
import { CloudVisionProcessor } from './cloud-vision-processor';
import { AzureDocumentProcessor } from './azure-processors';
import { DocumentAIProcessor } from './document-ai-processor';
import { GeminiGeometricDetector } from './gemini-geometric-processor';
import { CloudVisionGeminiHybridProcessor } from './cloud-vision-gemini-hybrid-processor';
import { AzureReadGeminiHybridProcessor } from './azure-read-gemini-hybrid-processor';
import { DocumentAIGeminiHybridProcessor } from './document-ai-gemini-hybrid-processor';
import { GeminiSelfCalibratingProcessor } from './gemini-self-calibrating-processor';

// Type imports
import type { ProcessorResult, ProcessorConfig, BoundingBox } from './types';

const isDevelopment = process.env.NODE_ENV !== 'production';

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
        if (
          !apiKeys.documentAiProjectId ||
          !apiKeys.documentAiCredentials ||
          !apiKeys.documentAiProcessorId ||
          !apiKeys.documentAiLocation
        ) {
          throw new Error(
            'Document AI credentials not fully configured. ' +
            'Please provide Project ID, Service Account JSON, Processor ID, and Location in Settings.'
          );
        }
        const processor = new DocumentAIProcessor(
          apiKeys.documentAiProjectId,
          apiKeys.documentAiCredentials,
          apiKeys.documentAiProcessorId,
          apiKeys.documentAiLocation
        );
        return await processor.process(filePath);
      }

      // ==================== EXPERIMENTAL PROCESSORS ====================

      case 'gemini-geometric': {
        if (!apiKeys.googleGemini) {
          throw new Error('Google Gemini API key not configured');
        }

        const startTime = Date.now();
        const detector = new GeminiGeometricDetector(apiKeys.googleGemini);

        const result = await detector.detectGeometricObjects(filePath);
        const processingTime = Date.now() - startTime;

        // Convert geometric objects to bounding boxes
        const boundingBoxes: BoundingBox[] = result.objects.map(obj => ({
          text: obj.properties.label || `${obj.type}${obj.subType ? ` (${obj.subType})` : ''}`,
          bounds: obj.coordinates,
          confidence: obj.confidence,
          page: 1,
        }));

        // Calculate average confidence
        const avgConfidence = result.objects.length > 0
          ? result.objects.reduce((sum, obj) => sum + obj.confidence, 0) / result.objects.length
          : 0;

        // Create readable text summary
        const textSummary = result.objects.map(obj => {
          const label = obj.properties.label || obj.subType || obj.type;
          const coords = obj.coordinates.map(c => `(${c.x},${c.y})`).join(' → ');
          return `${label}: ${coords}`;
        }).join('\n');

        return {
          success: true,
          tool: processorId,
          rawText: textSummary,
          boundingBoxes,
          confidence: avgConfidence,
          processingTime,
          cost: detector.estimateCost(1),
          metadata: {
            pageCount: 1,
            avgConfidence,
            objectCount: result.objects.length,
            imageWidth: result.metadata.image_width,
            imageHeight: result.metadata.image_height,
            scale: result.metadata.scale,
            units: result.metadata.units,
            geometricData: result, // Include full geometric data for advanced use
          },
        };
      }

      // ==================== HYBRID PROCESSORS ====================

      case 'cloud-vision-gemini-hybrid': {
        // Check for Cloud Vision credentials
        const hasServiceAccount =
          apiKeys.cloudVisionServiceAccount && apiKeys.cloudVisionProjectId;
        const hasApiKey = apiKeys.googleCloudVision;

        if (!hasServiceAccount && !hasApiKey) {
          throw new Error(
            'Google Cloud Vision credentials not configured. ' +
            'Please provide either Service Account JSON + Project ID or API Key in Settings.'
          );
        }

        // Check for Gemini API key
        if (!apiKeys.googleGemini) {
          throw new Error(
            'Google Gemini API key not configured. ' +
            'Please provide Gemini API Key in Settings.'
          );
        }

        // Debug: Log Gemini API key status
        if (isDevelopment) console.log('[DEBUG] cloud-vision-gemini-hybrid - API key check:', {
          keyExists: !!apiKeys.googleGemini,
          keyLength: apiKeys.googleGemini?.length,
          keyType: typeof apiKeys.googleGemini,
          keyPreview: apiKeys.googleGemini?.substring(0, 15) + '...',
          allKeysPresent: Object.keys(apiKeys)
        });

        const processor = new CloudVisionGeminiHybridProcessor(
          {
            serviceAccountJson: apiKeys.cloudVisionServiceAccount,
            projectId: apiKeys.cloudVisionProjectId,
            apiKey: apiKeys.googleCloudVision,
          },
          apiKeys.googleGemini,
          0.85, // lowConfidenceThreshold
          {
            ...config.queueConfig,
            onRateLimitDetected: config.onRateLimitDetected,
            onProgress: config.onProgress,
          }
        );

        try {
          const result = await processor.processImage(filePath);
          return result;
        } finally {
          // Clean up temp credentials file
          processor.cleanup();
        }
      }

      case 'azure-read-gemini-hybrid': {
        // Check for Azure credentials
        if (!apiKeys.azureComputerVision || !apiKeys.azureEndpoint) {
          throw new Error(
            'Azure credentials not configured. ' +
            'Please provide Azure Cognitive Services Key and Endpoint in Settings.'
          );
        }

        // Check for Gemini API key
        if (!apiKeys.googleGemini) {
          throw new Error(
            'Google Gemini API key not configured. ' +
            'Please provide Gemini API Key in Settings.'
          );
        }

        const processor = new AzureReadGeminiHybridProcessor(
          apiKeys.azureEndpoint,
          apiKeys.azureComputerVision,
          apiKeys.googleGemini,
          0.85, // lowConfidenceThreshold
          {
            ...config.queueConfig,
            onRateLimitDetected: config.onRateLimitDetected,
            onProgress: config.onProgress,
          }
        );

        const result = await processor.processImage(filePath);
        return result;
      }

      case 'document-ai-gemini-hybrid': {
        // Check for Document AI credentials
        if (
          !apiKeys.documentAiProjectId ||
          !apiKeys.documentAiCredentials ||
          !apiKeys.documentAiProcessorId ||
          !apiKeys.documentAiLocation
        ) {
          throw new Error(
            'Document AI credentials not fully configured. ' +
            'Please provide Project ID, Service Account JSON, Processor ID, and Location in Settings.'
          );
        }

        // Check for Gemini API key
        if (!apiKeys.googleGemini) {
          throw new Error(
            'Google Gemini API key not configured. ' +
            'Please provide Gemini API Key in Settings.'
          );
        }

        const processor = new DocumentAIGeminiHybridProcessor(
          apiKeys.documentAiProjectId,
          apiKeys.documentAiCredentials,
          apiKeys.documentAiProcessorId,
          apiKeys.documentAiLocation,
          apiKeys.googleGemini,
          {
            ...config.queueConfig,
            onRateLimitDetected: config.onRateLimitDetected,
            onProgress: config.onProgress,
          }
        );

        const result = await processor.processImage(filePath);
        return result;
      }

      case 'gemini-self-calibrating': {
        // Check for Cloud Vision credentials
        const hasServiceAccount =
          apiKeys.cloudVisionServiceAccount && apiKeys.cloudVisionProjectId;
        const hasApiKey = apiKeys.googleCloudVision;

        if (!hasServiceAccount && !hasApiKey) {
          throw new Error(
            'Google Cloud Vision credentials not configured. ' +
            'Please provide either Service Account JSON + Project ID or API Key in Settings.'
          );
        }

        // Check for Gemini API key
        if (!apiKeys.googleGemini) {
          throw new Error(
            'Google Gemini API key not configured. ' +
            'Please provide Gemini API Key in Settings.'
          );
        }

        const processor = new GeminiSelfCalibratingProcessor(
          {
            serviceAccountJson: apiKeys.cloudVisionServiceAccount,
            projectId: apiKeys.cloudVisionProjectId,
            apiKey: apiKeys.googleCloudVision,
          },
          apiKeys.googleGemini
        );

        try {
          const result = await processor.processImage(filePath);
          return result;
        } finally {
          // Clean up temp credentials file
          processor.cleanup();
        }
      }

      // ==================== EXPERIMENTAL PROCESSORS (NOT YET IMPLEMENTED) ====================

      case 'hybrid':
      case 'gemini-coordinates':
      case 'gemini-bbox-synthesis':
      case 'gemini-validation-azure':
      case 'region-classifier':
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
    error: `Processor '${processorId}' is not yet fully implemented in this version. Currently available processors: cloud-vision, cloud-vision-gemini-hybrid, azure-read, azure-read-gemini-hybrid, azure-layout, document-ai, document-ai-gemini-hybrid, gemini-geometric, gemini-self-calibrating`,
  };
}

/**
 * Check if processor is implemented
 */
export function isProcessorImplemented(processorId: string): boolean {
  const implemented = [
    'cloud-vision',
    'cloud-vision-gemini-hybrid',
    'azure-read',
    'azure-read-gemini-hybrid',
    'azure-layout',
    'document-ai',
    'document-ai-gemini-hybrid',
    'gemini-geometric',
    'gemini-self-calibrating',
  ];
  return implemented.includes(processorId);
}

/**
 * Get list of implemented processors
 */
export function getImplementedProcessors(): string[] {
  return [
    'cloud-vision',
    'cloud-vision-gemini-hybrid',
    'azure-read',
    'azure-read-gemini-hybrid',
    'azure-layout',
    'document-ai',
    'document-ai-gemini-hybrid',
    'gemini-geometric',
    'gemini-self-calibrating',
  ];
}
