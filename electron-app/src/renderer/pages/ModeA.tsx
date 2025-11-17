import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getProcessorsByCategory, estimateCost, isProcessorAvailable } from '@shared/processor-info';
import type { ProcessorCategory } from '@shared/types';

export default function ModeA() {
  const { t, i18n } = useTranslation('modeA');
  const [selectedProcessors, setSelectedProcessors] = useState<Set<string>>(new Set());
  const [pdfFile, setPdfFile] = useState<string | null>(null);
  const [groundTruth, setGroundTruth] = useState('');
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
      console.log('[Renderer] Rate limit event received:', data);
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
      console.log('[Renderer] Queue progress update:', data);
      setQueueProgress(data);
    };

    console.log('[Renderer] Registering rate limit event listeners');
    const cleanupRateLimit = window.electronAPI.onRateLimitDetected(handleRateLimitDetected);
    const cleanupQueueProgress = window.electronAPI.onQueueProgressUpdate(handleQueueProgress);
    console.log('[Renderer] Event listeners registered successfully');

    return () => {
      window.removeEventListener('focus', handleFocus);
      cleanup();
      cleanupRateLimit();
      cleanupQueueProgress();
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

  const handleRateLimitDecision = async (decision: 'continue' | 'skip' | 'cancel') => {
    console.log('[Renderer] User selected decision:', decision);
    if (!rateLimitDialog) {
      console.log('[Renderer] WARNING: No rate limit dialog state');
      return;
    }

    try {
      console.log('[Renderer] Sending decision to main process:', {
        requestId: rateLimitDialog.requestId,
        decision,
      });
      await window.electronAPI.invoke('rate-limit-decision', {
        requestId: rateLimitDialog.requestId,
        decision,
      });
      console.log('[Renderer] Decision sent successfully, closing dialog');
      setRateLimitDialog(null);
    } catch (error) {
      console.error('[Renderer] Failed to send rate limit decision:', error);
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
    // Select ALL processors across all categories
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
    // Add current tab's processors to existing selection (additive)
    const categoryProcessors = getProcessorsByCategory(activeCategory);
    const availableIds = categoryProcessors
      .filter(p => isProcessorAvailable(p.id, apiKeys))
      .map(p => p.id);

    const newSet = new Set(selectedProcessors);
    availableIds.forEach(id => newSet.add(id));
    setSelectedProcessors(newSet);
  };

  const handleDeselectInTab = () => {
    // Remove current tab's processors from selection
    const categoryProcessors = getProcessorsByCategory(activeCategory);
    const categoryIds = categoryProcessors.map(p => p.id);

    const newSet = new Set(selectedProcessors);
    categoryIds.forEach(id => newSet.delete(id));
    setSelectedProcessors(newSet);
  };

  const handleRunTest = async () => {
    if (!pdfFile || selectedProcessors.size === 0) {
      alert(t('errors.missingFileDesc'));
      return;
    }

    if (!groundTruth.trim()) {
      const confirm = window.confirm(
        t('errors.missingGroundTruthDesc') + ' ' + t('runButton.noGroundTruth')
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
        language: i18n.language,
      } as any);

      if (result.success && result.reportPath) {
        alert(t('errors.testCompleted', { path: result.reportPath }));

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

  const costEstimate = estimateCost(Array.from(selectedProcessors), 1);

  const categoryProcessors = getProcessorsByCategory(activeCategory);

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="bg-white shadow sm:rounded-lg p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">{t('title')}</h2>
        <p className="text-gray-600 mb-6">
          {t('description')}
        </p>

        {/* File Upload Section */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">{t('upload.heading')}</h3>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSelectFile}
              disabled={processing}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('upload.selectButton')}
            </button>
            {pdfFile && (
              <span className="text-sm text-gray-600">
                {t('upload.selected')} <span className="font-medium">{pdfFile.split('/').pop()}</span>
              </span>
            )}
          </div>
        </div>

        {/* Ground Truth Section */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">{t('groundTruth.heading')}</h3>
          <textarea
            value={groundTruth}
            onChange={(e) => setGroundTruth(e.target.value)}
            disabled={processing}
            className="w-full h-32 px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 font-mono text-sm"
            placeholder={t('groundTruth.placeholder')}
          />
          <p className="mt-1 text-xs text-gray-500">
            {t('groundTruth.description')}
          </p>
        </div>

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
        {selectedProcessors.size > 0 && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-md">
            <h4 className="font-medium text-blue-900 mb-1">{t('costEstimate.heading')}</h4>
            <p className="text-sm text-blue-700">
              {t('costEstimate.processorsSelected', { count: selectedProcessors.size })}
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
            <p className="text-sm text-yellow-700 mb-2">{t('progress.step', { step: progress.step })}</p>
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
            <p className="text-sm text-purple-700 mb-2">{t('queueProgress.status', { status: queueProgress.status })}</p>
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
                {t('rateLimit.message', { message: rateLimitDialog.message })}
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
    </div>
  );
}
