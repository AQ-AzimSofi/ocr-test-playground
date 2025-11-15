// External imports
import { ipcMain, dialog, shell, safeStorage } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.ocr-testing-tool');
const API_KEYS_FILE = path.join(CONFIG_DIR, 'api-keys.enc');

const isDevelopment = process.env.NODE_ENV !== 'production';

// Ensure config directory exists
async function ensureConfigDir() {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
  } catch (error) {
    console.error('Failed to create config directory:', error);
  }
}

// API Key Management
ipcMain.handle('get-api-keys', async () => {
  try {
    await ensureConfigDir();

    // Check if file exists
    try {
      await fs.access(API_KEYS_FILE);
    } catch {
      // File doesn't exist, return empty object
      return {};
    }

    const encryptedData = await fs.readFile(API_KEYS_FILE);

    if (!safeStorage.isEncryptionAvailable()) {
      console.warn('Encryption not available, using plain text storage');
      return JSON.parse(encryptedData.toString());
    }

    const decryptedData = safeStorage.decryptString(encryptedData);
    return JSON.parse(decryptedData);
  } catch (error) {
    console.error('Failed to read API keys:', error);
    return {};
  }
});

ipcMain.handle('save-api-keys', async (_event, keys: Record<string, string>) => {
  try {
    await ensureConfigDir();

    const jsonData = JSON.stringify(keys);

    if (!safeStorage.isEncryptionAvailable()) {
      console.warn('Encryption not available, using plain text storage');
      await fs.writeFile(API_KEYS_FILE, jsonData);
      return;
    }

    const encryptedData = safeStorage.encryptString(jsonData);
    await fs.writeFile(API_KEYS_FILE, encryptedData);
  } catch (error) {
    console.error('Failed to save API keys:', error);
    throw error;
  }
});

