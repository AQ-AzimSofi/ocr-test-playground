const { contextBridge, ipcRenderer } = require('electron');

// Define the API shape
export interface ElectronAPI {
  // API Key Management
  getApiKeys: () => Promise<Record<string, string>>;
  saveApiKeys: (keys: Record<string, string>) => Promise<void>;

  // OCR Processing
  processOCR: (params: {
    mode: 'pdf' | 'text';
    processors: string[];
    files?: { path: string; groundTruth: string }[];
    textInputs?: { processor: string; text: string }[];
    groundTruth?: string;
  }) => Promise<{ success: boolean; reportPath?: string; error?: string }>;

  // Floor Plan Processing
  processFloorPlan: (params: { imagePath: string; apiKey: string }) => Promise<{
    success: boolean;
    detection?: {
      objectCount: number;
      walls: number;
      doors: number;
      windows: number;
      rooms: number;
    };
    processingTime?: number;
    cost?: number;
    outputs?: {
      jsonPath: string;
      scriptPath: string;
    };
    revitOutput?: any;
    error?: string;
  }>;

  // File System
  selectFile: (filters?: { name: string; extensions: string[] }[]) => Promise<string | null>;
  selectFiles: (filters?: { name: string; extensions: string[] }[]) => Promise<string[] | null>;
  saveFile: (defaultPath: string, filters?: { name: string; extensions: string[] }[]) => Promise<string | null>;
  openPath: (path: string) => Promise<void>;
  showInFolder: (path: string) => Promise<void>;
  readFileAsBase64: (path: string) => Promise<string>;
  readFileText: (path: string) => Promise<string>;

  // Progress Updates
  onProgress: (callback: (data: { step: string; progress: number; total: number }) => void) => () => void;

  // Rate Limit Events
  onRateLimitDetected: (callback: (data: {
    requestId: string;
    error: {
      message: string;
      retryDelay: number;
      quotaLimit?: number;
    };
  }) => void) => () => void;

  // Queue Progress Events
  onQueueProgressUpdate: (callback: (data: {
    processorId: string;
    total: number;
    completed: number;
    queued: number;
    processing: number;
    failed: number;
    status: string;
    estimatedTimeRemaining?: number;
  }) => void) => () => void;

  // Generic invoke for other IPC handlers
  invoke: (channel: string, ...args: any[]) => Promise<any>;
}

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
const electronAPI: ElectronAPI = {
  // API Key Management
  getApiKeys: () => ipcRenderer.invoke('get-api-keys'),
  saveApiKeys: (keys) => ipcRenderer.invoke('save-api-keys', keys),

  // OCR Processing
  processOCR: (params) => ipcRenderer.invoke('process-ocr', params),

  // Floor Plan Processing
  processFloorPlan: (params) => ipcRenderer.invoke('process-floor-plan', params),

  // File System
  selectFile: (filters) => ipcRenderer.invoke('select-file', filters),
  selectFiles: (filters) => ipcRenderer.invoke('select-files', filters),
  saveFile: (defaultPath, filters) => ipcRenderer.invoke('save-file', defaultPath, filters),
  openPath: (path) => ipcRenderer.invoke('open-path', path),
  showInFolder: (path) => ipcRenderer.invoke('show-in-folder', path),
  readFileAsBase64: (path) => ipcRenderer.invoke('read-file-as-base64', path),
  readFileText: (path) => ipcRenderer.invoke('read-file-text', path),

  // Progress Updates
  onProgress: (callback) => {
    const subscription = (_event: any, data: any) => callback(data);
    ipcRenderer.on('progress-update', subscription);

    // Return cleanup function
    return () => {
      ipcRenderer.removeListener('progress-update', subscription);
    };
  },

  // Rate Limit Events
  onRateLimitDetected: (callback) => {
    const subscription = (_event: any, data: any) => callback(data);
    ipcRenderer.on('rate-limit-detected', subscription);

    // Return cleanup function
    return () => {
      ipcRenderer.removeListener('rate-limit-detected', subscription);
    };
  },

  // Queue Progress Events
  onQueueProgressUpdate: (callback) => {
    const subscription = (_event: any, data: any) => callback(data);
    ipcRenderer.on('queue-progress-update', subscription);

    // Return cleanup function
    return () => {
      ipcRenderer.removeListener('queue-progress-update', subscription);
    };
  },

  // Generic invoke for other IPC handlers
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
