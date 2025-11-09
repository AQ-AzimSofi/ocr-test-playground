import { useState, useEffect } from 'react';

/**
 * Custom hook to manage test run viewer UI state
 */
export function useTestRunUI() {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [hoveredSide, setHoveredSide] = useState<'left' | 'right' | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [showHighlights, setShowHighlights] = useState(true);
  const [showGeminiIndicators, setShowGeminiIndicators] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const [sidebarMainTab, setSidebarMainTab] = useState<'text' | 'stats' | 'debug'>('text');
  const [activeTab, setActiveTab] = useState<'left' | 'right'>('left');
  const [scrollToBboxIndex, setScrollToBboxIndex] = useState<number | null>(null);
  const [fixedTooltipPos, setFixedTooltipPos] = useState<{ x: number; y: number } | null>(null);

  // Track mouse position globally
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Auto-enable Show Highlights when Show Gemini is checked
  useEffect(() => {
    if (showGeminiIndicators && !showHighlights) {
      setShowHighlights(true);
    }
  }, [showGeminiIndicators, showHighlights]);

  // Handle hover with sync - clear fixed tooltip when hovering canvas
  const handleLeftHover = (index: number | null) => {
    setHoveredIndex(index);
    setHoveredSide(index !== null ? 'left' : null);
    if (fixedTooltipPos) {
      setFixedTooltipPos(null);
    }
  };

  const handleRightHover = (index: number | null) => {
    setHoveredIndex(index);
    setHoveredSide(index !== null ? 'right' : null);
    if (fixedTooltipPos) {
      setFixedTooltipPos(null);
    }
  };

  // Handle canvas click - clear fixed tooltip when clicking canvas directly
  const handleCanvasSelect = (index: number | null) => {
    setSelectedIndex(index);
    if (fixedTooltipPos) {
      setFixedTooltipPos(null);
    }
  };

  return {
    // Hover state
    hoveredIndex,
    hoveredSide,
    setHoveredIndex,
    setHoveredSide,
    handleLeftHover,
    handleRightHover,

    // Selection state
    selectedIndex,
    setSelectedIndex,
    handleCanvasSelect,

    // Mouse tracking
    mousePos,

    // Display preferences
    showHighlights,
    setShowHighlights,
    showGeminiIndicators,
    setShowGeminiIndicators,

    // Layout state
    sidebarCollapsed,
    setSidebarCollapsed,
    headerCollapsed,
    setHeaderCollapsed,
    sidebarMainTab,
    setSidebarMainTab,
    activeTab,
    setActiveTab,

    // Scroll/tooltip state
    scrollToBboxIndex,
    setScrollToBboxIndex,
    fixedTooltipPos,
    setFixedTooltipPos,
  };
}
