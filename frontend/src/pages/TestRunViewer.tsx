import { useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { format } from 'date-fns';
import { ImageCanvas, type ImageCanvasRef } from '../components/ImageCanvas';
import { Tooltip } from '../components/Tooltip';
import { TextCardsList } from '../components/TextCardsList';
import type { BoundingBox } from '../types/api';
import { CheckmarkIcon, WarningIcon } from '../components/icons';
import {
  getToolAbbreviation,
  normalizeBounds,
  calculateBboxScreenPosition,
} from '../utils/testRunHelpers';
import { useTestRunData } from '../hooks/useTestRunData';
import { useTestRunUI } from '../hooks/useTestRunUI';

export function TestRunViewer() {
  const { testRunId } = useParams<{ testRunId: string }>();

  // Data hook - manages test run data and tool selection
  const {
    testRun,
    comparisons,
    aggregateStats,
    isLoading,
    error,
    hasData,
    tools,
    leftTool,
    rightTool,
    setLeftTool,
    setRightTool,
    leftToolData,
    rightToolData,
    leftBoundingBoxes,
    rightBoundingBoxes,
    drawing,
    imageUrl,
    selectedDrawingIndex,
    setSelectedDrawingIndex,
    totalDrawings,
    allDrawings,
  } = useTestRunData(testRunId);

  // UI hook - manages all UI state
  const {
    hoveredIndex,
    hoveredSide,
    handleLeftHover,
    handleRightHover,
    selectedIndex,
    handleCanvasSelect,
    mousePos,
    showHighlights,
    setShowHighlights,
    showGeminiIndicators,
    setShowGeminiIndicators,
    sidebarCollapsed,
    setSidebarCollapsed,
    headerCollapsed,
    setHeaderCollapsed,
    sidebarMainTab,
    setSidebarMainTab,
    activeTab,
    setActiveTab,
    scrollToBboxIndex,
    setScrollToBboxIndex,
    fixedTooltipPos,
    setFixedTooltipPos,
  } = useTestRunUI();

  const leftCanvasRef = useRef<ImageCanvasRef>(null);
  const rightCanvasRef = useRef<ImageCanvasRef>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg text-gray-600">Loading test run...</div>
      </div>
    );
  }

  // Handle error states with more detailed messages
  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="max-w-md text-center space-y-3">
          <div className="text-lg font-semibold text-red-600">
            Error Loading Test Run
          </div>
          <div className="text-sm text-gray-600">
            Failed to fetch test run data from the server.
          </div>
          <Link
            to="/"
            className="inline-block mt-4 text-blue-600 hover:text-blue-800 text-sm"
          >
            ← Back to Test Runs
          </Link>
        </div>
      </div>
    );
  }

  // Handle case where test run exists but has no tool results
  if (!hasData) {
    const hasComparisons = comparisons && comparisons.length > 0;
    const hasDrawings = testRun?.drawings && testRun.drawings.length > 0;

    return (
      <div className="flex items-center justify-center h-screen">
        <div className="max-w-md text-center space-y-3">
          <div className="text-lg font-semibold text-yellow-600">
            Incomplete Test Run Data
          </div>
          {hasComparisons && !tools.length ? (
            <div className="text-sm text-gray-600 space-y-2">
              <p>
                This test run exists but contains no tool results for the
                selected drawing.
              </p>
              <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-left">
                <div className="font-medium text-yellow-900 text-xs mb-1">
                  Possible reasons:
                </div>
                <ul className="text-xs text-yellow-800 list-disc list-inside space-y-1">
                  <li>The test run may still be processing</li>
                  <li>All processors failed for this drawing</li>
                  <li>The test run data may be corrupted</li>
                </ul>
              </div>
              {hasDrawings && totalDrawings > 1 && (
                <p className="text-xs text-blue-600">
                  Try selecting a different drawing above to see if it has results.
                </p>
              )}
            </div>
          ) : (
            <div className="text-sm text-gray-600">
              <p>No comparison data found for this test run.</p>
              <p className="text-xs mt-2">
                The test run may not have completed successfully.
              </p>
            </div>
          )}
          <Link
            to="/"
            className="inline-block mt-4 text-blue-600 hover:text-blue-800 text-sm"
          >
            ← Back to Test Runs
          </Link>
        </div>
      </div>
    );
  }

  // Format timestamp for display
  const startedAt = testRun ? new Date(testRun.startedAt) : new Date();
  const formattedDate = format(startedAt, 'PPpp');

  // Get the hovered bounding box
  let hoveredBBox: BoundingBox | null = null;
  if (hoveredIndex !== null && hoveredSide) {
    const boxes =
      hoveredSide === 'left' ? leftBoundingBoxes : rightBoundingBoxes;
    hoveredBBox = boxes[hoveredIndex] || null;
  }

  // Render compact dropdown helper
  const renderCompactDropdown = (
    value: string | null,
    onChange: (value: string) => void,
    label: string
  ) => (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-gray-600 whitespace-nowrap">
        {label}:
      </span>
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="text-sm py-1 px-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
      >
        {tools.map((tool, idx) => (
          <option key={`${label}-${tool}-${idx}`} value={tool}>
            {tool}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 overflow-hidden transition-all duration-300">
        {/* Collapsible Content */}
        <div
          className={`transition-all duration-300 ${
            headerCollapsed
              ? 'max-h-0 opacity-0 pointer-events-none'
              : 'max-h-96 opacity-100 px-6 pt-4'
          }`}
        >
          <div className="mb-4">
            <Link
              to="/"
              className="text-blue-600 hover:text-blue-800 text-sm mb-2 inline-block"
            >
              ← Back to Test Runs
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">
              {drawing?.fileName || 'Test Run Results'}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Test run from {formattedDate}
            </p>
          </div>

          {/* Drawing Selector (only shown when multiple drawings) */}
          {totalDrawings > 1 && (
            <div className="mb-4">
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Drawing ({selectedDrawingIndex + 1} of {totalDrawings})
              </label>
              <div className="flex gap-2 flex-wrap">
                {allDrawings.map((dwg, index) => (
                  <button
                    key={dwg.drawingId}
                    onClick={() => setSelectedDrawingIndex(index)}
                    className={`px-4 py-2 rounded-lg border-2 transition-all ${
                      selectedDrawingIndex === index
                        ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                        : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50'
                    }`}
                  >
                    <div className="text-sm">{dwg.fileName}</div>
                    <div className="text-xs text-gray-500">
                      {dwg.type} • {dwg.quality}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tool Selectors */}
          <div className="flex gap-8 mb-4">
            {/* Left Tool */}
            <div className="flex-1">
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Left Tool
              </label>
              <select
                value={leftTool || ''}
                onChange={(e) => setLeftTool(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {tools.map((tool, idx) => (
                  <option key={`left-${tool}-${idx}`} value={tool}>
                    {tool}
                  </option>
                ))}
              </select>
              {leftToolData && (
                <div className="flex gap-4 mt-2 text-sm text-gray-600">
                  <span>
                    {leftToolData.result.processingTime?.toFixed(0) || 0}ms
                  </span>
                  <span>
                    ¥{leftToolData.result.apiCost?.toFixed(2) || '0.00'}
                  </span>
                  {leftToolData.accuracy && (
                    <span>
                      CER:{' '}
                      {(leftToolData.accuracy.characterErrorRate * 100).toFixed(
                        2
                      )}
                      %
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Right Tool */}
            <div className="flex-1">
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Right Tool
              </label>
              <select
                value={rightTool || ''}
                onChange={(e) => setRightTool(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {tools.map((tool, idx) => (
                  <option key={`right-${tool}-${idx}`} value={tool}>
                    {tool}
                  </option>
                ))}
              </select>
              {rightToolData && (
                <div className="flex gap-4 mt-2 text-sm text-gray-600">
                  <span>
                    {rightToolData.result.processingTime?.toFixed(0) || 0}ms
                  </span>
                  <span>
                    ¥{rightToolData.result.apiCost?.toFixed(2) || '0.00'}
                  </span>
                  {rightToolData.accuracy && (
                    <span>
                      CER:{' '}
                      {(
                        rightToolData.accuracy.characterErrorRate * 100
                      ).toFixed(2)}
                      %
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Compact Controls Row (visible when collapsed) */}
        {headerCollapsed && (
          <div className="flex items-center justify-center gap-4 px-6 py-2">
            {/* Left Tool Compact Dropdown */}
            {renderCompactDropdown(leftTool, setLeftTool, 'Left')}

            {/* Collapse/Expand Button */}
            <button
              onClick={() => setHeaderCollapsed(!headerCollapsed)}
              className="p-1 hover:bg-gray-100 rounded transition-colors mx-2"
              title="Expand header"
            >
              <svg
                className="w-5 h-5 text-gray-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {/* Right Tool Compact Dropdown */}
            {renderCompactDropdown(rightTool, setRightTool, 'Right')}
          </div>
        )}

        {/* Centered Collapse/Expand Button (visible when expanded) */}
        {!headerCollapsed && (
          <div className="flex justify-center py-2">
            <button
              onClick={() => setHeaderCollapsed(!headerCollapsed)}
              className="p-1 hover:bg-gray-100 rounded transition-colors"
              title="Collapse header"
            >
              <svg
                className="w-5 h-5 text-gray-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 15l7-7 7 7"
                />
              </svg>
            </button>
          </div>
        )}

        {/* Always-Visible Display Control Toggles */}
        <div className="flex gap-6 px-6 pb-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showHighlights}
              onChange={(e) => setShowHighlights(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm font-medium">Show Highlights</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showGeminiIndicators}
              onChange={(e) => setShowGeminiIndicators(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm font-medium">Show Gemini</span>
          </label>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Split Canvas Area */}
        <div className="flex-1 flex gap-4 p-6 pb-16">
          {/* Left Canvas */}
          <div className="flex-1">
            {leftBoundingBoxes.length > 0 && imageUrl ? (
              <ImageCanvas
                ref={leftCanvasRef}
                imageUrl={imageUrl}
                boundingBoxes={leftBoundingBoxes}
                hoveredIndex={
                  hoveredSide === 'right'
                    ? hoveredIndex
                    : hoveredSide === 'left'
                      ? hoveredIndex
                      : null
                }
                onHover={handleLeftHover}
                selectedIndex={selectedIndex}
                onSelect={handleCanvasSelect}
                scrollToBboxIndex={
                  hoveredSide === 'left' ? scrollToBboxIndex : null
                }
                showGeminiIcons={showGeminiIndicators}
                showFill={showHighlights}
              />
            ) : (
              <div className="flex items-center justify-center h-full bg-white rounded-lg border border-gray-200">
                <div className="text-center text-gray-500 max-w-md px-6">
                  <div className="text-lg font-medium mb-2">
                    No Bounding Boxes
                  </div>
                  <div className="text-sm space-y-2">
                    {leftTool ? (
                      <>
                        <div className="font-medium text-gray-700 flex items-center gap-2">
                          {(leftTool === 'gemini-2.0-flash' ||
                            leftTool === 'gemini') && <WarningIcon size={16} />}
                          {leftTool === 'gemini-2.0-flash' ||
                          leftTool === 'gemini'
                            ? 'Gemini API Limitation'
                            : `No bounding box data for ${leftTool}`}
                        </div>
                        <div className="text-xs text-gray-500">
                          {leftTool === 'gemini-2.0-flash' ||
                          leftTool === 'gemini'
                            ? 'Gemini API does not provide bounding box data. Only text extraction is available.'
                            : leftToolData
                              ? 'This tool has result data but no bounding boxes. The test may have been run before bounding box support was added.'
                              : 'No result data available for this tool in this test run.'}
                        </div>
                        <div className="mt-3 text-xs bg-blue-50 border border-blue-200 rounded p-2 text-blue-800">
                          Check the Debug Info panel below to see which tools
                          have bounding box data
                        </div>
                      </>
                    ) : (
                      'Select a tool to view bounding boxes'
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Canvas */}
          <div className="flex-1">
            {rightBoundingBoxes.length > 0 && imageUrl ? (
              <ImageCanvas
                ref={rightCanvasRef}
                imageUrl={imageUrl}
                boundingBoxes={rightBoundingBoxes}
                hoveredIndex={
                  hoveredSide === 'left'
                    ? hoveredIndex
                    : hoveredSide === 'right'
                      ? hoveredIndex
                      : null
                }
                onHover={handleRightHover}
                selectedIndex={selectedIndex}
                onSelect={handleCanvasSelect}
                scrollToBboxIndex={
                  hoveredSide === 'right' ? scrollToBboxIndex : null
                }
                showGeminiIcons={showGeminiIndicators}
                showFill={showHighlights}
              />
            ) : (
              <div className="flex items-center justify-center h-full bg-white rounded-lg border border-gray-200">
                <div className="text-center text-gray-500 max-w-md px-6">
                  <div className="text-lg font-medium mb-2">
                    No Bounding Boxes
                  </div>
                  <div className="text-sm space-y-2">
                    {rightTool ? (
                      <>
                        <div className="font-medium text-gray-700 flex items-center gap-2">
                          {(rightTool === 'gemini-2.0-flash' ||
                            rightTool === 'gemini') && (
                            <WarningIcon size={16} />
                          )}
                          {rightTool === 'gemini-2.0-flash' ||
                          rightTool === 'gemini'
                            ? 'Gemini API Limitation'
                            : `No bounding box data for ${rightTool}`}
                        </div>
                        <div className="text-xs text-gray-500">
                          {rightTool === 'gemini-2.0-flash' ||
                          rightTool === 'gemini'
                            ? 'Gemini API does not provide bounding box data. Only text extraction is available.'
                            : rightToolData
                              ? 'This tool has result data but no bounding boxes. The test may have been run before bounding box support was added.'
                              : 'No result data available for this tool in this test run.'}
                        </div>
                        <div className="mt-3 text-xs bg-blue-50 border border-blue-200 rounded p-2 text-blue-800">
                          Check the Debug Info panel below to see which tools
                          have bounding box data
                        </div>
                      </>
                    ) : (
                      'Select a tool to view bounding boxes'
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar - Aggregate Stats */}
        <aside
          className={`bg-white border-l border-gray-200 overflow-auto transition-all duration-300 ${
            sidebarCollapsed ? 'w-12' : 'w-80'
          }`}
        >
          {sidebarCollapsed ? (
            /* Collapsed state - show vertical expand button */
            <div className="h-full flex items-center justify-center">
              <button
                onClick={() => setSidebarCollapsed(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="Expand sidebar"
              >
                <svg
                  className="w-5 h-5 text-gray-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
            </div>
          ) : (
            /* Expanded state - show full content */
            <div className="flex flex-col h-full">
              {/* Sidebar Header with Main Tabs and Collapse Button */}
              <div className="border-b border-gray-200 px-6 pt-4 pb-0">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-semibold">Analysis</h2>
                  <button
                    onClick={() => setSidebarCollapsed(true)}
                    className="p-1 hover:bg-gray-100 rounded transition-colors"
                    title="Collapse sidebar"
                  >
                    <svg
                      className="w-5 h-5 text-gray-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </button>
                </div>

                {/* Main Tabs */}
                <div className="flex gap-1">
                  <button
                    onClick={() => setSidebarMainTab('text')}
                    className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                      sidebarMainTab === 'text'
                        ? 'bg-white text-blue-600 border-b-2 border-blue-600'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    Text Results
                  </button>
                  <button
                    onClick={() => setSidebarMainTab('stats')}
                    className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                      sidebarMainTab === 'stats'
                        ? 'bg-white text-blue-600 border-b-2 border-blue-600'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    Statistics
                  </button>
                  <button
                    onClick={() => setSidebarMainTab('debug')}
                    className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                      sidebarMainTab === 'debug'
                        ? 'bg-white text-blue-600 border-b-2 border-blue-600'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    Debug
                  </button>
                </div>
              </div>

              {/* Scrollable Content Area */}
              <div className="flex-1 overflow-auto px-6 py-4">
                {/* Text Results Tab Content */}
                {sidebarMainTab === 'text' && leftTool && rightTool && (
                  <div>
                    {/* Tool Selector Tabs with Icons */}
                    <div className="flex gap-2 mb-4">
                      <button
                        onClick={() => setActiveTab('left')}
                        className={`flex-1 px-3 py-2 rounded-lg transition-all ${
                          activeTab === 'left'
                            ? 'bg-blue-600 text-white shadow-md'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                        title={leftTool}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-bold">
                            {getToolAbbreviation(leftTool)}
                          </span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${
                              activeTab === 'left'
                                ? 'bg-blue-500 text-white'
                                : 'bg-gray-200 text-gray-600'
                            }`}
                          >
                            {leftBoundingBoxes.length}
                          </span>
                        </div>
                      </button>
                      <button
                        onClick={() => setActiveTab('right')}
                        className={`flex-1 px-3 py-2 rounded-lg transition-all ${
                          activeTab === 'right'
                            ? 'bg-blue-600 text-white shadow-md'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                        title={rightTool}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-bold">
                            {getToolAbbreviation(rightTool)}
                          </span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${
                              activeTab === 'right'
                                ? 'bg-blue-500 text-white'
                                : 'bg-gray-200 text-gray-600'
                            }`}
                          >
                            {rightBoundingBoxes.length}
                          </span>
                        </div>
                      </button>
                    </div>

                    {/* Text Cards List */}
                    <TextCardsList
                      boundingBoxes={
                        activeTab === 'left'
                          ? leftBoundingBoxes
                          : rightBoundingBoxes
                      }
                      selectedIndex={selectedIndex}
                      onCardClick={(index) => {
                        setSelectedIndex(index);
                        setHoveredSide(activeTab);
                        setScrollToBboxIndex(index);
                        setHoveredIndex(index);

                        // Calculate and set fixed tooltip position at bbox location
                        const bbox =
                          activeTab === 'left'
                            ? leftBoundingBoxes[index]
                            : rightBoundingBoxes[index];
                        const canvasRef =
                          activeTab === 'left' ? leftCanvasRef : rightCanvasRef;
                        const screenPos = calculateBboxScreenPosition(
                          bbox,
                          canvasRef
                        );

                        if (screenPos) {
                          setFixedTooltipPos(screenPos);
                        }
                      }}
                      toolName={activeTab === 'left' ? leftTool : rightTool}
                    />
                  </div>
                )}

                {/* Statistics Tab Content */}
                {sidebarMainTab === 'stats' && (
                  <div>
                    <div className="space-y-4">
                      {aggregateStats.map((stats) => (
                        <div
                          key={stats.tool}
                          className="p-3 bg-gray-50 rounded-lg"
                        >
                          <div
                            className="font-medium text-sm text-gray-900 mb-2 truncate"
                            title={stats.tool}
                          >
                            {stats.tool}
                          </div>
                          <div className="space-y-1 text-xs text-gray-600">
                            <div className="flex justify-between">
                              <span>Avg CER:</span>
                              <span className="font-medium">
                                {(stats.avgCER * 100).toFixed(2)}%
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>Avg Accuracy:</span>
                              <span className="font-medium">
                                {stats.avgAccuracy.toFixed(1)}%
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>Avg Time:</span>
                              <span className="font-medium">
                                {stats.avgProcessingTime.toFixed(0)}ms
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>Total Cost:</span>
                              <span className="font-medium">
                                ¥{stats.totalCost.toFixed(2)}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>Samples:</span>
                              <span className="font-medium">{stats.count}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Recommended Tool */}
                    {testRun.summary.recommendedTool && (
                      <div className="mt-6 pt-6 border-t border-gray-200">
                        <div className="text-sm font-medium text-gray-700 mb-2">
                          Recommended Tool
                        </div>
                        <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                          <div className="text-sm font-semibold text-green-900">
                            {testRun.summary.recommendedTool}
                          </div>
                          <div className="text-xs text-green-700 mt-1">
                            Best overall performance
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Debug Tab Content */}
                {sidebarMainTab === 'debug' && (
                  <div className="space-y-3 text-xs">
                    {/* Test Run Metadata */}
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="font-semibold text-blue-900 mb-2">
                        Test Run
                      </div>
                      <div className="space-y-1 text-blue-800">
                        <div
                          className="font-mono text-[10px] truncate"
                          title={testRun.id}
                        >
                          ID: {testRun.id}
                        </div>
                        <div>Started: {formattedDate}</div>
                        <div className="flex items-center gap-1">
                          Status:{' '}
                          {testRun.completed && <CheckmarkIcon size={12} />}
                          {testRun.completed ? 'Complete' : 'In Progress'}
                        </div>
                      </div>
                    </div>

                    {/* Bounding Box Info */}
                    <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
                      <div className="font-semibold text-purple-900 mb-2">
                        Bounding Boxes
                      </div>
                      <div className="space-y-1 text-purple-800">
                        <div className="flex justify-between">
                          <span>{leftTool || 'None'}:</span>
                          <span className="font-medium">
                            {leftBoundingBoxes.length > 0
                              ? `${leftBoundingBoxes.length} boxes`
                              : 'No data'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>{rightTool || 'None'}:</span>
                          <span className="font-medium">
                            {rightBoundingBoxes.length > 0
                              ? `${rightBoundingBoxes.length} boxes`
                              : 'No data'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* All Tools BBox Summary */}
                    <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                      <div className="font-semibold text-gray-900 mb-2">
                        All Tools
                      </div>
                      <div className="space-y-1 text-gray-700 max-h-40 overflow-auto">
                        {comparisons[0]?.tools.map((toolData) => (
                          <div
                            key={toolData.tool}
                            className="flex justify-between text-[10px]"
                          >
                            <span
                              className="truncate max-w-[120px]"
                              title={toolData.tool}
                            >
                              {toolData.tool}
                            </span>
                            <span
                              className={`font-medium ${
                                (toolData.result.boundingBoxes?.length || 0) > 0
                                  ? 'text-green-600'
                                  : 'text-red-600'
                              }`}
                            >
                              {toolData.result.boundingBoxes?.length || 0} boxes
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Drawing Info */}
                    {drawing && (
                      <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <div className="font-semibold text-yellow-900 mb-2">
                          Drawing
                        </div>
                        <div className="space-y-1 text-yellow-800 text-[10px]">
                          <div className="truncate" title={drawing.fileName}>
                            {drawing.fileName}
                          </div>
                          <div
                            className="font-mono truncate"
                            title={drawing.filePath}
                          >
                            {drawing.filePath}
                          </div>
                          <div>
                            Type: {drawing.type} | Quality: {drawing.quality}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Tooltip - use fixed position when available, otherwise follow cursor */}
      {hoveredBBox && (
        <Tooltip bbox={hoveredBBox} position={fixedTooltipPos || mousePos} />
      )}
    </div>
  );
}
