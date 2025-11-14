import { useState, useEffect } from 'react';

export default function FloorPlan() {
  const [floorPlanFile, setFloorPlanFile] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ step: '', progress: 0, total: 0 });
  const [result, setResult] = useState<any | null>(null);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [showInstructions, setShowInstructions] = useState(false);

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
      alert('Please select a floor plan image');
      return;
    }

    if (!apiKeys.googleGemini) {
      alert('Please configure your Google Gemini API key in Settings');
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
          `Processing complete!\n\n` +
          `Detected:\n` +
          `- ${processResult.detection?.walls || 0} walls\n` +
          `- ${processResult.detection?.doors || 0} doors\n` +
          `- ${processResult.detection?.windows || 0} windows\n` +
          `- ${processResult.detection?.rooms || 0} rooms\n\n` +
          `Processing time: ${((processResult.processingTime || 0) / 1000).toFixed(1)}s\n` +
          `Cost: ~¥${(processResult.cost || 0).toFixed(2)}`
        );
      } else {
        alert(`Processing failed:\n${processResult.error}`);
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setProcessing(false);
      setProgress({ step: '', progress: 0, total: 0 });
    }
  };

  const handleDownloadJSON = async () => {
    if (!result?.outputs?.jsonPath) return;
    await window.electronAPI.openPath(result.outputs.jsonPath);
  };

  const handleDownloadScript = async () => {
    if (!result?.outputs?.scriptPath) return;
    await window.electronAPI.openPath(result.outputs.scriptPath);
  };

  const hasGeminiKey = Boolean(apiKeys.googleGemini);

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="bg-white shadow sm:rounded-lg p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          Floor Plan to Revit Conversion
        </h2>
        <p className="text-gray-600 mb-6">
          Upload a floor plan image and convert it to Revit-compatible JSON with auto-generated Dynamo Python script.
        </p>

        {/* API Key Warning */}
        {!hasGeminiKey && (
          <div className="mb-6 bg-yellow-50 border-l-4 border-yellow-400 p-4">
            <p className="text-sm text-yellow-700">
              <strong>Google Gemini API key required.</strong> Please configure it in Settings to use this feature.
            </p>
          </div>
        )}

        {/* File Upload Section */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">
            1. Upload Floor Plan Image
          </h3>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSelectFile}
              disabled={processing}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Select Image
            </button>
            {floorPlanFile && (
              <span className="text-sm text-gray-600">
                Selected: <span className="font-medium">{floorPlanFile.split('/').pop() || floorPlanFile.split('\\').pop()}</span>
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Supported formats: PNG, JPG, JPEG (floor plan drawings)
          </p>
        </div>

        {/* Process Button */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">
            2. Process Floor Plan
          </h3>
          <button
            onClick={handleProcess}
            disabled={processing || !floorPlanFile || !hasGeminiKey}
            className="w-full px-6 py-3 bg-green-600 text-white font-medium rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {processing ? 'Processing...' : 'Detect Walls, Doors, Windows & Rooms'}
          </button>
          <p className="mt-2 text-xs text-gray-500">
            Estimated cost: ~¥1.50 per image (~$0.01 USD) · Processing time: ~15-30 seconds
          </p>
        </div>

        {/* Progress */}
        {processing && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-md">
            <h4 className="font-medium text-blue-900 mb-2">Processing...</h4>
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
            <h4 className="font-medium text-green-900 mb-3">
              ✓ Processing Complete!
            </h4>

            {/* Detection Statistics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div className="bg-white p-3 rounded border border-green-200">
                <div className="text-2xl font-bold text-green-700">
                  {result.detection?.walls || 0}
                </div>
                <div className="text-xs text-gray-600">Walls</div>
              </div>
              <div className="bg-white p-3 rounded border border-green-200">
                <div className="text-2xl font-bold text-green-700">
                  {result.detection?.doors || 0}
                </div>
                <div className="text-xs text-gray-600">Doors</div>
              </div>
              <div className="bg-white p-3 rounded border border-green-200">
                <div className="text-2xl font-bold text-green-700">
                  {result.detection?.windows || 0}
                </div>
                <div className="text-xs text-gray-600">Windows</div>
              </div>
              <div className="bg-white p-3 rounded border border-green-200">
                <div className="text-2xl font-bold text-green-700">
                  {result.detection?.rooms || 0}
                </div>
                <div className="text-xs text-gray-600">Rooms</div>
              </div>
            </div>

            <div className="text-sm text-green-700 mb-4">
              <p>Processing time: {((result.processingTime || 0) / 1000).toFixed(1)}s</p>
              <p>Cost: ~¥{(result.cost || 0).toFixed(2)}</p>
            </div>

            {/* Download Buttons */}
            <div className="space-y-2">
              <button
                onClick={handleDownloadJSON}
                className="w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm font-medium"
              >
                📄 Open Revit JSON File
              </button>
              <button
                onClick={handleDownloadScript}
                className="w-full px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 text-sm font-medium"
              >
                🐍 Open Dynamo Python Script
              </button>
            </div>

            <p className="mt-3 text-xs text-green-600">
              <strong>Next Step:</strong> Open the Dynamo Python script in Revit/Dynamo to create walls, doors, windows, and rooms automatically!
            </p>
          </div>
        )}

        {/* Instructions */}
        <div className="mt-6">
          <button
            onClick={() => setShowInstructions(!showInstructions)}
            className="flex items-center justify-between w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-md transition-colors"
          >
            <span className="font-medium text-gray-900">
              📖 How to import into Revit/Dynamo
            </span>
            <span className="text-gray-500">{showInstructions ? '▲' : '▼'}</span>
          </button>

          {showInstructions && (
            <div className="mt-3 p-4 bg-gray-50 rounded-md text-sm text-gray-700 space-y-3">
              <div>
                <h4 className="font-semibold text-gray-900 mb-2">Quick Start (3 Steps)</h4>
                <ol className="list-decimal list-inside space-y-2">
                  <li>
                    <strong>Open Dynamo in Revit:</strong> Go to Manage tab → Visual Programming → Dynamo
                  </li>
                  <li>
                    <strong>Create Python Script Node:</strong> Search for "Python Script" and drag it onto the canvas
                  </li>
                  <li>
                    <strong>Paste & Run:</strong> Double-click the node, paste the entire generated script, and run it!
                  </li>
                </ol>
              </div>

              <div className="border-t border-gray-300 pt-3">
                <h4 className="font-semibold text-gray-900 mb-2">What Gets Created</h4>
                <ul className="list-disc list-inside space-y-1">
                  <li><strong>Walls:</strong> All wall segments with correct dimensions and thickness</li>
                  <li><strong>Doors:</strong> Automatically placed on nearest walls</li>
                  <li><strong>Windows:</strong> Wall-hosted with sill heights</li>
                  <li><strong>Rooms:</strong> Created at polygon centers with labels</li>
                </ul>
              </div>

              <div className="border-t border-gray-300 pt-3">
                <h4 className="font-semibold text-gray-900 mb-2">Features</h4>
                <ul className="list-disc list-inside space-y-1">
                  <li><strong>Dual Coordinates:</strong> Both pixels (original) and millimeters (real-world)</li>
                  <li><strong>Auto-scaling:</strong> Calculates mm-per-pixel from dimension text</li>
                  <li><strong>Auto family selection:</strong> Uses first available wall/door/window families</li>
                  <li><strong>Error handling:</strong> Continues processing even if individual elements fail</li>
                </ul>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded p-3 mt-3">
                <p className="text-xs text-blue-700">
                  <strong>Tip:</strong> The JSON path is hardcoded in the Python script, so you can run it directly without connecting input nodes!
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Info Box */}
        <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-md">
          <h4 className="font-medium text-gray-900 mb-2">How it works:</h4>
          <ol className="text-sm text-gray-600 list-decimal list-inside space-y-1">
            <li>Upload your floor plan image (PNG/JPG)</li>
            <li>AI detects walls, doors, windows, and rooms using Google Gemini vision</li>
            <li>Coordinates are converted to millimeters using auto-calculated scale</li>
            <li>Revit JSON is generated with dual coordinates (pixels + mm)</li>
            <li>Dynamo Python script is auto-generated for easy import</li>
            <li>Open the script in Revit/Dynamo to create all elements!</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