// OCR Processing
ipcMain.handle('process-ocr', async (event, params) => {
  if (isDevelopment) console.log('OCR processing request:', params);

  try {
    const { mode, processors, files, textInputs, groundTruth } = params;

    if (mode === 'pdf') {
      // Import required modules
      const { runProcessor } = await import('./processors/processor-factory');
      const { convertPdfToImages, cleanupTempImages, isPdf } = await import('./utils/pdf-converter');
      const { calculateAccuracy } = await import('./utils/accuracy');

      // Load API keys
      const apiKeys = await loadApiKeys();

      const results: any[] = [];
      let tempDirs: string[] = [];

      try {
        // Process each file
        for (const fileData of files || []) {
          const { path: filePath, groundTruth: fileGroundTruth } = fileData;

          // Convert PDF to images if needed
          let imagePaths: string[] = [filePath];

          if (isPdf(filePath)) {
            event.sender.send('progress-update', {
              step: 'Converting PDF to images',
              progress: 0,
              total: 1,
            });

            const conversion = await convertPdfToImages(filePath);
            imagePaths = conversion.imagePaths;
            tempDirs.push(conversion.tempDir);
          }

          // Process with each selected processor
          for (let i = 0; i < processors.length; i++) {
            const processorId = processors[i];

            event.sender.send('progress-update', {
              step: `Processing with ${processorId}`,
              progress: i + 1,
              total: processors.length,
            });

            // Run processor with rate limit handling
            const result = await runProcessor(processorId, imagePaths[0], {
              apiKeys,
              queueConfig: {
                concurrency: 2, // Default for free tier
                delayBetweenBatches: 2000, // 2 seconds
                maxRetries: 3,
                autoRetry: true,
              },
              onRateLimitDetected: async (error) => {
                const { RateLimitDecision } = await import('./utils/gemini-queue');
                const decision = await requestRateLimitDecision(event, error);

                switch (decision) {
                  case 'continue':
                    return RateLimitDecision.CONTINUE_SLOWER;
                  case 'skip':
                    return RateLimitDecision.SKIP_CURRENT;
                  case 'cancel':
                    return RateLimitDecision.CANCEL_ALL;
                  default:
                    return RateLimitDecision.CONTINUE_SLOWER;
                }
              },
              onProgress: (progress) => {
                event.sender.send('queue-progress-update', {
                  processorId,
                  ...progress,
                });
              },
            });

            // Calculate accuracy if ground truth provided
            let accuracy;
            if (fileGroundTruth && result.success) {
              accuracy = calculateAccuracy(result.rawText, fileGroundTruth);
            }

            results.push({
              processorId,
              filePath,
              ...result,
              accuracy,
            });
          }
        }

        // Generate HTML report
        // Get the image path from the first result
        const imagePath = results.length > 0 ? results[0].filePath : undefined;
        const reportPath = await generateReport(results, groundTruth, imagePath);

        return {
          success: true,
          reportPath,
          results,
        };
      } finally {
        // Cleanup temp files
        for (const tempDir of tempDirs) {
          await cleanupTempImages(tempDir);
        }
      }
    } else if (mode === 'text') {
      // Text comparison mode
      const { calculateAccuracy } = await import('./utils/accuracy');

      const results: any[] = [];

      for (const input of textInputs || []) {
        const { processor, text } = input;

        // Calculate accuracy
        const accuracy = calculateAccuracy(text, groundTruth || '');

        results.push({
          processorId: processor,
          rawText: text,
          accuracy,
          success: true,
          tool: processor,
          processingTime: 0,
          cost: 0,
        });
      }

      // Generate HTML report
      const reportPath = await generateReport(results, groundTruth);

      return {
        success: true,
        reportPath,
        results,
      };
    }

    return { success: false, error: 'Invalid mode' };
  } catch (error) {
    console.error('OCR processing failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

// Helper function to generate HTML report
async function generateReport(results: any[], groundTruth?: string, imagePath?: string): Promise<string> {
  // Import report generator
  const { generateHTMLReport } = await import('./utils/report-generator');

  // Generate report
  const html = generateHTMLReport(results, groundTruth, imagePath);

  // Save to temp file
  const tmpDir = os.tmpdir();
  const reportPath = path.join(tmpDir, `ocr-report-${Date.now()}.html`);

  await fs.writeFile(reportPath, html, 'utf-8');

  return reportPath;
}

// Helper to load API keys
async function loadApiKeys(): Promise<Record<string, string>> {
  try {
    await ensureConfigDir();

    // Check if file exists
    try {
      await fs.access(API_KEYS_FILE);
    } catch {
      return {};
    }

    const encryptedData = await fs.readFile(API_KEYS_FILE);

    if (!safeStorage.isEncryptionAvailable()) {
      return JSON.parse(encryptedData.toString());
    }

    const decryptedData = safeStorage.decryptString(encryptedData);
    return JSON.parse(decryptedData);
  } catch (error) {
    console.error('Failed to load API keys:', error);
    return {};
  }
}

// Floor Plan Processing
ipcMain.handle('process-floor-plan', async (event, params: { imagePath: string; apiKey: string }) => {
  if (isDevelopment) console.log('Floor plan processing request:', params.imagePath);

  try {
    const { imagePath, apiKey } = params;

    // Import floor plan modules
    const { GeminiGeometricDetector } = await import('./processors/gemini-geometric-processor');
    const { generateRevitOutput, saveRevitJSON } = await import('./utils/revit-generator');
    const { generateDynamoScript } = await import('./utils/dynamo-script-generator');

    // Send progress update
    event.sender.send('progress-update', {
      step: 'Analyzing floor plan with Gemini AI...',
      progress: 1,
      total: 3,
    });

    // Detect geometric objects
    const detector = new GeminiGeometricDetector(apiKey);
    const startTime = Date.now();
    const detection = await detector.detectGeometricObjects(imagePath);
    const processingTime = Date.now() - startTime;

    event.sender.send('progress-update', {
      step: 'Generating Revit JSON...',
      progress: 2,
      total: 3,
    });

    // Generate Revit output
    const fileName = path.basename(imagePath);
    const revitOutput = generateRevitOutput(detection, fileName);

    // Save outputs to temp directory
    const tmpDir = os.tmpdir();
    const baseFileName = fileName.replace(/\.[^/.]+$/, '');
    const timestamp = Date.now();

    const jsonPath = path.join(tmpDir, `${baseFileName}-revit-${timestamp}.json`);
    const scriptPath = path.join(tmpDir, `${baseFileName}-dynamo-${timestamp}.py`);

    // Save JSON
    saveRevitJSON(revitOutput, jsonPath);

    // Generate and save Dynamo script
    const dynamoScript = generateDynamoScript(jsonPath);
    await fs.writeFile(scriptPath, dynamoScript, 'utf-8');

    event.sender.send('progress-update', {
      step: 'Complete!',
      progress: 3,
      total: 3,
    });

    // Calculate cost
    const cost = detector.estimateCost(1);

    return {
      success: true,
      detection: {
        objectCount: detection.objects.length,
        walls: detection.objects.filter(o => o.type === 'wall').length,
        doors: detection.objects.filter(o => o.type === 'door').length,
        windows: detection.objects.filter(o => o.type === 'window').length,
        rooms: detection.objects.filter(o => o.type === 'room').length,
      },
      processingTime,
      cost,
      outputs: {
        jsonPath,
        scriptPath,
      },
      revitOutput,
    };
  } catch (error) {
    console.error('Floor plan processing failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

// Rate Limit Decision System
// Map to store pending rate limit decisions
const pendingRateLimitDecisions = new Map<string, {
  resolve: (decision: string) => void;
  reject: (error: Error) => void;
}>();

// Handle rate limit decisions from renderer
ipcMain.handle('rate-limit-decision', async (_event, { requestId, decision }: { requestId: string; decision: string }) => {
  if (isDevelopment) console.log('[IPC] Received rate-limit-decision:', { requestId, decision });
  const pending = pendingRateLimitDecisions.get(requestId);
  if (pending) {
    if (isDevelopment) console.log('[IPC] Resolving pending decision');
    pending.resolve(decision);
    pendingRateLimitDecisions.delete(requestId);
  } else {
    if (isDevelopment) console.log('[IPC] WARNING: No pending decision found for request ID:', requestId);
  }
});

// Helper function to request rate limit decision from user
async function requestRateLimitDecision(
  event: Electron.IpcMainInvokeEvent,
  error: any
): Promise<string> {
  if (isDevelopment) console.log('[IPC] requestRateLimitDecision called');
  if (isDevelopment) console.log('[IPC] Error:', {
    hasGetUserFriendlyMessage: !!error.getUserFriendlyMessage,
    retryDelay: error.retryDelay,
    quotaLimit: error.rateLimitInfo?.quotaLimit,
  });

  return new Promise((resolve, reject) => {
    const requestId = `rate-limit-${Date.now()}-${Math.random()}`;

    if (isDevelopment) console.log('[IPC] Created request ID:', requestId);

    // Store the promise resolvers
    pendingRateLimitDecisions.set(requestId, { resolve, reject });

    // Send event to renderer to show dialog
    const eventData = {
      requestId,
      error: {
        message: error.getUserFriendlyMessage ? error.getUserFriendlyMessage() : error.message,
        retryDelay: error.retryDelay || 60000,
        quotaLimit: error.rateLimitInfo?.quotaLimit,
      },
    };

    if (isDevelopment) console.log('[IPC] Sending rate-limit-detected event:', eventData);
    event.sender.send('rate-limit-detected', eventData);

    // Timeout after 5 minutes
    setTimeout(() => {
      if (pendingRateLimitDecisions.has(requestId)) {
        pendingRateLimitDecisions.delete(requestId);
        reject(new Error('Rate limit decision timeout'));
      }
    }, 300000);
  });
}

// File System Operations
ipcMain.handle('select-file', async (_event, filters) => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: filters || [{ name: 'All Files', extensions: ['*'] }],
  });

  if (result.canceled) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle('select-files', async (_event, filters) => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: filters || [{ name: 'All Files', extensions: ['*'] }],
  });

  if (result.canceled) {
    return null;
  }

  return result.filePaths;
});

ipcMain.handle('save-file', async (_event, defaultPath: string, filters) => {
  const result = await dialog.showSaveDialog({
    defaultPath,
    filters: filters || [{ name: 'All Files', extensions: ['*'] }],
  });

  if (result.canceled) {
    return null;
  }

  return result.filePath || null;
});

ipcMain.handle('open-path', async (_event, filePath: string) => {
  await shell.openPath(filePath);
});

ipcMain.handle('show-in-folder', async (_event, filePath: string) => {
  shell.showItemInFolder(filePath);
});

ipcMain.handle('read-file-as-base64', async (_event, filePath: string) => {
  try {
    const fileBuffer = await fs.readFile(filePath);
    const base64 = fileBuffer.toString('base64');

    // Detect MIME type from extension
    const ext = filePath.toLowerCase().split('.').pop();
    let mimeType = 'application/octet-stream';

    if (ext === 'png') mimeType = 'image/png';
    else if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';
    else if (ext === 'gif') mimeType = 'image/gif';
    else if (ext === 'webp') mimeType = 'image/webp';
    else if (ext === 'svg') mimeType = 'image/svg+xml';

    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    console.error('Failed to read file as base64:', error);
    throw error;
  }
});

ipcMain.handle('read-file-text', async (_event, filePath: string) => {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content;
  } catch (error) {
    console.error('Failed to read file as text:', error);
    throw error;
  }
});

if (isDevelopment) console.log('IPC handlers registered');
