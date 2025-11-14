import { ipcMain, dialog, shell, safeStorage } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.ocr-testing-tool');
const API_KEYS_FILE = path.join(CONFIG_DIR, 'api-keys.enc');

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
  console.log('OCR processing request:', params);

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

            // Run processor
            const result = await runProcessor(processorId, imagePaths[0], { apiKeys });

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
        const reportPath = await generateReport(results, groundTruth);

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
async function generateReport(results: any[], groundTruth?: string): Promise<string> {
  // Import report generator
  const { generateHTMLReport } = await import('./utils/report-generator');

  // Generate report
  const html = generateHTMLReport(results, groundTruth);

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
  console.log('Floor plan processing request:', params.imagePath);

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

console.log('IPC handlers registered');
