import { useState, useEffect, useMemo } from 'react';
import { useTestRun } from '../api/queries';
import { apiClient } from '../api/client';
import type { BoundingBox } from '../types/api';

/**
 * Custom hook to manage test run data and tool selection
 */
export function useTestRunData(testRunId: string | undefined) {
  const { data, isLoading, error } = useTestRun(testRunId);
  const [leftTool, setLeftTool] = useState<string | null>(null);
  const [rightTool, setRightTool] = useState<string | null>(null);
  const [selectedDrawingIndex, setSelectedDrawingIndex] = useState<number>(0);

  const testRun = data?.data?.testRun;
  const comparisons = data?.data?.comparisons;
  const aggregateStats = data?.data?.aggregateStats;

  const totalDrawings = testRun?.drawings?.length || 0;

  const validDrawingIndex = Math.min(selectedDrawingIndex, totalDrawings - 1);

  const drawing = testRun?.drawings?.[validDrawingIndex];

  const currentDrawing = drawing && comparisons
    ? comparisons.find(c => c.drawingId === drawing.drawingId)
    : null;

  // Memoize tools array to prevent recreating on every render
  const tools = useMemo(() => {
    return (currentDrawing?.tools && currentDrawing.tools.length > 0)
      ? currentDrawing.tools.map((t) => t.tool)
      : [];
  }, [currentDrawing?.tools]);

  const hasData = !!(
    drawing &&
    currentDrawing &&
    currentDrawing.tools &&
    currentDrawing.tools.length > 0
  );


  useEffect(() => {
    if (tools.length > 0 && !leftTool) {
      setLeftTool(tools[0]);
    }
    if (tools.length > 1 && !rightTool) {
      setRightTool(tools[1]);
    }
  }, [tools, leftTool, rightTool]);

  const leftToolData = currentDrawing?.tools.find((t) => t.tool === leftTool);
  const rightToolData = currentDrawing?.tools.find((t) => t.tool === rightTool);

  // Memoize bounding boxes to maintain stable references and prevent infinite loops
  const leftBoundingBoxes: BoundingBox[] = useMemo(
    () => leftToolData?.result.boundingBoxes || [],
    [leftToolData?.result.boundingBoxes]
  );
  const rightBoundingBoxes: BoundingBox[] = useMemo(
    () => rightToolData?.result.boundingBoxes || [],
    [rightToolData?.result.boundingBoxes]
  );

  const imageUrl = drawing ? apiClient.getImageURL(drawing.filePath) : '';

  return {
    // API data
    testRun,
    comparisons,
    aggregateStats,
    isLoading,
    error,
    hasData,

    // Tool selection
    tools,
    leftTool,
    rightTool,
    setLeftTool,
    setRightTool,

    // Tool data
    leftToolData,
    rightToolData,
    leftBoundingBoxes,
    rightBoundingBoxes,

    // Drawing data
    drawing,
    imageUrl,

    // Drawing navigation
    selectedDrawingIndex: validDrawingIndex,
    setSelectedDrawingIndex,
    totalDrawings,
    allDrawings: testRun?.drawings || [],
  };
}
