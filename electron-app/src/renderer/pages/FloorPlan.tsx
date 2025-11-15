import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

export default function FloorPlan() {
  const { t } = useTranslation('floorPlan');
  const [floorPlanFile, setFloorPlanFile] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ step: '', progress: 0, total: 0 });
  const [result, setResult] = useState<any | null>(null);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [showInstructions, setShowInstructions] = useState(false);
  const [scriptCopied, setScriptCopied] = useState(false);
  const [showBoundingBoxes, setShowBoundingBoxes] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Load API keys on mount
  useEffect(() => {
    loadApiKeys();

    // Listen for progress updates
    const cleanup = window.electronAPI.onProgress((data) => {
      setProgress(data);
    });

    return cleanup;
  }, []);

  const loadApiKeys = async () => {
    const keys = await window.electronAPI.getApiKeys();
    setApiKeys(keys);
  };

  const handleSelectFile = async () => {
    const filePath = await window.electronAPI.selectFile([
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg'] },
    ]);

    if (filePath) {
      setFloorPlanFile(filePath);
      setResult(null); // Clear previous results
    }
  };

  const handleProcess = async () => {
    if (!floorPlanFile) {
      alert(t('alerts.noFile'));
      return;
    }

    if (!apiKeys.googleGemini) {
      alert(t('alerts.noApiKey'));
      return;
    }

    setProcessing(true);
    setProgress({ step: 'Starting...', progress: 0, total: 1 });

    try {
      const processResult = await window.electronAPI.processFloorPlan({
        imagePath: floorPlanFile,
        apiKey: apiKeys.googleGemini,
      });

      if (processResult.success) {
        setResult(processResult);
        alert(
          t('alerts.processingComplete', {
            walls: processResult.detection?.walls || 0,
            doors: processResult.detection?.doors || 0,
            windows: processResult.detection?.windows || 0,
            rooms: processResult.detection?.rooms || 0,
            time: ((processResult.processingTime || 0) / 1000).toFixed(1),
            cost: (processResult.cost || 0).toFixed(2)
          })
        );
      } else {
        alert(t('alerts.processingFailed', { error: processResult.error }));
      }
    } catch (error: any) {
      alert(t('alerts.error', { message: error.message }));
    } finally {
      setProcessing(false);
      setProgress({ step: '', progress: 0, total: 0 });
    }
  };

  const handleDownloadJSON = async () => {
    if (!result?.outputs?.jsonPath) return;
    await window.electronAPI.showInFolder(result.outputs.jsonPath);
  };

  const handleDownloadScript = async () => {
    if (!result?.outputs?.scriptPath) return;
    await window.electronAPI.openPath(result.outputs.scriptPath);
  };

  const handleCopyScript = async () => {
    if (!result?.outputs?.scriptPath) return;

    try {
      const scriptContent = await window.electronAPI.readFileText(result.outputs.scriptPath);
      await navigator.clipboard.writeText(scriptContent);
      setScriptCopied(true);

      // Reset the "copied" state after 2 seconds
      setTimeout(() => {
        setScriptCopied(false);
      }, 2000);
    } catch (error) {
      console.error('Failed to copy script:', error);
      alert(t('alerts.copyFailed'));
    }
  };

  // Render floor plan visualization on canvas
  const renderFloorPlanCanvas = async () => {
    if (!canvasRef.current || !result?.revitOutput || !floorPlanFile) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      // Set canvas size to match image
      canvas.width = img.width;
      canvas.height = img.height;

      // Draw original floor plan image
      ctx.drawImage(img, 0, 0);

      // Draw detected objects (only if showBoundingBoxes is true)
      if (showBoundingBoxes) {
        const elements = result.revitOutput.elements || [];

        elements.forEach((element: any) => {
        const coords = element.geometry?.coordinates_px || [];
        if (coords.length === 0) return;

        const type = element.type;
        const confidence = element.confidence || 1;

        // Color scheme based on type
        let strokeColor = '#000000';
        let fillColor = 'rgba(0, 0, 0, 0.1)';

        switch (type) {
          case 'wall':
            strokeColor = '#9333ea'; // purple
            fillColor = 'rgba(147, 51, 234, 0.2)';
            break;
          case 'door':
            strokeColor = '#f97316'; // orange
            fillColor = 'rgba(249, 115, 22, 0.3)';
            break;
          case 'window':
            strokeColor = '#06b6d4'; // cyan
            fillColor = 'rgba(6, 182, 212, 0.3)';
            break;
          case 'room':
            strokeColor = '#eab308'; // yellow
            fillColor = 'rgba(234, 179, 8, 0.15)';
            break;
        }

        if (element.geometry?.type === 'line' && coords.length === 2) {
          // Draw walls as lines with thickness
          const thickness = element.properties?.thickness || 5;

          ctx.beginPath();
          ctx.moveTo(coords[0].x, coords[0].y);
          ctx.lineTo(coords[1].x, coords[1].y);
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = Math.max(thickness, 3);
          ctx.lineCap = 'round';
          ctx.stroke();

        } else if (element.geometry?.type === 'polygon' && coords.length >= 3) {
          // Draw rooms as filled polygons
          ctx.beginPath();
          ctx.moveTo(coords[0].x, coords[0].y);
          for (let i = 1; i < coords.length; i++) {
            ctx.lineTo(coords[i].x, coords[i].y);
          }
          ctx.closePath();

          ctx.fillStyle = fillColor;
          ctx.fill();
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = 2;
          ctx.stroke();

          // Draw room label if available
          if (element.properties?.name || element.properties?.label) {
            const label = element.properties.name || element.properties.label;
            const centerX = coords.reduce((sum: number, c: any) => sum + c.x, 0) / coords.length;
            const centerY = coords.reduce((sum: number, c: any) => sum + c.y, 0) / coords.length;

            ctx.fillStyle = '#000000';
            ctx.font = 'bold 14px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, centerX, centerY);
          }

        } else if (element.geometry?.type === 'point' && coords.length === 1) {
          // Draw doors/windows as markers
          const x = coords[0].x;
          const y = coords[0].y;
          const size = 10;

          ctx.beginPath();
          if (type === 'door') {
            // Draw door as square
            ctx.rect(x - size, y - size, size * 2, size * 2);
          } else if (type === 'window') {
            // Draw window as circle
            ctx.arc(x, y, size, 0, Math.PI * 2);
          }
          ctx.fillStyle = fillColor;
          ctx.fill();
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      });
      }
    };

    // Load floor plan image as base64 data URL
    try {
      const dataUrl = await window.electronAPI.readFileAsBase64(floorPlanFile);
      img.src = dataUrl;
    } catch (error) {
      console.error('Failed to load floor plan image:', error);
    }
  };

  // Render canvas when result changes
  useEffect(() => {
    if (result && result.success) {
      renderFloorPlanCanvas();
    }
  }, [result, floorPlanFile, showBoundingBoxes]);

  const hasGeminiKey = Boolean(apiKeys.googleGemini);

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="bg-white shadow sm:rounded-lg p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          {t('title')}
        </h2>
        <p className="text-gray-600 mb-6">
          {t('description')}
        </p>

        {/* API Key Warning */}
        {!hasGeminiKey && (
          <div className="mb-6 bg-yellow-50 border-l-4 border-yellow-400 p-4">
            <p className="text-sm text-yellow-700">
              <strong>{t('apiKeyWarning.title')}</strong> {t('apiKeyWarning.message')}
            </p>
          </div>
        )}

        {/* File Upload Section */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">
            {t('upload.heading')}
          </h3>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSelectFile}
              disabled={processing}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('upload.buttonText')}
            </button>
            {floorPlanFile && (
              <span className="text-sm text-gray-600">
                {t('upload.selectedLabel')} <span className="font-medium">{floorPlanFile.split('/').pop() || floorPlanFile.split('\\').pop()}</span>
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-gray-500">
            {t('upload.supportedFormats')}
          </p>
        </div>

        {/* Process Button */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">
            {t('process.heading')}
          </h3>
          <button
            onClick={handleProcess}
            disabled={processing || !floorPlanFile || !hasGeminiKey}
            className="w-full px-6 py-3 bg-green-600 text-white font-medium rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {processing ? t('process.buttonProcessing') : t('process.buttonText')}
          </button>
          <p className="mt-2 text-xs text-gray-500">
            {t('process.costEstimate')}
          </p>
        </div>

        {/* Progress */}
        {processing && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-md">
            <h4 className="font-medium text-blue-900 mb-2">{t('progress.title')}</h4>
            <p className="text-sm text-blue-700 mb-2">{progress.step}</p>
            {progress.total > 0 && (
              <div className="w-full bg-blue-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all"
                  style={{ width: `${(progress.progress / progress.total) * 100}%` }}
                />
              </div>
            )}
          </div>
        )}

        {/* Results */}
        {result && result.success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-md">
            <h4 className="font-medium text-green-900 mb-3 flex items-center gap-2">
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {t('results.title')}
            </h4>

            {/* Detection Statistics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div className="bg-white p-3 rounded border border-green-200">
                <div className="text-2xl font-bold text-green-700">
                  {t('results.walls', { count: result.detection?.walls || 0 })}
                </div>
                <div className="text-xs text-gray-600">{t('results.wallsLabel')}</div>
              </div>
              <div className="bg-white p-3 rounded border border-green-200">
                <div className="text-2xl font-bold text-green-700">
                  {t('results.doors', { count: result.detection?.doors || 0 })}
                </div>
                <div className="text-xs text-gray-600">{t('results.doorsLabel')}</div>
              </div>
              <div className="bg-white p-3 rounded border border-green-200">
                <div className="text-2xl font-bold text-green-700">
                  {t('results.windows', { count: result.detection?.windows || 0 })}
                </div>
                <div className="text-xs text-gray-600">{t('results.windowsLabel')}</div>
              </div>
              <div className="bg-white p-3 rounded border border-green-200">
                <div className="text-2xl font-bold text-green-700">
                  {t('results.rooms', { count: result.detection?.rooms || 0 })}
                </div>
                <div className="text-xs text-gray-600">{t('results.roomsLabel')}</div>
              </div>
            </div>

            <div className="text-sm text-green-700 mb-4">
              <p>{t('results.processingTime', { time: ((result.processingTime || 0) / 1000).toFixed(1) })}</p>
              <p>{t('results.cost', { cost: (result.cost || 0).toFixed(2) })}</p>
            </div>

            {/* Floor Plan Visualization Canvas */}
            <div className="mb-4">
              <h5 className="font-medium text-green-900 mb-2">{t('results.previewTitle')}</h5>
              <div className="border border-green-200 rounded-md overflow-hidden bg-white">
                <canvas
                  ref={canvasRef}
                  className="w-full h-auto"
                  style={{ maxHeight: '500px', objectFit: 'contain' }}
                />
              </div>

              {/* Toggle for Bounding Boxes */}
              <div className="mt-3 flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showBoundingBoxes}
                    onChange={(e) => setShowBoundingBoxes(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded focus:ring-2 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-gray-700 font-medium">
                    {t('results.showDetectionRegions')}
                  </span>
                </label>
              </div>

              {/* Legend */}
              <div className="mt-2 flex flex-wrap gap-3 text-xs">
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: '#9333ea' }}></div>
                  <span className="text-gray-700">{t('results.legendWalls')}</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: '#f97316' }}></div>
                  <span className="text-gray-700">{t('results.legendDoors')}</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: '#06b6d4' }}></div>
                  <span className="text-gray-700">{t('results.legendWindows')}</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: '#eab308' }}></div>
                  <span className="text-gray-700">{t('results.legendRooms')}</span>
                </div>
              </div>
            </div>

            {/* Download Buttons */}
            <div className="space-y-2">
              <button
                onClick={handleDownloadJSON}
                className="w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm font-medium flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                {t('results.showJsonButton')}
              </button>
              <div className="flex gap-2">
                <button
                  onClick={handleDownloadScript}
                  className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 text-sm font-medium flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                  {t('results.openScriptButton')}
                </button>
                <button
                  onClick={handleCopyScript}
                  className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 text-sm font-medium flex items-center justify-center gap-2"
                  title="Copy script to clipboard"
                >
                  {scriptCopied ? (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {t('results.copiedButton')}
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      {t('results.copyButton')}
                    </>
                  )}
                </button>
              </div>
            </div>

            <p className="mt-3 text-xs text-green-600">
              <strong>{t('results.nextStepTitle')}</strong> {t('results.nextStepDescription')}
            </p>
          </div>
        )}

        {/* Instructions */}
        <div className="mt-6">
          <button
            onClick={() => setShowInstructions(!showInstructions)}
            className="flex items-center justify-between w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-md transition-colors"
          >
            <span className="font-medium text-gray-900 flex items-center gap-2">
              <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              {t('instructions.toggleButton')}
            </span>
            <span className="text-gray-500">{showInstructions ? '▲' : '▼'}</span>
          </button>

          {showInstructions && (
            <div className="mt-3 p-4 bg-gray-50 rounded-md text-sm text-gray-700 space-y-3">
              <div>
                <h4 className="font-semibold text-gray-900 mb-2">{t('instructions.quickStart.title')}</h4>
                <ol className="list-decimal list-inside space-y-2">
                  <li>{t('instructions.quickStart.step1')}</li>
                  <li>{t('instructions.quickStart.step2')}</li>
                  <li>{t('instructions.quickStart.step3')}</li>
                </ol>
              </div>

              <div className="border-t border-gray-300 pt-3">
                <h4 className="font-semibold text-gray-900 mb-2">{t('instructions.whatGetsCreated.title')}</h4>
                <ul className="list-disc list-inside space-y-1">
                  <li>{t('instructions.whatGetsCreated.walls')}</li>
                  <li>{t('instructions.whatGetsCreated.doors')}</li>
                  <li>{t('instructions.whatGetsCreated.windows')}</li>
                  <li>{t('instructions.whatGetsCreated.rooms')}</li>
                </ul>
              </div>

              <div className="border-t border-gray-300 pt-3">
                <h4 className="font-semibold text-gray-900 mb-2">{t('instructions.features.title')}</h4>
                <ul className="list-disc list-inside space-y-1">
                  <li>{t('instructions.features.dualCoords')}</li>
                  <li>{t('instructions.features.autoScaling')}</li>
                  <li>{t('instructions.features.autoFamily')}</li>
                  <li>{t('instructions.features.errorHandling')}</li>
                </ul>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded p-3 mt-3">
                <p className="text-xs text-blue-700">
                  {t('instructions.tip')}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Info Box */}
        <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-md">
          <h4 className="font-medium text-gray-900 mb-2">{t('howItWorks.title')}</h4>
          <ol className="text-sm text-gray-600 list-decimal list-inside space-y-1">
            <li>{t('howItWorks.step1')}</li>
            <li>{t('howItWorks.step2')}</li>
            <li>{t('howItWorks.step3')}</li>
            <li>{t('howItWorks.step4')}</li>
            <li>{t('howItWorks.step5')}</li>
            <li>{t('howItWorks.step6')}</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
