import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useDrawingResults } from '../api/queries';
import { apiClient } from '../api/client';
import { ImageCanvas } from '../components/ImageCanvas';
import { Tooltip } from '../components/Tooltip';
import { ProcessorDropdown } from '../components/ProcessorDropdown';
import { WarningIcon } from '../components/icons';

export function DrawingViewer() {
  const { drawingId } = useParams<{ drawingId: string }>();
  const { data, isLoading, error } = useDrawingResults(drawingId);

  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [confidenceThreshold, setConfidenceThreshold] = useState(0);
  const [showOnlyLowConfidence, setShowOnlyLowConfidence] = useState(false);
  const [showOnlyGeminiUpdates, setShowOnlyGeminiUpdates] = useState(false);
  const [heatmapMode, setHeatmapMode] = useState(false);

  // Track mouse position globally
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Auto-select first tool when data loads
  useEffect(() => {
    if (data?.data.tools && data.data.tools.length > 0 && !selectedTool) {
      setSelectedTool(data.data.tools[0]);
    }
  }, [data, selectedTool]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg text-gray-600">Loading...</div>
      </div>
    );
  }

  if (error || !data?.data) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg text-red-600">Error loading drawing data</div>
      </div>
    );
  }

  const { drawing, resultsByTool, tools } = data.data;
  const currentResult = selectedTool ? resultsByTool[selectedTool] : null;
  const boundingBoxes = currentResult?.boundingBoxes || [];
  const imageUrl = apiClient.getImageURL(drawing.filePath);

  const geminiUpdateCount = boundingBoxes.filter((b) => b.metadata?.geminiUpdated).length;
  const lowConfidenceCount = boundingBoxes.filter((b) => (b.confidence ?? 1) < 0.85).length;
  const hoveredBBox = hoveredIndex !== null ? boundingBoxes[hoveredIndex] : null;

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <Link to="/" className="text-blue-600 hover:text-blue-800 text-sm mb-2 inline-block">
              ← Back to Home
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">{drawing.fileName}</h1>
            <p className="text-sm text-gray-500 mt-1">
              Type: {drawing.type} | Quality: {drawing.quality}
            </p>
          </div>

          {/* Tool Selector */}
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-gray-700">OCR Tool:</label>
            <ProcessorDropdown
              value={selectedTool}
              onChange={setSelectedTool}
              options={tools}
              className="min-w-[300px]"
            />
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex gap-2 border-b -mb-4 pb-0">
          <Link
            to={`/drawing/${drawingId}`}
            className="px-4 py-2 font-medium text-blue-600 border-b-2 border-blue-600"
          >
            Viewer
          </Link>
          <Link
            to={`/drawing/${drawingId}/compare`}
            className="px-4 py-2 font-medium text-gray-600 hover:text-gray-900 border-b-2 border-transparent hover:border-gray-300"
          >
            Compare
          </Link>
          <Link
            to={`/drawing/${drawingId}/stats`}
            className="px-4 py-2 font-medium text-gray-600 hover:text-gray-900 border-b-2 border-transparent hover:border-gray-300"
          >
            Statistics
          </Link>
        </div>

        {/* Metrics Bar */}
        {currentResult && (
          <div className="flex gap-6 mt-4 text-sm">
            <div>
              <span className="text-gray-600">Processing:</span>{' '}
              <span className="font-medium">{currentResult.processingTimeMs}ms</span>
            </div>
            <div>
              <span className="text-gray-600">Cost:</span>{' '}
              <span className="font-medium">¥{currentResult.apiCost?.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-gray-600">Bounding Boxes:</span>{' '}
              <span className="font-medium">{boundingBoxes.length}</span>
            </div>
            {geminiUpdateCount > 0 && (
              <div className="flex items-center gap-1">
                <span className="text-blue-600">Gemini Updates:</span>{' '}
                <span className="font-medium text-blue-600">{geminiUpdateCount}</span>
              </div>
            )}
            {lowConfidenceCount > 0 && (
              <div className="flex items-center gap-1">
                <WarningIcon size={16} className="text-orange-600" />
                <span className="text-orange-600">Low Confidence:</span>{' '}
                <span className="font-medium text-orange-600">{lowConfidenceCount}</span>
              </div>
            )}
          </div>
        )}
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Main Canvas Area */}
        <main className="flex-1 p-6 overflow-auto">
          {currentResult && boundingBoxes ? (
            <ImageCanvas
              imageUrl={imageUrl}
              boundingBoxes={boundingBoxes}
              hoveredIndex={hoveredIndex}
              onHover={setHoveredIndex}
              selectedIndex={selectedIndex}
              onSelect={setSelectedIndex}
              heatmapMode={heatmapMode}
              confidenceThreshold={confidenceThreshold}
              showOnlyLowConfidence={showOnlyLowConfidence}
              showOnlyGeminiUpdates={showOnlyGeminiUpdates}
            />
          ) : (
            <div className="flex items-center justify-center h-full bg-gray-100 rounded-lg">
              <p className="text-gray-500">No bounding boxes available for this tool</p>
            </div>
          )}
        </main>

        {/* Sidebar */}
        <aside className="w-80 bg-white border-l border-gray-200 p-6 overflow-auto">
          <h2 className="text-lg font-semibold mb-4">Filters & Controls</h2>

          {/* Heatmap Toggle */}
          <div className="mb-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={heatmapMode}
                onChange={(e) => setHeatmapMode(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm font-medium">Heatmap Mode</span>
            </label>
          </div>

          {/* Confidence Threshold */}
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">
              Confidence Threshold: {confidenceThreshold}%
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={confidenceThreshold}
              onChange={(e) => setConfidenceThreshold(Number(e.target.value))}
              className="w-full"
            />
          </div>

          {/* Filter Toggles */}
          <div className="space-y-3 mb-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showOnlyLowConfidence}
                onChange={(e) => setShowOnlyLowConfidence(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm">Show only low confidence (&lt;85%)</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showOnlyGeminiUpdates}
                onChange={(e) => setShowOnlyGeminiUpdates(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm">Show only Gemini updates</span>
            </label>
          </div>

          {/* Gemini Updates List */}
          {geminiUpdateCount > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2">Gemini Corrections ({geminiUpdateCount})</h3>
              <div className="space-y-2 max-h-96 overflow-auto">
                {boundingBoxes
                  .filter((b) => b.metadata?.geminiUpdated)
                  .map((bbox, idx) => (
                    <div
                      key={idx}
                      className="p-2 bg-blue-50 border border-blue-200 rounded text-xs cursor-pointer hover:bg-blue-100"
                      onClick={() => {
                        const actualIndex = boundingBoxes.findIndex((b) => b === bbox);
                        setSelectedIndex(actualIndex);
                      }}
                    >
                      <div className="font-medium text-blue-900">{bbox.text}</div>
                      {bbox.metadata?.originalText && (
                        <div className="text-gray-600 mt-1">
                          <span className="line-through">{bbox.metadata.originalText}</span>
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Tooltip */}
      {hoveredBBox && <Tooltip bbox={hoveredBBox} position={mousePos} />}
    </div>
  );
}
