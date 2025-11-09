import { useState, useEffect } from 'react';
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

  // Extract comparison data
  const testRun = data?.data?.testRun;
  const comparisons = data?.data?.comparisons;
  const aggregateStats = data?.data?.aggregateStats;

  // Check if data is available
  const hasData = !!(comparisons && comparisons.length > 0 && comparisons[0].tools);
  const firstDrawing = hasData ? comparisons[0] : null;
  const tools = firstDrawing?.tools.map((t) => t.tool) || [];

  // Auto-select first two tools when data loads
  useEffect(() => {
    if (tools.length > 0 && !leftTool) {
      setLeftTool(tools[0]);
    }
    if (tools.length > 1 && !rightTool) {
      setRightTool(tools[1]);
    }
  }, [tools, leftTool, rightTool]);

  // Get result data for selected tools
  const leftToolData = firstDrawing?.tools.find((t) => t.tool === leftTool);
  const rightToolData = firstDrawing?.tools.find((t) => t.tool === rightTool);

  // Get bounding boxes from API response
  const leftBoundingBoxes: BoundingBox[] =
    leftToolData?.result.boundingBoxes || [];
  const rightBoundingBoxes: BoundingBox[] =
    rightToolData?.result.boundingBoxes || [];

  // Get drawing info
  const drawing = testRun?.drawings?.[0];
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
  };
}
