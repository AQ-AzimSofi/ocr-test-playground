import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getProcessorsByCategory, estimateCost, isProcessorAvailable } from '@shared/processor-info';
import type { ProcessorCategory } from '@shared/types';

interface BatchFile {
  type: 'file';
  path: string;
  name: string;
  groundTruth: string;
  groundTruthStatus: 'found' | 'missing' | 'manual' | 'skip';
  groundTruthPath?: string;
  pageCount?: number; // For PDF files
  selected: boolean;
}

interface BatchFolder {
  type: 'folder';
  name: string;
  path: string;
  selected: boolean;
  expanded: boolean;
  children: BatchItem[];
}

type BatchItem = BatchFile | BatchFolder;

// Tree Item Component for recursive rendering
interface TreeItemProps {
  item: BatchItem;
  depth: number;
  processing: boolean;
  onToggleExpand: (path: string) => void;
  onToggleSelection: (path: string) => void;
  onSelectGroundTruth: (path: string) => void;
  onSkip: (path: string) => void;
  onUnskip: (path: string) => void;
  onRemove: (path: string) => void;
  t: any;
}

function TreeItem({
  item,
  depth,
  processing,
  onToggleExpand,
  onToggleSelection,
  onSelectGroundTruth,
  onSkip,
  onUnskip,
  onRemove,
  t,
}: TreeItemProps) {
  const indentStyle = { paddingLeft: `${depth * 24}px` };

  if (item.type === 'folder') {
    const fileCount = countFilesInFolder(item);

    return (
      <>
        <div
          className="p-2 border rounded-lg border-gray-300 bg-gray-50 hover:bg-gray-100 cursor-pointer transition-colors"
          style={indentStyle}
          onClick={() => !processing && onToggleSelection(item.path)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-1">
              <input
                type="checkbox"
                checked={item.selected}
                onChange={() => {}}
                disabled={processing}
                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded disabled:opacity-50 pointer-events-none"
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleExpand(item.path);
                }}
                className="text-gray-600 hover:text-gray-900 focus:outline-none"
                disabled={processing}
              >
                {item.expanded ? '▼' : '▶'}
              </button>
              <span className="text-gray-900 font-medium text-sm flex items-center gap-1">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
                {item.name}
              </span>
              <span className="text-xs text-gray-500">({fileCount} files)</span>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove(item.path);
              }}
              disabled={processing}
              className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
              title="Remove folder"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>

        {item.expanded && item.children.map(child => (
          <TreeItem
            key={child.path}
            item={child}
            depth={depth + 1}
            processing={processing}
            onToggleExpand={onToggleExpand}
            onToggleSelection={onToggleSelection}
            onSelectGroundTruth={onSelectGroundTruth}
            onSkip={onSkip}
            onUnskip={onUnskip}
            onRemove={onRemove}
            t={t}
          />
        ))}
      </>
    );
  }

  // File rendering
  return (
    <div
      className={`p-3 border rounded-lg cursor-pointer transition-colors ${
        item.groundTruthStatus === 'skip'
          ? 'border-gray-300 bg-gray-50 hover:bg-gray-100'
          : item.groundTruthStatus === 'found' || item.groundTruthStatus === 'manual'
          ? 'border-green-300 bg-green-50 hover:bg-green-100'
          : 'border-yellow-300 bg-yellow-50 hover:bg-yellow-100'
      }`}
      style={indentStyle}
      onClick={() => !processing && onToggleSelection(item.path)}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <input
            type="checkbox"
            checked={item.selected}
            onChange={() => {}}
            disabled={processing}
            className="mt-1 h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded disabled:opacity-50 pointer-events-none"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {item.groundTruthStatus === 'found' && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-600">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              )}
              {item.groundTruthStatus === 'manual' && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-600">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
              )}
              {item.groundTruthStatus === 'missing' && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-yellow-600">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                  <line x1="12" y1="9" x2="12" y2="13"></line>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
              )}
              {item.groundTruthStatus === 'skip' && (
                <span className="text-gray-400 text-sm">⊘</span>
              )}
              <span className="font-medium text-gray-900 text-sm truncate">{item.name}</span>
              {item.pageCount !== undefined && item.pageCount > 0 && (
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                  {item.pageCount} {item.pageCount === 1 ? 'page' : 'pages'}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 truncate">{item.path}</p>
            {item.groundTruthStatus === 'found' && (
              <p className="text-xs text-green-700 mt-1">{t('fileList.groundTruthFound')}</p>
            )}
            {item.groundTruthStatus === 'manual' && item.groundTruthPath && (
              <p className="text-xs text-blue-700 mt-1">
                {t('fileList.groundTruthManual')}: {item.groundTruthPath.split(/[\\/]/).pop()}
              </p>
            )}
            {item.groundTruthStatus === 'missing' && (
              <p className="text-xs text-yellow-700 mt-1">{t('fileList.groundTruthMissing')}</p>
            )}
            {item.groundTruthStatus === 'skip' && (
              <p className="text-xs text-gray-500 mt-1">{t('fileList.fileSkipped')}</p>
            )}
          </div>
        </div>
        <div className="flex gap-1 ml-3">
          {item.groundTruthStatus === 'missing' && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectGroundTruth(item.path);
                }}
                disabled={processing}
                className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                title={t('fileList.selectGroundTruth')}
              >
                {t('fileList.select')}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSkip(item.path);
                }}
                disabled={processing}
                className="px-2 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50"
                title={t('fileList.skipFile')}
              >
                {t('fileList.skip')}
              </button>
            </>
          )}
          {item.groundTruthStatus === 'skip' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onUnskip(item.path);
              }}
              disabled={processing}
              className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
              title={t('fileList.unskipFile')}
            >
              {t('fileList.unskip')}
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove(item.path);
            }}
            disabled={processing}
            className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
            title={t('fileList.removeFile')}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// Helper to count files in a folder
