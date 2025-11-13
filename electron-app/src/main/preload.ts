import { contextBridge, ipcRenderer } from 'electron';

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
  processFloorPlan: (imagePath: string) => Promise<{
    success: boolean;
    revitJsonPath?: string;
    dynamoScript?: string;
    preview?: { walls: any[]; rooms: any[] };
    error?: string;
  }>;

  // File System
  selectFile: (filters?: { name: string; extensions: string[] }[]) => Promise<string | null>;
  selectFiles: (filters?: { name: string; extensions: string[] }[]) => Promise<string[] | null>;
  saveFile: (defaultPath: string, filters?: { name: string; extensions: string[] }[]) => Promise<string | null>;
  openPath: (path: string) => Promise<void>;

  // Progress Updates
  onProgress: (callback: (data: { step: string; progress: number; total: number }) => void) => () => void;
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
  processFloorPlan: (imagePath) => ipcRenderer.invoke('process-floor-plan', imagePath),

  // File System
  selectFile: (filters) => ipcRenderer.invoke('select-file', filters),
  selectFiles: (filters) => ipcRenderer.invoke('select-files', filters),
  saveFile: (defaultPath, filters) => ipcRenderer.invoke('save-file', defaultPath, filters),
  openPath: (path) => ipcRenderer.invoke('open-path', path),

  // Progress Updates
  onProgress: (callback) => {
    const subscription = (_event: any, data: any) => callback(data);
    ipcRenderer.on('progress-update', subscription);

    // Return cleanup function
    return () => {
      ipcRenderer.removeListener('progress-update', subscription);
    };
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
