import { useState, useEffect } from 'react';
import { getProcessorsByCategory, estimateCost, isProcessorAvailable } from '@shared/processor-info';
import type { ProcessorCategory } from '@shared/types';

export default function ModeA() {
  const [selectedProcessors, setSelectedProcessors] = useState<Set<string>>(new Set());
  const [pdfFile, setPdfFile] = useState<string | null>(null);
  const [groundTruth, setGroundTruth] = useState('');
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ step: '', progress: 0, total: 0 });
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [activeCategory, setActiveCategory] = useState<ProcessorCategory>('confidential-safe');

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

    return () => {
      window.removeEventListener('focus', handleFocus);
      cleanup();
    };
  }, []);

  const loadApiKeys = async () => {
    const keys = await window.electronAPI.getApiKeys();
    setApiKeys(keys);
  };

  const handleSelectFile = async () => {
    const filePath = await window.electronAPI.selectFile([
      { name: 'All Supported Files', extensions: ['pdf', 'png', 'jpg', 'jpeg'] },
      { name: 'PDF Files', extensions: ['pdf'] },
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg'] },
    ]);

    if (filePath) {
      setPdfFile(filePath);
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
    const categoryProcessors = getProcessorsByCategory(activeCategory);
    const availableIds = categoryProcessors
      .filter(p => isProcessorAvailable(p.id, apiKeys))
      .map(p => p.id);

    setSelectedProcessors(new Set(availableIds));
  };

  const handleDeselectAll = () => {
    setSelectedProcessors(new Set());
  };

  const handleRunTest = async () => {
    if (!pdfFile || selectedProcessors.size === 0) {
      alert('Please select a file and at least one processor');
      return;
    }

    if (!groundTruth.trim()) {
      const confirm = window.confirm(
        'No ground truth provided. You will not get accuracy metrics. Continue anyway?'
      );
      if (!confirm) return;
    }

    setProcessing(true);
    setProgress({ step: 'Starting...', progress: 0, total: 1 });

    try {
      const result = await window.electronAPI.processOCR({
        mode: 'pdf',
        processors: Array.from(selectedProcessors),
        files: [
          {
            path: pdfFile,
            groundTruth: groundTruth,
          },
        ],
        groundTruth,
      });

      if (result.success && result.reportPath) {
        alert(`Test completed successfully!\n\nReport saved to:\n${result.reportPath}`);

        // Open the report
        await window.electronAPI.openPath(result.reportPath);
      } else {
        alert(`Test failed:\n${result.error}`);
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setProcessing(false);
      setProgress({ step: '', progress: 0, total: 0 });
    }
  };

  const costEstimate = estimateCost(Array.from(selectedProcessors), 1);

  const categoryProcessors = getProcessorsByCategory(activeCategory);

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="bg-white shadow sm:rounded-lg p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">PDF OCR Testing</h2>
        <p className="text-gray-600 mb-6">
          Upload a PDF or image file and test it with multiple OCR processors. Provide ground truth for accuracy metrics.
        </p>

        {/* File Upload Section */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">1. Upload File</h3>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSelectFile}
              disabled={processing}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Select PDF/Image
            </button>
            {pdfFile && (
              <span className="text-sm text-gray-600">
                Selected: <span className="font-medium">{pdfFile.split('/').pop()}</span>
              </span>
            )}
          </div>
        </div>

        {/* Ground Truth Section */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">2. Enter Ground Truth (Optional)</h3>
          <textarea
            value={groundTruth}
            onChange={(e) => setGroundTruth(e.target.value)}
            disabled={processing}
            className="w-full h-32 px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 font-mono text-sm"
            placeholder="Paste the correct text here to calculate accuracy metrics..."
          />
          <p className="mt-1 text-xs text-gray-500">
            Ground truth is used to calculate CER, precision, recall, and other accuracy metrics.
          </p>
        </div>

        {/* Processor Selection */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-gray-900">3. Select Processors</h3>
            <div className="flex gap-2">
              <button
                onClick={handleSelectAll}
                disabled={processing}
                className="text-sm px-3 py-1 text-indigo-600 hover:bg-indigo-50 rounded-md disabled:opacity-50"
              >
                Select All
              </button>
              <button
                onClick={handleDeselectAll}
                disabled={processing}
                className="text-sm px-3 py-1 text-gray-600 hover:bg-gray-50 rounded-md disabled:opacity-50"
              >
                Deselect All
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
              Confidential-Safe (4)
            </button>
            <button
              onClick={() => setActiveCategory('hybrids')}
              className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
                activeCategory === 'hybrids'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Hybrids (4)
            </button>
            <button
              onClick={() => setActiveCategory('experimental')}
              className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
                activeCategory === 'experimental'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Experimental (6)
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
                        <h4 className="font-medium text-gray-900">{processor.name}</h4>
                        <span className="text-xs text-gray-500">{processor.cost}</span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">{processor.description}</p>
                      {!available && (
                        <p className="text-xs text-red-600 mt-1">
                          {processor.requiresApiKeys.includes('googleCloudVision')
                            ? 'Missing authentication: Configure either Service Account (Project ID + JSON) OR API Key in Settings'
                            : `Missing API keys: ${processor.requiresApiKeys.filter(k => !apiKeys[k]).join(', ')}`
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
        {selectedProcessors.size > 0 && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-md">
            <h4 className="font-medium text-blue-900 mb-1">Cost Estimate</h4>
            <p className="text-sm text-blue-700">
              {selectedProcessors.size} processor{selectedProcessors.size > 1 ? 's' : ''} selected
            </p>
            <p className="text-sm text-blue-700">{costEstimate.note}</p>
          </div>
        )}

        {/* Progress */}
        {processing && (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
            <h4 className="font-medium text-yellow-900 mb-2">Processing...</h4>
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
          disabled={processing || !pdfFile || selectedProcessors.size === 0}
          className="w-full px-6 py-3 bg-indigo-600 text-white font-medium rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {processing ? 'Processing...' : 'Run Test'}
        </button>

        {/* Info */}
        <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-md">
          <h4 className="font-medium text-gray-900 mb-2">How it works:</h4>
          <ol className="text-sm text-gray-600 list-decimal list-inside space-y-1">
            <li>Upload your PDF or image file</li>
            <li>Optionally provide ground truth text for accuracy calculation</li>
            <li>Select one or more OCR processors to test</li>
            <li>Click "Run Test" to process the file</li>
            <li>View the generated HTML report with detailed metrics</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
