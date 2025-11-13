import { useRef, useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { format } from 'date-fns';
import { ImageCanvas, type ImageCanvasRef } from '../components/ImageCanvas';
import { Tooltip } from '../components/Tooltip';
import { TextCardsList } from '../components/TextCardsList';
import { TextEditModal } from '../components/TextEditModal';
import { SaveConfirmModal } from '../components/SaveConfirmModal';
import { UnsavedChangesPrompt } from '../components/UnsavedChangesPrompt';
import { ConfidentialBadge } from '../components/ConfidentialBadge';
import { VerificationProgress } from '../components/VerificationProgress';
import { VerificationControls } from '../components/VerificationControls';
import { MissingTextPanel } from '../components/MissingTextPanel';
import type { BoundingBox } from '../types/api';
import { CheckmarkIcon, WarningIcon } from '../components/icons';
import {
  getToolAbbreviation,
  calculateBboxScreenPosition,
} from '../utils/testRunHelpers';
import { filterProcessorsForConfidential } from '../utils/processorInfo';
import { useTestRunData } from '../hooks/useTestRunData';
import { useTestRunUI } from '../hooks/useTestRunUI';
import { useTestRunEditor } from '../hooks/useTestRunEditor';
import {
  useVerificationStats,
  useVerifyBBox,
  useAddMissingText,
  useDeleteMissingText,
} from '../api/queries';

export function TestRunViewer() {
  const { testRunId } = useParams<{ testRunId: string }>();

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

  const {
    hoveredIndex,
    hoveredSide,
    setHoveredIndex,
    setHoveredSide,
    handleLeftHover,
    handleRightHover,
    selectedIndex,
    setSelectedIndex,
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
    viewMode,
    toggleViewMode,
    isFullscreen,
    toggleFullscreen,
    allowZoomOut,
    setAllowZoomOut,
  } = useTestRunUI();

  const leftCanvasRef = useRef<ImageCanvasRef>(null);
  const rightCanvasRef = useRef<ImageCanvasRef>(null);

  const [searchQuery, setSearchQuery] = useState('');

  // Check if this is a confidential document
  const isConfidential = leftToolData?.isConfidential || false;

  // Filter tools for confidential documents
  const availableTools = isConfidential ? filterProcessorsForConfidential(tools) : tools;

  // Memoize editor initial bboxes to maintain stable reference
  const editorInitialBBoxes = useMemo(
    () => (viewMode === 'single' ? leftBoundingBoxes : []),
    [viewMode, leftBoundingBoxes]
  );

  // Editor hook (only for single view mode with left tool)
  const editor = useTestRunEditor(
    editorInitialBBoxes,
    viewMode === 'single' ? leftToolData?.result?.id : undefined
  );

  // Verification hooks (for confidential documents)
  const resultId = viewMode === 'single' ? leftToolData?.result?.id : undefined;
  const { data: verificationData } = useVerificationStats(resultId);
  const verifyBBox = useVerifyBBox();
  const addMissingText = useAddMissingText();
  const deleteMissingText = useDeleteMissingText();

  const verificationStats = verificationData?.data;

  // Verification handlers
  const handleVerifyBBox = (bboxIndex: number, status: 'correct' | 'incorrect') => {
    if (!resultId) return;
    verifyBBox.mutate({ resultId, bboxIndex, status });
  };

  const handleAddMissingText = (text: string, notes?: string) => {
    if (!resultId) return;
    addMissingText.mutate({ resultId, text, notes });
  };

  const handleDeleteMissingText = (missingTextId: string) => {
    if (!resultId) return;
    deleteMissingText.mutate({ resultId, missingTextId });
  };

  // Verification navigation
  const handleVerificationNavigate = (direction: 'prev' | 'next') => {
    if (selectedIndex === null) return;
    const newIndex = direction === 'prev' ? selectedIndex - 1 : selectedIndex + 1;
    if (newIndex >= 0 && newIndex < leftBoundingBoxes.length) {
      setSelectedIndex(newIndex);
      setScrollToBboxIndex(newIndex);
    }
  };

  // Wrap handleCanvasSelect to exit resize mode when selecting a different bbox
  const handleCanvasSelectWithResizeExit = (index: number | null) => {
    handleCanvasSelect(index);
    if (editor.isEditMode) {
      editor.exitResizeMode();
    }
  };

  // Get image element for modal preview
  const [imageElement, setImageElement] = useState<HTMLImageElement | null>(null);

  // Load image element for preview in modals
  if (imageUrl && !imageElement) {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // Enable CORS for canvas export
    img.src = imageUrl;
    img.onload = () => setImageElement(img);
  }

  const filterBoundingBoxes = (boxes: BoundingBox[], query: string): BoundingBox[] => {
    if (!query.trim()) return boxes;
    const lowerQuery = query.toLowerCase();
    return boxes.filter(
      (box) =>
        box.text.toLowerCase().includes(lowerQuery) ||
        box.metadata?.originalText?.toLowerCase().includes(lowerQuery)
    );
  };

  // Apply filtering to bounding boxes
  const filteredLeftBoundingBoxes = filterBoundingBoxes(leftBoundingBoxes, searchQuery);
  const filteredRightBoundingBoxes = filterBoundingBoxes(rightBoundingBoxes, searchQuery);

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
        {availableTools.map((tool, idx) => (
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
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">
                {drawing?.fileName || 'Test Run Results'}
              </h1>
              {isConfidential && <ConfidentialBadge size="large" />}
            </div>
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
            {/* Left Tool (or Single Tool when in single mode) */}
            <div className={viewMode === 'single' ? 'w-full max-w-md' : 'flex-1'}>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                {viewMode === 'single' ? 'Tool' : 'Left Tool'}
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

            {/* Right Tool (only visible in comparison mode) */}
            {viewMode === 'comparison' && (
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
            )}
          </div>
        </div>

        {/* Compact Controls Row (visible when collapsed) */}
        {headerCollapsed && (
          <div className="flex items-center justify-center gap-4 px-6 py-2">
            {/* Back to Test Runs Link */}
            <Link
              to="/"
              className="text-blue-600 hover:text-blue-800 text-sm font-medium whitespace-nowrap"
            >
              ← Back to Test Runs
            </Link>

            {/* Drawing Selector (only shown when multiple drawings) */}
            {totalDrawings > 1 && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-600 whitespace-nowrap">
                  Drawing:
                </span>
                <select
                  value={selectedDrawingIndex}
                  onChange={(e) => setSelectedDrawingIndex(Number(e.target.value))}
                  className="text-sm py-1 px-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  {allDrawings.map((dwg, index) => (
                    <option key={dwg.drawingId} value={index}>
                      {dwg.fileName} ({index + 1}/{totalDrawings})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Left Tool Compact Dropdown (or Single Tool in single mode) */}
            {renderCompactDropdown(leftTool, setLeftTool, viewMode === 'single' ? 'Tool' : 'Left')}

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

            {/* Right Tool Compact Dropdown (only in comparison mode) */}
            {viewMode === 'comparison' && renderCompactDropdown(rightTool, setRightTool, 'Right')}
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
        <div className="flex gap-6 px-6 pb-4 items-center">
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

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={allowZoomOut}
              onChange={(e) => setAllowZoomOut(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm font-medium">Allow Zoom Out</span>
          </label>

          {/* Edit Mode Toggle (only in single view) */}
          {viewMode === 'single' && (
            <button
              onClick={editor.toggleEditMode}
              className={`ml-auto px-4 py-2 border-2 rounded-lg transition-colors flex items-center gap-2 ${
                editor.isEditMode
                  ? 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700'
                  : 'bg-white border-gray-300 hover:bg-gray-50'
              }`}
              title={editor.isEditMode ? 'Exit edit mode' : 'Enter edit mode'}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
              <span className="text-sm font-medium">
                {editor.isEditMode ? 'Edit Mode: ON' : 'Edit Mode'}
              </span>
            </button>
          )}

          {/* Save/Discard Buttons (when edit mode is active with changes) */}
          {editor.isEditMode && editor.isDirty && (
            <>
              <button
                onClick={editor.handleSaveClick}
                disabled={editor.isSaving}
                className="px-4 py-2 bg-green-600 text-white border-2 border-green-600 rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Save changes"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
                  />
                </svg>
                <span className="text-sm font-medium">
                  Save ({editor.changes.length})
                </span>
              </button>
              <button
                onClick={editor.handleDiscardChanges}
                disabled={editor.isSaving}
                className="px-4 py-2 bg-red-600 text-white border-2 border-red-600 rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Discard all changes"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
                <span className="text-sm font-medium">Discard</span>
              </button>
            </>
          )}

          {/* View Mode Toggle */}
          <button
            onClick={toggleViewMode}
            disabled={editor.isEditMode}
            className={`px-4 py-2 bg-white border-2 border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2 ${
              editor.isEditMode ? 'opacity-50 cursor-not-allowed' : ''
            } ${viewMode === 'single' ? '' : 'ml-auto'}`}
            title={
              editor.isEditMode
                ? 'Exit edit mode to switch views'
                : `Switch to ${viewMode === 'single' ? 'comparison' : 'single'} view`
            }
          >
            {viewMode === 'single' ? (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 4H5a1 1 0 00-1 1v4m0 0l3-3m-3 3l3 3m6-9h4a1 1 0 011 1v4m0 0l-3-3m3 3l-3 3m-6 6H5a1 1 0 01-1-1v-4m0 0l3 3m-3-3l3-3m6 6h4a1 1 0 001-1v-4m0 0l-3 3m3-3l-3-3" />
                </svg>
                <span className="text-sm font-medium">Comparison View</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5h16M4 12h16M4 19h16" />
                </svg>
                <span className="text-sm font-medium">Single View</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Unsaved Changes Prompt */}
      <UnsavedChangesPrompt when={editor.isDirty} />

      <div className="flex-1 flex overflow-hidden">
        {/* Canvas Area - Conditional rendering based on view mode */}
        <div className="flex-1 flex gap-4 p-6 pb-16">
          {viewMode === 'single' ? (
            /* Single Canvas View */
            <div className="flex-1 relative">
              {/* Fullscreen Toggle Button */}
              {leftBoundingBoxes.length > 0 && imageUrl && (
                <button
                  onClick={toggleFullscreen}
                  className="absolute top-4 right-4 z-10 px-3 py-2 bg-white/90 backdrop-blur-sm border border-gray-300 rounded-lg hover:bg-white transition-all shadow-lg flex items-center gap-2"
                  title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                >
                  {isFullscreen ? (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      <span className="text-xs font-medium">Exit Fullscreen</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                      </svg>
                      <span className="text-xs font-medium">Fullscreen</span>
                    </>
                  )}
                </button>
              )}
              {leftBoundingBoxes.length > 0 && imageUrl ? (
                <ImageCanvas
                  ref={leftCanvasRef}
                  imageUrl={imageUrl}
                  boundingBoxes={
                    editor.isEditMode ? editor.currentBBoxes : leftBoundingBoxes
                  }
                  hoveredIndex={hoveredIndex}
                  onHover={handleLeftHover}
                  selectedIndex={selectedIndex}
                  onSelect={handleCanvasSelectWithResizeExit}
                  scrollToBboxIndex={scrollToBboxIndex}
                  showGeminiIcons={showGeminiIndicators}
                  showFill={showHighlights}
                  enablePanning={!editor.isEditMode}
                  allowZoomOut={allowZoomOut}
                  isEditMode={editor.isEditMode}
                  isResizeMode={editor.isResizeMode}
                  onBBoxMove={editor.modifyBBox}
                  onBBoxResize={editor.modifyBBox}
                  onBBoxCreate={editor.handleBBoxCreate}
                  onBBoxDoubleClick={editor.openEditModal}
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
          ) : (
            /* Comparison View - Two Canvases Side by Side */
            <>
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
                    allowZoomOut={allowZoomOut}
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
                    allowZoomOut={allowZoomOut}
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
            </>
          )}
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
                  {/* Verification tab - only for confidential documents in single view */}
                  {isConfidential && viewMode === 'single' && (
                    <button
                      onClick={() => setSidebarMainTab('verification')}
                      className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                        sidebarMainTab === 'verification'
                          ? 'bg-white text-blue-600 border-b-2 border-blue-600'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                      }`}
                    >
                      Verification
                    </button>
                  )}
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
                {sidebarMainTab === 'text' && leftTool && (viewMode === 'single' || rightTool) && (
                  <div>
                    {viewMode === 'comparison' ? (
                      /* Comparison Mode: Show tabs for left/right tools */
                      <>
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
                            title={rightTool || ''}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-bold">
                                {rightTool ? getToolAbbreviation(rightTool) : ''}
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

                        {/* Search Input */}
                        <div className="mb-4">
                          <div className="relative">
                            <svg
                              className="w-4 h-4 absolute left-3 top-3 text-gray-400 pointer-events-none"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                              />
                            </svg>
                            <input
                              type="text"
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              placeholder="Search text..."
                              className="w-full px-3 py-2 pl-9 pr-8 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            {searchQuery && (
                              <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-600 transition-colors"
                                title="Clear search"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {activeTab === 'left'
                              ? `${filteredLeftBoundingBoxes.length} of ${leftBoundingBoxes.length} items`
                              : `${filteredRightBoundingBoxes.length} of ${rightBoundingBoxes.length} items`}
                          </div>
                        </div>

                        {/* Text Cards List */}
                        <TextCardsList
                          boundingBoxes={
                            activeTab === 'left'
                              ? filteredLeftBoundingBoxes
                              : filteredRightBoundingBoxes
                          }
                          selectedIndex={selectedIndex}
                          onCardClick={(filteredIndex) => {
                            // Get bbox from filtered array
                            const filteredBoxes =
                              activeTab === 'left'
                                ? filteredLeftBoundingBoxes
                                : filteredRightBoundingBoxes;
                            const bbox = filteredBoxes[filteredIndex];

                            // Find original index in unfiltered array
                            const originalBoxes =
                              activeTab === 'left'
                                ? leftBoundingBoxes
                                : rightBoundingBoxes;
                            const originalIndex = originalBoxes.findIndex(
                              (b) => b.text === bbox.text && b.bounds === bbox.bounds
                            );

                            if (originalIndex !== -1) {
                              setSelectedIndex(originalIndex);
                              setHoveredSide(activeTab);
                              setScrollToBboxIndex(originalIndex);
                              setHoveredIndex(originalIndex);

                              // Calculate and set fixed tooltip position at bbox location
                              const canvasRef =
                                activeTab === 'left' ? leftCanvasRef : rightCanvasRef;
                              const screenPos = calculateBboxScreenPosition(
                                bbox,
                                canvasRef
                              );

                              if (screenPos) {
                                setFixedTooltipPos(screenPos);
                              }
                            }
                          }}
                          toolName={activeTab === 'left' ? leftTool : (rightTool || '')}
                        />
                      </>
                    ) : (
                      /* Single Mode: Show only the selected tool's text */
                      <>
                        {/* Tool Name Header */}
                        <div className="mb-4 px-3 py-2 bg-blue-50 rounded-lg border border-blue-200">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-bold text-blue-900">
                              {leftTool}
                            </span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-200 text-blue-800">
                              {leftBoundingBoxes.length} items
                            </span>
                          </div>
                        </div>

                        {/* Search Input */}
                        <div className="mb-4">
                          <div className="relative">
                            <svg
                              className="w-4 h-4 absolute left-3 top-3 text-gray-400 pointer-events-none"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                              />
                            </svg>
                            <input
                              type="text"
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              placeholder="Search text..."
                              className="w-full px-3 py-2 pl-9 pr-8 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            {searchQuery && (
                              <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-600 transition-colors"
                                title="Clear search"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {filteredLeftBoundingBoxes.length} of {leftBoundingBoxes.length} items
                          </div>
                        </div>

                        {/* Text Cards List */}
                        <TextCardsList
                          boundingBoxes={
                            editor.isEditMode
                              ? filterBoundingBoxes(editor.currentBBoxes, searchQuery)
                              : filteredLeftBoundingBoxes
                          }
                          selectedIndex={selectedIndex}
                          onCardClick={(filteredIndex) => {
                            // Get bbox from filtered array
                            const displayBoxes = editor.isEditMode
                              ? filterBoundingBoxes(editor.currentBBoxes, searchQuery)
                              : filteredLeftBoundingBoxes;
                            const bbox = displayBoxes[filteredIndex];

                            // Find original index in unfiltered array
                            const unfilteredBoxes = editor.isEditMode
                              ? editor.currentBBoxes
                              : leftBoundingBoxes;
                            const originalIndex = unfilteredBoxes.findIndex(
                              (b) => b.text === bbox.text && b.bounds === bbox.bounds
                            );

                            if (originalIndex !== -1) {
                              setSelectedIndex(originalIndex);
                              setHoveredSide('left');
                              setScrollToBboxIndex(originalIndex);
                              setHoveredIndex(originalIndex);

                              // Calculate and set fixed tooltip position at bbox location
                              const screenPos = calculateBboxScreenPosition(
                                bbox,
                                leftCanvasRef
                              );

                              if (screenPos) {
                                setFixedTooltipPos(screenPos);
                              }
                            }
                          }}
                          toolName={leftTool}
                          isEditMode={editor.isEditMode}
                          resizingBBoxIndex={editor.resizingBBoxIndex}
                          onEditText={editor.openEditModal}
                          onApproveBBox={editor.approveBBox}
                          onDeleteBBox={editor.deleteBBox}
                          onAdjustBounds={(index) => {
                            // Select bbox, scroll to it, and toggle resize mode
                            setSelectedIndex(index);
                            setScrollToBboxIndex(index);
                            editor.toggleResizeMode(index);
                          }}
                        />
                      </>
                    )}
                  </div>
                )}

                {/* Verification Tab Content (Confidential Documents Only) */}
                {sidebarMainTab === 'verification' && isConfidential && verificationStats && (
                  <div className="space-y-4">
                    {/* Verification Progress */}
                    <VerificationProgress
                      totalBboxes={verificationStats.totalBboxes}
                      verifiedCount={verificationStats.verifiedCount}
                      correctCount={verificationStats.correctCount}
                      incorrectCount={verificationStats.incorrectCount}
                      missingTextCount={verificationStats.missingTextCount}
                    />

                    {/* Verification Controls */}
                    {selectedIndex !== null && selectedIndex < leftBoundingBoxes.length && (
                      <VerificationControls
                        currentIndex={selectedIndex}
                        totalBboxes={leftBoundingBoxes.length}
                        currentVerificationStatus={
                          verificationStats.verifications[selectedIndex]?.status
                        }
                        onVerify={(status) => handleVerifyBBox(selectedIndex, status)}
                        onNavigate={handleVerificationNavigate}
                        disabled={false}
                      />
                    )}

                    {/* Missing Text Panel */}
                    <MissingTextPanel
                      missingTexts={verificationStats.missingTexts}
                      onAdd={handleAddMissingText}
                      onDelete={handleDeleteMissingText}
                      disabled={false}
                    />

                    {/* Instructions */}
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-900">
                      <h4 className="font-semibold mb-1">How to verify:</h4>
                      <ul className="space-y-1 text-xs">
                        <li>• Click a bbox on the canvas or in the Text Results tab</li>
                        <li>• Press <kbd className="px-1 py-0.5 bg-blue-200 rounded">C</kbd> for correct or <kbd className="px-1 py-0.5 bg-blue-200 rounded">I</kbd> for incorrect</li>
                        <li>• Use arrow keys (← →) to navigate between bboxes</li>
                        <li>• Add missing text that the OCR didn't detect</li>
                      </ul>
                    </div>
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

      {/* Fullscreen Overlay */}
      {isFullscreen && viewMode === 'single' && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">
          {/* Fullscreen Header */}
          <div className="flex items-center justify-between px-6 py-4 bg-black/50 backdrop-blur-sm">
            <div className="text-white">
              <h2 className="text-lg font-semibold">{leftTool}</h2>
              <p className="text-sm text-gray-300">{drawing?.fileName}</p>
            </div>
            <button
              onClick={toggleFullscreen}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span className="font-medium">Exit Fullscreen (Esc)</span>
            </button>
          </div>

          {/* Fullscreen Canvas */}
          <div className="flex-1 p-6 overflow-auto">
            {leftBoundingBoxes.length > 0 && imageUrl ? (
              <ImageCanvas
                ref={leftCanvasRef}
                imageUrl={imageUrl}
                boundingBoxes={leftBoundingBoxes}
                hoveredIndex={hoveredIndex}
                onHover={handleLeftHover}
                selectedIndex={selectedIndex}
                onSelect={handleCanvasSelect}
                scrollToBboxIndex={scrollToBboxIndex}
                showGeminiIcons={showGeminiIndicators}
                showFill={showHighlights}
                enablePanning={true}
                allowZoomOut={allowZoomOut}
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center text-gray-400">
                  <div className="text-lg font-medium mb-2">No Bounding Boxes</div>
                  <div className="text-sm">No data available for fullscreen view</div>
                </div>
              </div>
            )}
          </div>

          {/* Zoom Indicator */}
          {leftCanvasRef.current && (
            <div className="absolute bottom-6 left-6 px-3 py-2 bg-white/10 backdrop-blur-sm rounded-lg text-white text-sm">
              Zoom: {Math.round((leftCanvasRef.current.getTransform?.()?.scale || 1) * 100)}%
            </div>
          )}
        </div>
      )}

      {/* Tooltip - use fixed position when available, otherwise follow cursor */}
      {hoveredBBox && !isFullscreen && (
        <Tooltip bbox={hoveredBBox} position={fixedTooltipPos || mousePos} />
      )}

      {/* Edit Modals */}
      <TextEditModal
        isOpen={editor.editModalOpen}
        bbox={
          editor.editingIndex !== null
            ? editor.currentBBoxes[editor.editingIndex]
            : null
        }
        imageElement={imageElement}
        onSave={editor.handleSaveText}
        onCancel={editor.closeEditModal}
        onDelete={editor.handleDeleteFromModal}
      />

      <SaveConfirmModal
        isOpen={editor.saveModalOpen}
        changes={editor.changes}
        onConfirm={editor.handleConfirmSave}
        onCancel={editor.handleCancelSave}
        isSaving={editor.isSaving}
      />
    </div>
  );
}
