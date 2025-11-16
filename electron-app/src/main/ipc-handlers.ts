// External imports
import { ipcMain, dialog, shell, safeStorage } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { getProcessorInfo } from '../shared/processor-info';
import { t } from './utils/i18n-main';
import { getPdfPageCount, isPdfFile, splitPdfIntoChunks, cleanupPdfChunks } from './utils/pdf-utils';

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
    const { mode, processors, files, textInputs, groundTruth, language = 'en' } = params;

    if (mode === 'pdf') {
      // Import required modules
      const { runProcessor } = await import('./processors/processor-factory');
      const { calculateAccuracy } = await import('./utils/accuracy');

      // Load API keys
      const apiKeys = await loadApiKeys();

      const results: any[] = [];

      try {
        // Process each file
        for (const fileData of files || []) {
          const { path: filePath, groundTruth: fileGroundTruth } = fileData;

          // Filter processors based on file type
          let compatibleProcessors = processors;
          let skippedProcessors: string[] = [];

          if (isPdfFile(filePath)) {
            // For PDF files, only use processors that support PDF natively
            compatibleProcessors = processors.filter(id => {
              const info = getProcessorInfo(id);
              return info?.supportsPdf === true;
            });

            // Track which processors were skipped
            skippedProcessors = processors.filter(id => {
              const info = getProcessorInfo(id);
              return info?.supportsPdf === false;
            });

            // Warn user if some processors were skipped
            if (skippedProcessors.length > 0) {
              console.log(`[PDF Processing] Skipping ${skippedProcessors.length} incompatible processors for PDF:`, skippedProcessors);
              event.sender.send('progress-update', {
                step: `Note: ${skippedProcessors.length} processor(s) skipped (PDF not supported): ${skippedProcessors.join(', ')}`,
                progress: 0,
                total: 1,
              });
            }

            // If no compatible processors, skip this file
            if (compatibleProcessors.length === 0) {
              console.log(`[PDF Processing] No compatible processors for PDF file: ${filePath}`);
              event.sender.send('progress-update', {
                step: `Skipping PDF file (no compatible processors)`,
                progress: 0,
                total: 1,
              });
              continue; // Skip to next file
            }
          }

          // Process with each compatible processor (no PDF conversion needed!)
          for (let i = 0; i < compatibleProcessors.length; i++) {
            const processorId = compatibleProcessors[i];

            event.sender.send('progress-update', {
              step: `Processing with ${processorId}`,
              progress: i + 1,
              total: compatibleProcessors.length,
            });

            // Run processor with rate limit handling (passing file path directly)
            const result = await runProcessor(processorId, filePath, {
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
        const reportPath = await generateReport(results, groundTruth, imagePath, language);

        return {
          success: true,
          reportPath,
          results,
        };
      } catch (error) {
        throw error;
      }
    } else if (mode === 'batch') {
      // Batch testing mode - process multiple files with multiple processors
      const { runProcessor } = await import('./processors/processor-factory');
      const { calculateAccuracy } = await import('./utils/accuracy');
      const { generateBatchHTMLReport } = await import('./utils/report-generator');

      // Load API keys
      const apiKeys = await loadApiKeys();

      // ===== PRE-VALIDATION: Scan PDFs and check page limits =====
      const validationSummary = {
        totalFiles: (files || []).length,
        pdfFiles: [] as Array<{ fileName: string; pageCount: number; filePath: string; sizeMB: number }>,
        filesToSplit: [] as Array<{ fileName: string; pageCount: number; processors: string[]; minPageLimit: number; sizeMB: number }>,
        normalFiles: [] as string[],
        errors: [] as Array<{ fileName: string; error: string }>,
        largeFiles: [] as Array<{ fileName: string; sizeMB: number }>,
      };

      event.sender.send('progress-update', {
        step: 'Validating PDF files...',
        progress: 0,
        total: 1,
      });

      // Scan all PDF files and check page counts
      for (const fileData of files || []) {
        const { path: filePath } = fileData;
        const fileName = path.basename(filePath);

        if (isPdfFile(filePath)) {
          try {
            const pageCount = await getPdfPageCount(filePath);

            // Get file size
            const stats = await import('fs/promises').then(fs => fs.stat(filePath));
            const sizeMB = Number((stats.size / 1024 / 1024).toFixed(2));

            validationSummary.pdfFiles.push({ fileName, pageCount, filePath, sizeMB });

            // Check if file is too large (>50MB warning threshold for Azure free tier)
            if (sizeMB > 50) {
              validationSummary.largeFiles.push({ fileName, sizeMB });
            }

            // Check if this file needs splitting for any processor
            const affectedProcessors: string[] = [];
            let minPageLimit = Infinity;

            for (const processorId of processors) {
              const processorInfo = getProcessorInfo(processorId);
              if (processorInfo?.supportsPdf && processorInfo.maxPages) {
                if (pageCount > processorInfo.maxPages) {
                  affectedProcessors.push(processorId);
                  minPageLimit = Math.min(minPageLimit, processorInfo.maxPages);
                }
              }
            }

            if (affectedProcessors.length > 0) {
              validationSummary.filesToSplit.push({
                fileName,
                pageCount,
                processors: affectedProcessors,
                minPageLimit,
                sizeMB,
              });
            } else {
              validationSummary.normalFiles.push(fileName);
            }
          } catch (error) {
            validationSummary.errors.push({
              fileName,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        } else {
          validationSummary.normalFiles.push(fileName);
        }
      }

      // If there are files to split, show confirmation dialog
      if (validationSummary.filesToSplit.length > 0 || validationSummary.errors.length > 0 || validationSummary.largeFiles.length > 0) {
        let message = `${t('preValidation.title', language)}:\n\n`;

        if (validationSummary.filesToSplit.length > 0) {
          message += `${t('preValidation.filesToSplit', language)}\n`;
          for (const file of validationSummary.filesToSplit) {
            const chunks = Math.ceil(file.pageCount / file.minPageLimit);
            message += `  • ${file.fileName} (${file.pageCount} ${t('preValidation.fileDetails.pages', language)}, ${file.sizeMB}MB → ${chunks} ${t('preValidation.fileDetails.chunks', language)})\n`;
            message += `    ${t('preValidation.fileDetails.affectedProcessors', language)} ${file.processors.join(', ')}\n`;
          }
          message += '\n';
        }

        if (validationSummary.largeFiles.length > 0) {
          message += `[!] Large files (>50MB - may cause Azure API errors):\n`;
          for (const file of validationSummary.largeFiles) {
            message += `  • ${file.fileName}: ${file.sizeMB}MB\n`;
          }
          message += '\n';
        }

        if (validationSummary.errors.length > 0) {
          message += `[!] ${t('preValidation.filesWithErrors', language)}\n`;
          for (const err of validationSummary.errors) {
            message += `  • ${err.fileName}: ${err.error}\n`;
          }
          message += '\n';
        }

        message += `\n${t('preValidation.summary.totalFiles', language, { count: validationSummary.totalFiles })}\n`;
        message += `${t('preValidation.summary.pdfFiles', language, { count: validationSummary.pdfFiles.length })}\n`;
        message += `${t('preValidation.summary.filesToSplit', language, { count: validationSummary.filesToSplit.length })}\n`;
        message += `${t('preValidation.summary.filesWithErrors', language, { count: validationSummary.errors.length })}\n`;
        message += `\n${t('preValidation.question', language)}`;

        const { BrowserWindow } = await import('electron');
        const mainWindow = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];

        const response = await dialog.showMessageBox(mainWindow!, {
          type: 'question',
          title: t('preValidation.title', language),
          message: message,
          buttons: [
            t('preValidation.buttons.continue', language),
            t('preValidation.buttons.cancel', language)
          ],
          defaultId: 0,
          cancelId: 1,
        });

        if (response.response === 1) {
          // User cancelled
          return {
            success: false,
            error: t('preValidation.cancelled', language),
          };
        }
      }
      // ===== END PRE-VALIDATION =====

      const fileResults: any[] = [];

      try {
        // Process each file
        for (let fileIndex = 0; fileIndex < (files || []).length; fileIndex++) {
          const fileData = files[fileIndex];
          const { path: filePath, groundTruth: fileGroundTruth } = fileData;
          const fileName = path.basename(filePath);

          event.sender.send('progress-update', {
            step: `Processing file ${fileIndex + 1}/${files.length}: ${fileName}`,
            progress: fileIndex,
            total: files.length,
          });

          // Wrap file processing in try-catch for file-level error handling
          let fileProcessingSuccess = false;
          let retryFile = true;

          while (retryFile && !fileProcessingSuccess) {
            retryFile = false; // Default to not retrying

            try {
              // Filter processors based on file type
              let compatibleProcessors = processors;
              let skippedProcessors: string[] = [];

              if (isPdfFile(filePath)) {
                // For PDF files, only use processors that support PDF natively
                compatibleProcessors = processors.filter(id => {
                  const info = getProcessorInfo(id);
                  return info?.supportsPdf === true;
                });

                // Track which processors were skipped
                skippedProcessors = processors.filter(id => {
                  const info = getProcessorInfo(id);
                  return info?.supportsPdf === false;
                });

                // Warn user if some processors were skipped
                if (skippedProcessors.length > 0) {
                  console.log(`[PDF Processing] Skipping ${skippedProcessors.length} incompatible processors for ${fileName}:`, skippedProcessors);
                  event.sender.send('progress-update', {
                    step: `${fileName}: ${skippedProcessors.length} processor(s) skipped (PDF not supported)`,
                    progress: fileIndex,
                    total: files.length,
                  });
                }

                // If no compatible processors, skip this file
                if (compatibleProcessors.length === 0) {
                  console.log(`[PDF Processing] No compatible processors for PDF file: ${fileName}`);
                  event.sender.send('progress-update', {
                    step: `Skipping ${fileName} (no compatible processors)`,
                    progress: fileIndex,
                    total: files.length,
                  });
                  fileProcessingSuccess = true; // Mark as "success" to move to next file
                  break; // Exit retry loop
                }
              }

          const processorResults: any[] = [];

          // Process with each compatible processor (with PDF splitting support!)
          for (let i = 0; i < compatibleProcessors.length; i++) {
            const processorId = compatibleProcessors[i];
            const processorInfo = getProcessorInfo(processorId);

            event.sender.send('progress-update', {
              step: `File ${fileIndex + 1}/${files.length} (${fileName}) - Processor ${i + 1}/${compatibleProcessors.length} (${processorId})`,
              progress: fileIndex * compatibleProcessors.length + i,
              total: files.length * compatibleProcessors.length,
            });

            try {
              // Check if PDF splitting is needed for this processor
              let needsSplitting = false;
              let pdfPageCount = 0;

              if (isPdfFile(filePath) && processorInfo?.maxPages) {
                pdfPageCount = await getPdfPageCount(filePath);
                needsSplitting = pdfPageCount > processorInfo.maxPages;
              }

              let combinedResult;

              if (needsSplitting && processorInfo?.maxPages) {
                // PDF needs splitting for this processor
                const chunks = await splitPdfIntoChunks(filePath, processorInfo.maxPages);
                console.log(`[PDF Splitting] File ${fileName} (${pdfPageCount} pages) split into ${chunks.length} chunks for ${processorId}`);

                event.sender.send('progress-update', {
                  step: `${fileName} - ${processorId}: Processing ${chunks.length} chunks...`,
                  progress: fileIndex * compatibleProcessors.length + i,
                  total: files.length * compatibleProcessors.length,
                });

                // Process each chunk
                const chunkResults: any[] = [];
                for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
                  const chunk = chunks[chunkIndex];

                  event.sender.send('progress-update', {
                    step: `${fileName} - ${processorId}: Chunk ${chunkIndex + 1}/${chunks.length}`,
                    progress: fileIndex * compatibleProcessors.length + i,
                    total: files.length * compatibleProcessors.length,
                  });

                  const chunkResult = await runProcessor(processorId, chunk.chunkPath, {
                    apiKeys,
                    queueConfig: {
                      concurrency: 2,
                      delayBetweenBatches: 2000,
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

                  chunkResults.push({
                    ...chunkResult,
                    chunkIndex,
                    pageRange: chunk.pageRange,
                  });

                  // Log detailed error information for failed chunks
                  if (!chunkResult.success) {
                    console.error(`[Chunk Failed] ${fileName} - ${processorId}`);
                    console.error(`  Chunk: ${chunkIndex + 1}/${chunks.length}`);
                    console.error(`  Pages: ${chunk.pageRange.start}-${chunk.pageRange.end}`);
                    console.error(`  Error: ${chunkResult.error || 'Unknown error'}`);
                  } else {
                    console.log(`[Chunk Success] ${fileName} - ${processorId} - Chunk ${chunkIndex + 1}/${chunks.length} (pages ${chunk.pageRange.start}-${chunk.pageRange.end})`);
                  }
                }

                // Clean up chunk files
                cleanupPdfChunks(chunks);

                // Combine results from all chunks
                const allChunksSuccessful = chunkResults.every(r => r.success);
                const combinedText = chunkResults
                  .filter(r => r.success)
                  .map(r => r.rawText || '')
                  .join('\n');
                const totalCost = chunkResults.reduce((sum, r) => sum + (r.cost || 0), 0);
                const totalTime = chunkResults.reduce((sum, r) => sum + (r.processingTime || 0), 0);

                combinedResult = {
                  processorId,
                  success: allChunksSuccessful,
                  rawText: combinedText,
                  cost: totalCost,
                  processingTime: totalTime,
                  chunked: true,
                  chunkCount: chunks.length,
                  chunkResults: chunkResults.map(r => ({
                    success: r.success,
                    pageRange: r.pageRange,
                    error: r.error,
                  })),
                };

                if (!allChunksSuccessful) {
                  const failedChunks = chunkResults.filter(r => !r.success);
                  combinedResult.error = `${failedChunks.length} of ${chunks.length} chunks failed`;
                }
              } else {
                // Normal processing (no splitting needed)
                combinedResult = await runProcessor(processorId, filePath, {
                  apiKeys,
                  queueConfig: {
                    concurrency: 2,
                    delayBetweenBatches: 2000,
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
              }

              // Calculate accuracy if ground truth provided (using combined result for both chunked and normal)
              let accuracy;
              if (fileGroundTruth && combinedResult.success) {
                accuracy = calculateAccuracy(combinedResult.rawText, fileGroundTruth);
              }

              processorResults.push({
                processorId,
                ...combinedResult,
                accuracy,
                extractedText: combinedResult.rawText || '',
              });
            } catch (error) {
              console.error(`Error processing ${fileName} with ${processorId}:`, error);
              processorResults.push({
                processorId,
                success: false,
                error: error instanceof Error ? error.message : String(error),
                extractedText: '',
              });
            }
          }

              // Prepare image paths for bounding box visualization
              // Note: PDFs don't support bbox visualization (empty array)
              // Only image files will show bounding boxes in the report
              let imagePaths: string[] = [];
              if (isPdfFile(filePath)) {
                // PDF files: skip bbox visualization (no conversion needed)
                imagePaths = [];
              } else {
                // Image files: use original file for bbox rendering
                imagePaths = [filePath];
              }

              fileResults.push({
                fileName,
                filePath,
                results: processorResults,
                groundTruth: fileGroundTruth || '',
                imagePaths, // Array of image paths (one per page for PDFs)
              });

              fileProcessingSuccess = true;
            } catch (fileError) {
              // File-level error (PDF conversion, file read, etc.)
              console.error(`File-level error processing ${fileName}:`, fileError);

              // Request decision from user
              const decision = await requestFileErrorDecision(
                event,
                fileName,
                filePath,
                fileError
              );

              switch (decision) {
                case 'skip':
                  // Skip this file and continue with next
                  console.log(`Skipping file: ${fileName}`);
                  fileProcessingSuccess = true; // Mark as "done" to exit retry loop
                  break;
                case 'retry':
                  // Retry this file
                  console.log(`Retrying file: ${fileName}`);
                  retryFile = true;
                  break;
                case 'cancel':
                  // Cancel entire batch
                  console.log('Cancelling entire batch');
                  throw new Error('Batch cancelled by user');
                default:
                  // Default to skip
                  fileProcessingSuccess = true;
              }
            }
          } // End of retry while loop
        } // End of file loop

        // Generate batch HTML report
        const html = generateBatchHTMLReport(fileResults, language);

        // Save to temp file
        const tmpDir = os.tmpdir();
        const reportPath = path.join(tmpDir, `ocr-batch-report-${Date.now()}.html`);
        await fs.writeFile(reportPath, html);

        return {
          success: true,
          reportPath,
          fileResults,
        };
      } catch (error) {
        throw error;
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
      const reportPath = await generateReport(results, groundTruth, undefined, language);

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
async function generateReport(results: any[], groundTruth?: string, imagePath?: string, language: string = 'en'): Promise<string> {
  // Import report generator
  const { generateHTMLReport } = await import('./utils/report-generator');

  // Generate report
  const html = generateHTMLReport(results, groundTruth, imagePath, language);

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

// Map to store pending file error decisions
const pendingFileErrorDecisions = new Map<string, {
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

// Handle file error decisions from renderer
ipcMain.handle('file-error-decision', async (_event, { requestId, decision }: { requestId: string; decision: string }) => {
  if (isDevelopment) console.log('[IPC] Received file-error-decision:', { requestId, decision });
  const pending = pendingFileErrorDecisions.get(requestId);
  if (pending) {
    if (isDevelopment) console.log('[IPC] Resolving pending decision');
    pending.resolve(decision);
    pendingFileErrorDecisions.delete(requestId);
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

// Helper function to request file error decision from user
async function requestFileErrorDecision(
  event: Electron.IpcMainInvokeEvent,
  fileName: string,
  filePath: string,
  error: any
): Promise<string> {
  if (isDevelopment) console.log('[IPC] requestFileErrorDecision called');
  if (isDevelopment) console.log('[IPC] File:', fileName, 'Error:', error);

  return new Promise((resolve, reject) => {
    const requestId = `file-error-${Date.now()}-${Math.random()}`;

    if (isDevelopment) console.log('[IPC] Created request ID:', requestId);

    // Store the promise resolvers
    pendingFileErrorDecisions.set(requestId, { resolve, reject });

    // Send event to renderer to show dialog
    const eventData = {
      requestId,
      fileName,
      filePath,
      error: error instanceof Error ? error.message : String(error),
    };

    if (isDevelopment) console.log('[IPC] Sending file-error event:', eventData);
    event.sender.send('file-error', eventData);

    // Timeout after 5 minutes
    setTimeout(() => {
      if (pendingFileErrorDecisions.has(requestId)) {
        pendingFileErrorDecisions.delete(requestId);
        reject(new Error('File error decision timeout'));
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

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  });

  if (result.canceled) {
    return null;
  }

  return result.filePaths[0];
});

// Helper function to recursively scan folder and build tree structure
async function scanFolderRecursive(folderPath: string, depth: number = 0): Promise<any[]> {
  const supportedExtensions = ['.pdf', '.png', '.jpg', '.jpeg'];
  const items: any[] = [];

  try {
    const entries = await fs.readdir(folderPath, { withFileTypes: true });

    for (const entry of entries) {
      const itemPath = path.join(folderPath, entry.name);

      if (entry.isDirectory()) {
        // It's a subfolder - recursively scan it
        const children = await scanFolderRecursive(itemPath, depth + 1);

        // Only include folders that have supported files (directly or in subfolders)
        if (children.length > 0) {
          items.push({
            type: 'folder',
            name: entry.name,
            path: itemPath,
            selected: true, // Default: selected
            expanded: depth < 2, // Auto-expand first 2 levels
            children,
          });
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();

        // Check if file is a supported format
        if (supportedExtensions.includes(ext)) {
          // Look for ground truth file with same name but .txt extension
          const baseName = path.basename(entry.name, ext);
          const groundTruthPath = path.join(folderPath, `${baseName}.txt`);

          let groundTruth = '';
          let groundTruthStatus: 'found' | 'missing' = 'missing';
          let foundGroundTruthPath: string | undefined;

          try {
            await fs.access(groundTruthPath);
            // Ground truth file exists, read it
            groundTruth = await fs.readFile(groundTruthPath, 'utf-8');
            groundTruthStatus = 'found';
            foundGroundTruthPath = groundTruthPath;
          } catch {
            // Ground truth file doesn't exist
            groundTruthStatus = 'missing';
          }

          // Get page count for PDF files
          let pageCount: number | undefined;
          if (ext === '.pdf') {
            try {
              pageCount = await getPdfPageCount(itemPath);
            } catch (error) {
              console.error(`Failed to get page count for ${entry.name}:`, error);
              pageCount = undefined;
            }
          }

          items.push({
            type: 'file',
            path: itemPath,
            name: entry.name,
            groundTruth,
            groundTruthStatus,
            groundTruthPath: foundGroundTruthPath,
            selected: true, // Default: selected
            pageCount, // Add page count for PDFs
          });
        }
      }
    }

    // Sort: folders first, then files, alphabetically within each group
    items.sort((a, b) => {
      if (a.type === 'folder' && b.type === 'file') return -1;
      if (a.type === 'file' && b.type === 'folder') return 1;
      return a.name.localeCompare(b.name);
    });

    return items;
  } catch (error) {
    console.error(`Failed to scan folder ${folderPath}:`, error);
    return [];
  }
}

ipcMain.handle('scan-folder', async (_event, folderPath: string) => {
  try {
    return await scanFolderRecursive(folderPath, 0);
  } catch (error) {
    console.error('Failed to scan folder:', error);
    throw error;
  }
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
