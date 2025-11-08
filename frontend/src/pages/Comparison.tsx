import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useDrawingResults } from '../api/queries';
import { apiClient } from '../api/client';
import { ImageCanvas } from '../components/ImageCanvas';
import { Tooltip } from '../components/Tooltip';
import { StatisticsPanel } from '../components/StatisticsPanel';
import { ProcessorDropdown } from '../components/ProcessorDropdown';
import type { BoundingBox } from '../types/api';
import { CheckmarkIcon } from '../components/icons';

export function Comparison() {
  const { drawingId } = useParams<{ drawingId: string }>();
  const { data, isLoading, error } = useDrawingResults(drawingId);

  const [leftTool, setLeftTool] = useState<string | null>(null);
  const [rightTool, setRightTool] = useState<string | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [hoveredSide, setHoveredSide] = useState<'left' | 'right' | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [confidenceThreshold, setConfidenceThreshold] = useState(0);
  const [showOnlyLowConfidence, setShowOnlyLowConfidence] = useState(false);
  const [showOnlyGeminiUpdates, setShowOnlyGeminiUpdates] = useState(false);
  const [heatmapMode, setHeatmapMode] = useState(false);
  const [syncHover, setSyncHover] = useState(true);
  const [showGeminiIcons, setShowGeminiIcons] = useState(true);

  // Track mouse position globally
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Auto-select first two tools when data loads
  useEffect(() => {
    if (data?.data.tools && data.data.tools.length > 0) {
      if (!leftTool) setLeftTool(data.data.tools[0]);
      if (!rightTool && data.data.tools.length > 1) {
        setRightTool(data.data.tools[1]);
      }
    }
  }, [data, leftTool, rightTool]);

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
  const leftResult = leftTool ? resultsByTool[leftTool] : null;
  const rightResult = rightTool ? resultsByTool[rightTool] : null;
  const leftBoundingBoxes = leftResult?.boundingBoxes || [];
  const rightBoundingBoxes = rightResult?.boundingBoxes || [];
  const imageUrl = apiClient.getImageURL(drawing.filePath);

  // Get the hovered bounding box from the appropriate side
  let hoveredBBox: BoundingBox | null = null;
  if (hoveredIndex !== null && hoveredSide) {
    const boxes = hoveredSide === 'left' ? leftBoundingBoxes : rightBoundingBoxes;
    hoveredBBox = boxes[hoveredIndex] || null;
  }

  // Handle hover with sync
  const handleLeftHover = (index: number | null) => {
    setHoveredIndex(index);
    setHoveredSide(index !== null ? 'left' : null);
  };

  const handleRightHover = (index: number | null) => {
    if (syncHover) {
      setHoveredIndex(index);
      setHoveredSide(index !== null ? 'right' : null);
    } else {
      setHoveredIndex(index);
      setHoveredSide(index !== null ? 'right' : null);
    }
  };

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
          </div>

          {/* Toggle Controls */}
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={syncHover}
                onChange={(e) => setSyncHover(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm font-medium">Sync Hover</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showGeminiIcons}
                onChange={(e) => setShowGeminiIcons(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm font-medium">Show Gemini Icons</span>
            </label>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex gap-2 border-b -mb-4 pb-0">
          <Link
            to={`/drawing/${drawingId}`}
            className="px-4 py-2 font-medium text-gray-600 hover:text-gray-900 border-b-2 border-transparent hover:border-gray-300"
          >
            Viewer
          </Link>
          <Link
            to={`/drawing/${drawingId}/compare`}
            className="px-4 py-2 font-medium text-blue-600 border-b-2 border-blue-600"
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

        {/* Tool Selectors */}
        <div className="flex gap-8">
          {/* Left Tool */}
          <div className="flex-1">
            <label className="text-sm font-medium text-gray-700 mb-2 block">
              Left Tool
            </label>
            <ProcessorDropdown
              value={leftTool}
              onChange={setLeftTool}
              options={tools}
            />
            {leftResult && (
              <div className="flex gap-4 mt-2 text-sm text-gray-600">
                <span>{leftResult.processingTimeMs}ms</span>
                <span>¥{leftResult.apiCost?.toFixed(2)}</span>
                <span>{leftBoundingBoxes.length} boxes</span>
              </div>
            )}
          </div>

          {/* Right Tool */}
          <div className="flex-1">
            <label className="text-sm font-medium text-gray-700 mb-2 block">
              Right Tool
            </label>
            <ProcessorDropdown
              value={rightTool}
              onChange={setRightTool}
              options={tools}
            />
            {rightResult && (
              <div className="flex gap-4 mt-2 text-sm text-gray-600">
                <span>{rightResult.processingTimeMs}ms</span>
                <span>¥{rightResult.apiCost?.toFixed(2)}</span>
                <span>{rightBoundingBoxes.length} boxes</span>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Split Canvas Area */}
        <div className="flex-1 flex gap-4 p-6">
          {/* Left Canvas */}
          <div className="flex-1">
            {leftResult && leftBoundingBoxes ? (
              <ImageCanvas
                imageUrl={imageUrl}
                boundingBoxes={leftBoundingBoxes}
                hoveredIndex={syncHover && hoveredSide === 'right' ? hoveredIndex : hoveredSide === 'left' ? hoveredIndex : null}
                onHover={handleLeftHover}
                selectedIndex={selectedIndex}
                onSelect={setSelectedIndex}
                heatmapMode={heatmapMode}
                confidenceThreshold={confidenceThreshold}
                showOnlyLowConfidence={showOnlyLowConfidence}
                showOnlyGeminiUpdates={showOnlyGeminiUpdates}
                showGeminiIcons={showGeminiIcons}
              />
            ) : (
              <div className="flex items-center justify-center h-full bg-gray-100 rounded-lg">
                <p className="text-gray-500">No bounding boxes available</p>
              </div>
            )}
          </div>

          {/* Right Canvas */}
          <div className="flex-1">
            {rightResult && rightBoundingBoxes ? (
              <ImageCanvas
                imageUrl={imageUrl}
                boundingBoxes={rightBoundingBoxes}
                hoveredIndex={syncHover && hoveredSide === 'left' ? hoveredIndex : hoveredSide === 'right' ? hoveredIndex : null}
                onHover={handleRightHover}
                selectedIndex={selectedIndex}
                onSelect={setSelectedIndex}
                heatmapMode={heatmapMode}
                confidenceThreshold={confidenceThreshold}
                showOnlyLowConfidence={showOnlyLowConfidence}
                showOnlyGeminiUpdates={showOnlyGeminiUpdates}
                showGeminiIcons={showGeminiIcons}
              />
            ) : (
              <div className="flex items-center justify-center h-full bg-gray-100 rounded-lg">
                <p className="text-gray-500">No bounding boxes available</p>
              </div>
            )}
          </div>
        </div>

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

          {/* Statistics Panels */}
          <div className="border-t pt-4 space-y-4">
            {leftResult && leftBoundingBoxes.length > 0 && (
              <StatisticsPanel
                boundingBoxes={leftBoundingBoxes}
                toolName={leftTool || 'Left Tool'}
              />
            )}

            {rightResult && rightBoundingBoxes.length > 0 && (
              <StatisticsPanel
                boundingBoxes={rightBoundingBoxes}
                toolName={rightTool || 'Right Tool'}
              />
            )}
          </div>

          {/* Comparison Info */}
          <div className="border-t pt-4 mt-4">
            <h3 className="text-sm font-semibold mb-2">Comparison Stats</h3>
            {leftResult && rightResult && (
              <div className="space-y-2 text-sm text-gray-600">
                <div>
                  <span className="font-medium">Processing Time Diff:</span>{' '}
                  {Math.abs(leftResult.processingTimeMs - rightResult.processingTimeMs)}ms
                </div>
                <div>
                  <span className="font-medium">Cost Diff:</span> ¥
                  {Math.abs((leftResult.apiCost || 0) - (rightResult.apiCost || 0)).toFixed(2)}
                </div>
                <div>
                  <span className="font-medium">BBox Count Diff:</span>{' '}
                  {Math.abs(leftBoundingBoxes.length - rightBoundingBoxes.length)}
                </div>
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="border-t pt-4 mt-4">
            <h3 className="text-sm font-semibold mb-3">Color Legend</h3>
            <div className="space-y-2 text-xs text-gray-600">
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded border-2 border-green-500"></span>
                <span>High confidence (≥85%) - not sent to Gemini</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded border-2 border-yellow-500"></span>
                <span>Low confidence (&lt;85%) - sent but unchanged</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded border-2 border-blue-500 flex items-center justify-center bg-blue-500">
                  <CheckmarkIcon size={10} className="text-white" />
                </div>
                <span>Corrected by Gemini (with blue badge)</span>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Tooltip */}
      {hoveredBBox && <Tooltip bbox={hoveredBBox} position={mousePos} />}
    </div>
  );
}