function countFilesInFolder(folder: BatchFolder): number {
  let count = 0;
  for (const child of folder.children) {
    if (child.type === 'file') {
      count++;
    } else {
      count += countFilesInFolder(child);
    }
  }
  return count;
}

export default function BatchTest() {
  const { t, i18n } = useTranslation('batchTest');
  const [selectedProcessors, setSelectedProcessors] = useState<Set<string>>(new Set());
  const [folderPath, setFolderPath] = useState<string | null>(null);
  const [items, setItems] = useState<BatchItem[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ step: '', progress: 0, total: 0 });
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [activeCategory, setActiveCategory] = useState<ProcessorCategory>('confidential-safe');
  const [rateLimitDialog, setRateLimitDialog] = useState<{
    show: boolean;
    requestId: string;
    message: string;
    retryDelay: number;
    quotaLimit?: number;
  } | null>(null);
  const [queueProgress, setQueueProgress] = useState<{
    total: number;
    completed: number;
    queued: number;
    processing: number;
    status: string;
  } | null>(null);
  const [fileErrorDialog, setFileErrorDialog] = useState<{
    show: boolean;
    fileName: string;
    error: string;
    requestId: string;
  } | null>(null);

  // Load API keys on mount and when window regains focus
  useEffect(() => {
    loadApiKeys();

    // Reload keys when window regains focus (e.g., after going to Settings)
    const handleFocus = () => {
      loadApiKeys();
    };

    window.addEventListener('focus', handleFocus);

    // Listen for progress updates
    const cleanup = window.electronAPI.onProgress((data) => {
      setProgress(data);
    });

    // Listen for rate limit detection
    const handleRateLimitDetected = (data: any) => {
      console.log('[BatchTest] Rate limit event received:', data);
      setRateLimitDialog({
        show: true,
        requestId: data.requestId,
        message: data.error.message,
        retryDelay: data.error.retryDelay,
        quotaLimit: data.error.quotaLimit,
      });
    };

    // Listen for queue progress updates
    const handleQueueProgress = (data: any) => {
      console.log('[BatchTest] Queue progress update:', data);
      setQueueProgress(data);
    };

    // Listen for file processing errors
    const handleFileError = (data: any) => {
      console.log('[BatchTest] File error event received:', data);
      setFileErrorDialog({
        show: true,
        fileName: data.fileName,
        error: data.error,
        requestId: data.requestId,
      });
    };

    console.log('[BatchTest] Registering event listeners');
    const cleanupRateLimit = window.electronAPI.onRateLimitDetected(handleRateLimitDetected);
    const cleanupQueueProgress = window.electronAPI.onQueueProgressUpdate(handleQueueProgress);
    const cleanupFileError = window.electronAPI.onFileError(handleFileError);
    console.log('[BatchTest] Event listeners registered successfully');

    return () => {
      window.removeEventListener('focus', handleFocus);
      cleanup();
      cleanupRateLimit();
      cleanupQueueProgress();
      cleanupFileError();
    };
  }, []);

  const loadApiKeys = async () => {
    const keys = await window.electronAPI.getApiKeys();
    setApiKeys(keys);
  };

  // Helper: Recursively flatten tree to get all selected files
  const flattenSelectedFiles = (items: BatchItem[]): BatchFile[] => {
    const files: BatchFile[] = [];

    for (const item of items) {
      if (item.type === 'file') {
        if (item.selected && item.groundTruthStatus !== 'skip') {
          files.push(item);
        }
      } else if (item.type === 'folder') {
        files.push(...flattenSelectedFiles(item.children));
      }
    }

    return files;
  };

  // Helper: Count files recursively
  const countFiles = (items: BatchItem[], filter?: (file: BatchFile) => boolean): number => {
    let count = 0;

    for (const item of items) {
      if (item.type === 'file') {
        if (!filter || filter(item)) {
          count++;
        }
      } else if (item.type === 'folder') {
        count += countFiles(item.children, filter);
      }
    }

    return count;
  };

  // Helper: Update item in tree by path
  const updateItemByPath = (items: BatchItem[], targetPath: string, updater: (item: BatchItem) => BatchItem): BatchItem[] => {
    return items.map(item => {
      if (item.path === targetPath) {
        return updater(item);
      } else if (item.type === 'folder') {
        return {
          ...item,
          children: updateItemByPath(item.children, targetPath, updater),
        };
      }
      return item;
    });
  };

  // Helper: Toggle folder expansion
  const toggleFolderExpansion = (folderPath: string) => {
    setItems(prevItems =>
      updateItemByPath(prevItems, folderPath, item => {
        if (item.type === 'folder') {
          return { ...item, expanded: !item.expanded };
        }
        return item;
      })
    );
  };

  // Helper: Recursively update selection state
  const updateSelectionRecursive = (item: BatchItem, selected: boolean): BatchItem => {
    if (item.type === 'file') {
      return { ...item, selected };
    } else {
      return {
        ...item,
        selected,
        children: item.children.map(child => updateSelectionRecursive(child, selected)),
      };
    }
  };

  // Helper: Toggle item selection
  const toggleItemSelection = (itemPath: string) => {
    setItems(prevItems =>
      updateItemByPath(prevItems, itemPath, item => {
        const newSelected = !item.selected;
        return updateSelectionRecursive(item, newSelected);
      })
    );
  };

  // Helper: Select all items in tree
  const handleSelectAllFiles = () => {
    const selectAllRecursive = (items: BatchItem[]): BatchItem[] => {
      return items.map(item => updateSelectionRecursive(item, true));
    };
    setItems(prevItems => selectAllRecursive(prevItems));
  };

  // Helper: Deselect all items in tree
  const handleDeselectAllFiles = () => {
    const deselectAllRecursive = (items: BatchItem[]): BatchItem[] => {
      return items.map(item => updateSelectionRecursive(item, false));
    };
    setItems(prevItems => deselectAllRecursive(prevItems));
  };

  const handleSelectFolder = async () => {
    const folderPath = await window.electronAPI.selectFolder();

    if (folderPath) {
      setFolderPath(folderPath);
      // Scan folder for PDF/PNG files (now returns hierarchical structure)
      const scannedItems = await window.electronAPI.scanFolder(folderPath);
      setItems(scannedItems);
    }
  };

  const handleSelectGroundTruth = async (filePath: string) => {
    const gtFilePath = await window.electronAPI.selectFile([
      { name: 'Text Files', extensions: ['txt'] },
    ]);

    if (gtFilePath) {
      const groundTruthText = await window.electronAPI.readFileText(gtFilePath);
      setItems(prevItems =>
        updateItemByPath(prevItems, filePath, item => {
          if (item.type === 'file') {
            return {
              ...item,
              groundTruth: groundTruthText,
              groundTruthStatus: 'manual' as const,
              groundTruthPath: gtFilePath,
            };
          }
          return item;
        })
      );
    }
  };

  const handleSkipFile = (filePath: string) => {
    setItems(prevItems =>
      updateItemByPath(prevItems, filePath, item => {
        if (item.type === 'file') {
          return { ...item, groundTruthStatus: 'skip' as const };
        }
        return item;
      })
    );
  };

  const handleUnskipFile = (filePath: string) => {
    setItems(prevItems =>
      updateItemByPath(prevItems, filePath, item => {
        if (item.type === 'file') {
          return { ...item, groundTruthStatus: 'missing' as const };
        }
        return item;
      })
    );
  };

  const handleRemoveItem = (itemPath: string) => {
    const removeFromTree = (items: BatchItem[]): BatchItem[] => {
      return items
        .filter(item => item.path !== itemPath)
        .map(item => {
          if (item.type === 'folder') {
            return {
              ...item,
              children: removeFromTree(item.children),
            };
          }
          return item;
        });
    };

    setItems(prevItems => removeFromTree(prevItems));
  };

  const handleRateLimitDecision = async (decision: 'continue' | 'skip' | 'cancel') => {
    console.log('[BatchTest] User selected decision:', decision);
    if (!rateLimitDialog) {
      console.log('[BatchTest] WARNING: No rate limit dialog state');
      return;
    }

    try {
      console.log('[BatchTest] Sending decision to main process:', {
        requestId: rateLimitDialog.requestId,
        decision,
      });
      await window.electronAPI.invoke('rate-limit-decision', {
        requestId: rateLimitDialog.requestId,
        decision,
      });
      console.log('[BatchTest] Decision sent successfully, closing dialog');
      setRateLimitDialog(null);
    } catch (error) {
      console.error('[BatchTest] Failed to send rate limit decision:', error);
    }
  };

  const handleFileErrorDecision = async (decision: 'skip' | 'retry' | 'cancel') => {
    console.log('[BatchTest] User selected file error decision:', decision);
    if (!fileErrorDialog) {
      console.log('[BatchTest] WARNING: No file error dialog state');
      return;
    }

    try {
      console.log('[BatchTest] Sending file error decision to main process:', {
        requestId: fileErrorDialog.requestId,
        decision,
      });
      await window.electronAPI.invoke('file-error-decision', {
        requestId: fileErrorDialog.requestId,
        decision,
      });
      console.log('[BatchTest] Decision sent successfully, closing dialog');
      setFileErrorDialog(null);
    } catch (error) {
      console.error('[BatchTest] Failed to send file error decision:', error);
    }
  };

  const handleProcessorToggle = (processorId: string) => {
    const newSet = new Set(selectedProcessors);
    if (newSet.has(processorId)) {
      newSet.delete(processorId);
    } else {
      newSet.add(processorId);
    }
    setSelectedProcessors(newSet);
  };

  const handleSelectAll = () => {
    const allCategories: ProcessorCategory[] = ['confidential-safe', 'hybrids', 'experimental'];
    const allAvailableIds: string[] = [];

    allCategories.forEach(category => {
      const processors = getProcessorsByCategory(category);
      const availableIds = processors
        .filter(p => isProcessorAvailable(p.id, apiKeys))
        .map(p => p.id);
      allAvailableIds.push(...availableIds);
    });

    setSelectedProcessors(new Set(allAvailableIds));
  };

  const handleDeselectAll = () => {
    setSelectedProcessors(new Set());
  };

  const handleSelectInTab = () => {
    const categoryProcessors = getProcessorsByCategory(activeCategory);
    const availableIds = categoryProcessors
      .filter(p => isProcessorAvailable(p.id, apiKeys))
      .map(p => p.id);

    const newSet = new Set(selectedProcessors);
    availableIds.forEach(id => newSet.add(id));
    setSelectedProcessors(newSet);
  };

  const handleDeselectInTab = () => {
    const categoryProcessors = getProcessorsByCategory(activeCategory);
    const categoryIds = categoryProcessors.map(p => p.id);

    const newSet = new Set(selectedProcessors);
    categoryIds.forEach(id => newSet.delete(id));
    setSelectedProcessors(newSet);
  };

  const handleRunTest = async () => {
    // Flatten the tree to get all selected files
    const filesToProcess = flattenSelectedFiles(items);

    if (filesToProcess.length === 0) {
      alert(t('errors.noFilesToProcess'));
      return;
    }

    if (selectedProcessors.size === 0) {
      alert(t('errors.noProcessorsSelected'));
      return;
    }

    // Check if any files are missing ground truth
    const missingGroundTruth = filesToProcess.filter(f =>
      f.groundTruthStatus === 'missing' || !f.groundTruth.trim()
    );

    if (missingGroundTruth.length > 0) {
      const fileNames = missingGroundTruth.map(f => f.name).join(', ');
      const confirm = window.confirm(
        t('errors.missingGroundTruth', { files: fileNames })
      );
      if (!confirm) return;
    }

    setProcessing(true);
    setProgress({ step: 'Starting batch test...', progress: 0, total: 1 });

    try {
      const result = await window.electronAPI.processOCR({
        mode: 'batch',
        processors: Array.from(selectedProcessors),
        files: filesToProcess.map(f => ({
          path: f.path,
          groundTruth: f.groundTruth,
        })),
        language: i18n.language,
      });

      if (result.success && result.reportPath) {
        alert(t('success.testCompleted', { path: result.reportPath }));

        // Open the report
        await window.electronAPI.openPath(result.reportPath);
      } else {
        alert(t('errors.testFailed', { error: result.error }));
      }
    } catch (error: any) {
      alert(t('errors.generalError', { message: error.message }));
    } finally {
      setProcessing(false);
      setProgress({ step: '', progress: 0, total: 0 });
    }
  };

  // Calculate stats from tree
  const allFiles = flattenSelectedFiles(items); // Only selected files
  const totalFiles = countFiles(items); // All files
  const filesReady = countFiles(items, f => (f.groundTruthStatus === 'found' || f.groundTruthStatus === 'manual') && f.selected);
  const filesMissing = countFiles(items, f => f.groundTruthStatus === 'missing' && f.selected);
  const filesSkipped = countFiles(items, f => f.groundTruthStatus === 'skip');

  const costEstimate = estimateCost(Array.from(selectedProcessors), allFiles.length);
  const categoryProcessors = getProcessorsByCategory(activeCategory);

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="bg-white shadow sm:rounded-lg p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">{t('title')}</h2>
        <p className="text-gray-600 mb-6">
          {t('description')}
        </p>

        {/* Folder Selection Section */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">{t('folder.heading')}</h3>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSelectFolder}
              disabled={processing}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('folder.selectButton')}
            </button>
            {folderPath && (
              <span className="text-sm text-gray-600">
                {t('folder.selected')} <span className="font-medium">{folderPath.split(/[\\/]/).pop()}</span>
              </span>
            )}
          </div>
        </div>

        {/* File/Folder Tree Section */}
        {items.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-gray-900">{t('fileList.heading')}</h3>
              <div className="flex items-center gap-3">
                <div className="flex gap-2">
                  <button
                    onClick={handleSelectAllFiles}
                    disabled={processing}
                    className="text-sm px-3 py-1 text-indigo-600 hover:bg-indigo-50 rounded-md disabled:opacity-50"
                  >
                    Select All
                  </button>
                  <button
                    onClick={handleDeselectAllFiles}
                    disabled={processing}
                    className="text-sm px-3 py-1 text-gray-600 hover:bg-gray-50 rounded-md disabled:opacity-50"
                  >
                    Deselect All
                  </button>
                </div>
                <div className="text-xs text-gray-600">
                  {t('fileList.stats', {
                    total: totalFiles,
                    ready: filesReady,
                    missing: filesMissing,
                    skipped: filesSkipped
                  })}
                </div>
              </div>
            </div>

            <div className="space-y-1 max-h-96 overflow-y-auto border border-gray-200 rounded-lg p-3">
              {items.map((item, index) => (
                <TreeItem
                  key={item.path}
                  item={item}
                  depth={0}
                  processing={processing}
                  onToggleExpand={toggleFolderExpansion}
                  onToggleSelection={toggleItemSelection}
                  onSelectGroundTruth={handleSelectGroundTruth}
                  onSkip={handleSkipFile}
                  onUnskip={handleUnskipFile}
                  onRemove={handleRemoveItem}
                  t={t}
                />
              ))}
            </div>
          </div>
        )}

        {/* Processor Selection */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-gray-900">{t('processors.heading')}</h3>
            <div className="flex gap-2">
              <button
                onClick={handleSelectAll}
                disabled={processing}
                className="text-sm px-3 py-1 text-indigo-600 hover:bg-indigo-50 rounded-md disabled:opacity-50"
              >
                {t('processors.selectAll')}
              </button>
              <button
                onClick={handleDeselectAll}
                disabled={processing}
                className="text-sm px-3 py-1 text-gray-600 hover:bg-gray-50 rounded-md disabled:opacity-50"
              >
                {t('processors.deselectAll')}
              </button>
            </div>
          </div>

          {/* Category Tabs */}
          <div className="flex gap-2 mb-4 border-b border-gray-200">
            <button
              onClick={() => setActiveCategory('confidential-safe')}
              className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
                activeCategory === 'confidential-safe'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t('processors.tabs.confidentialSafe')}
            </button>
            <button
              onClick={() => setActiveCategory('hybrids')}
              className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
                activeCategory === 'hybrids'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t('processors.tabs.hybrids')}
            </button>
            <button
              onClick={() => setActiveCategory('experimental')}
              className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
                activeCategory === 'experimental'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t('processors.tabs.experimental')}
            </button>
          </div>

          {/* Tab-level Selection Buttons */}
          <div className="flex gap-2 mb-3">
            <button
              onClick={handleSelectInTab}
              disabled={processing}
              className="text-xs px-3 py-1.5 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-md disabled:opacity-50 disabled:cursor-not-allowed border border-indigo-200"
            >
              {t('processors.selectInTab')}
            </button>
            <button
              onClick={handleDeselectInTab}
              disabled={processing}
              className="text-xs px-3 py-1.5 text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-md disabled:opacity-50 disabled:cursor-not-allowed border border-gray-200"
            >
              {t('processors.deselectInTab')}
            </button>
          </div>

          {/* Processor List */}
          <div className="space-y-2">
            {categoryProcessors.map((processor) => {
              const available = isProcessorAvailable(processor.id, apiKeys);
              const selected = selectedProcessors.has(processor.id);

              return (
                <div
                  key={processor.id}
                  className={`p-4 border rounded-lg ${
                    selected
                      ? 'border-indigo-500 bg-indigo-50'
                      : available
                      ? 'border-gray-200 hover:border-gray-300'
                      : 'border-gray-200 bg-gray-50'
                  } ${available ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
                  onClick={() => available && !processing && handleProcessorToggle(processor.id)}
                >
                  <div className="flex items-start">
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={!available || processing}
                      onChange={() => {}}
                      className="mt-1 mr-3 h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded disabled:opacity-50"
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium text-gray-900">{t(`processors:${processor.id}.name`)}</h4>
                        <span className="text-xs text-gray-500">{t(`processors:${processor.id}.cost`)}</span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">{t(`processors:${processor.id}.description`)}</p>
                      {!available && (
                        <p className="text-xs text-red-600 mt-1">
                          {processor.requiresApiKeys.includes('googleCloudVision')
                            ? t('processors.missingAuth')
                            : t('processors.missingApiKey', { keys: processor.requiresApiKeys.filter(k => !apiKeys[k]).join(', ') })
                          }
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Cost Estimate */}
        {selectedProcessors.size > 0 && allFiles.length > 0 && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-md">
            <h4 className="font-medium text-blue-900 mb-1">{t('costEstimate.heading')}</h4>
            <p className="text-sm text-blue-700">
              {t('costEstimate.batchInfo', {
                processors: selectedProcessors.size,
                files: allFiles.length,
                total: selectedProcessors.size * allFiles.length
              })}
            </p>
            <p className="text-sm text-blue-700">
              {costEstimate.min === costEstimate.max
                ? t('costEstimate.exact', { cost: costEstimate.min.toFixed(2) })
                : t('costEstimate.range', {
                    min: costEstimate.min.toFixed(2),
                    max: costEstimate.max.toFixed(2)
                  })
              }
            </p>
          </div>
        )}

        {/* Progress */}
        {processing && (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
            <h4 className="font-medium text-yellow-900 mb-2">{t('progress.heading')}</h4>
            <p className="text-sm text-yellow-700 mb-2">{progress.step}</p>
            {progress.total > 0 && (
              <div className="w-full bg-yellow-200 rounded-full h-2">
                <div
                  className="bg-yellow-600 h-2 rounded-full transition-all"
                  style={{ width: `${(progress.progress / progress.total) * 100}%` }}
                />
              </div>
            )}
          </div>
        )}

        {/* Run Button */}
        <button
          onClick={handleRunTest}
          disabled={processing || allFiles.length === 0 || selectedProcessors.size === 0}
          className="w-full px-6 py-3 bg-indigo-600 text-white font-medium rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {processing ? t('buttons.processing') : t('buttons.runTest')}
        </button>

        {/* Info */}
        <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-md">
          <h4 className="font-medium text-gray-900 mb-2">{t('howItWorks.title')}</h4>
          <ol className="text-sm text-gray-600 list-decimal list-inside space-y-1">
            <li>{t('howItWorks.step1')}</li>
            <li>{t('howItWorks.step2')}</li>
            <li>{t('howItWorks.step3')}</li>
            <li>{t('howItWorks.step4')}</li>
            <li>{t('howItWorks.step5')}</li>
          </ol>
        </div>

        {/* Queue Progress */}
        {queueProgress && queueProgress.total > 0 && (
          <div className="mt-6 p-4 bg-purple-50 border border-purple-200 rounded-md">
            <h4 className="font-medium text-purple-900 mb-2">{t('queueProgress.heading')}</h4>
            <p className="text-sm text-purple-700 mb-2">{queueProgress.status}</p>
            <div className="text-xs text-purple-600">
              {t('queueProgress.details', {
                completed: queueProgress.completed,
                total: queueProgress.total,
                processing: queueProgress.processing,
                queued: queueProgress.queued
              })}
            </div>
          </div>
        )}
      </div>

      {/* Rate Limit Dialog Modal */}
      {rateLimitDialog?.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <div className="mb-4">
              <div className="flex items-center mb-2">
                <svg className="w-6 h-6 text-yellow-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <h3 className="text-lg font-semibold text-gray-900">
                  {t('rateLimit.title')}
                </h3>
              </div>
              <p className="text-sm text-gray-600 mb-3">
                {rateLimitDialog.message}
              </p>
              {rateLimitDialog.quotaLimit && (
                <p className="text-xs text-gray-500 bg-gray-50 p-2 rounded mb-3">
                  {t('rateLimit.freeTierLimit', { limit: rateLimitDialog.quotaLimit })}
                </p>
              )}
              <p className="text-sm text-gray-700 mb-4">
                <strong>{t('rateLimit.question')}</strong>
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => handleRateLimitDecision('continue')}
                className="w-full px-4 py-3 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 transition-colors text-left"
              >
                <div className="font-semibold">{t('rateLimit.continueSlower')}</div>
                <div className="text-xs text-blue-100 mt-1">
                  {t('rateLimit.continueSlowerDesc')}
                </div>
              </button>

              <button
                onClick={() => handleRateLimitDecision('skip')}
                className="w-full px-4 py-3 bg-gray-600 text-white font-medium rounded-md hover:bg-gray-700 transition-colors text-left"
              >
                <div className="font-semibold">{t('rateLimit.skipTest')}</div>
                <div className="text-xs text-gray-100 mt-1">
                  {t('rateLimit.skipTestDesc')}
                </div>
              </button>

              <button
                onClick={() => handleRateLimitDecision('cancel')}
                className="w-full px-4 py-3 bg-red-600 text-white font-medium rounded-md hover:bg-red-700 transition-colors text-left"
              >
                <div className="font-semibold">{t('rateLimit.cancelAll')}</div>
                <div className="text-xs text-red-100 mt-1">
                  {t('rateLimit.cancelAllDesc')}
                </div>
              </button>
            </div>

            <p className="text-xs text-gray-500 mt-4 text-center">
              {t('rateLimit.suggestedWait', { seconds: (rateLimitDialog.retryDelay / 1000).toFixed(1) })}
            </p>
          </div>
        </div>
      )}

      {/* File Error Dialog Modal */}
      {fileErrorDialog?.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <div className="mb-4">
              <div className="flex items-center mb-2">
                <svg className="w-6 h-6 text-red-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h3 className="text-lg font-semibold text-gray-900">
                  {t('fileError.title')}
                </h3>
              </div>
              <p className="text-sm text-gray-600 mb-3">
                {t('fileError.message', { fileName: fileErrorDialog.fileName })}
              </p>
              <p className="text-xs text-gray-500 bg-gray-50 p-2 rounded mb-3 font-mono">
                {fileErrorDialog.error}
              </p>
              <p className="text-sm text-gray-700 mb-4">
                <strong>{t('fileError.question')}</strong>
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => handleFileErrorDecision('skip')}
                className="w-full px-4 py-3 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 transition-colors text-left"
              >
                <div className="font-semibold">{t('fileError.skipFile')}</div>
                <div className="text-xs text-blue-100 mt-1">
                  {t('fileError.skipFileDesc')}
                </div>
              </button>

              <button
                onClick={() => handleFileErrorDecision('retry')}
                className="w-full px-4 py-3 bg-gray-600 text-white font-medium rounded-md hover:bg-gray-700 transition-colors text-left"
              >
                <div className="font-semibold">{t('fileError.retryFile')}</div>
                <div className="text-xs text-gray-100 mt-1">
                  {t('fileError.retryFileDesc')}
                </div>
              </button>

              <button
                onClick={() => handleFileErrorDecision('cancel')}
                className="w-full px-4 py-3 bg-red-600 text-white font-medium rounded-md hover:bg-red-700 transition-colors text-left"
              >
                <div className="font-semibold">{t('fileError.cancelAll')}</div>
                <div className="text-xs text-red-100 mt-1">
                  {t('fileError.cancelAllDesc')}
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
