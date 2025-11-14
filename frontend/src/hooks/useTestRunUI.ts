import { useState, useEffect, useRef } from 'react';

export function useTestRunUI() {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [hoveredSide, setHoveredSide] = useState<'left' | 'right' | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [showHighlights, setShowHighlights] = useState(true);
  const [showGeminiIndicators, setShowGeminiIndicators] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [headerCollapsed, setHeaderCollapsed] = useState(true);
  const [sidebarMainTab, setSidebarMainTab] = useState<'text' | 'stats' | 'debug' | 'verification'>('text');
  const [activeTab, setActiveTab] = useState<'left' | 'right'>('left');
  const [scrollToBboxIndex, setScrollToBboxIndex] = useState<number | null>(null);
  const [fixedTooltipPos, setFixedTooltipPos] = useState<{ x: number; y: number } | null>(null);

  const [viewMode, setViewMode] = useState<'single' | 'comparison'>('single');
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [allowZoomOut, setAllowZoomOut] = useState(false);

  // Throttle mouse position updates to prevent excessive re-renders
  const rafIdRef = useRef<number | null>(null);
  const lastUpdateRef = useRef<number>(0);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const now = Date.now();

      // Throttle to max 60fps (16ms between updates)
      if (now - lastUpdateRef.current < 16) {
        // Cancel any pending update
        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current);
        }

        // Schedule update for next frame
        rafIdRef.current = requestAnimationFrame(() => {
          lastUpdateRef.current = Date.now();
          setMousePos({ x: e.clientX, y: e.clientY });
          rafIdRef.current = null;
        });
      } else {
        // Update immediately if enough time has passed
        lastUpdateRef.current = now;
        setMousePos({ x: e.clientX, y: e.clientY });
      }
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (showGeminiIndicators && !showHighlights) {
      setShowHighlights(true);
    }
  }, [showGeminiIndicators, showHighlights]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

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

  const handleCanvasSelect = (index: number | null) => {
    setSelectedIndex(index);
    if (fixedTooltipPos) {
      setFixedTooltipPos(null);
    }
  };

  const toggleViewMode = () => {
    setViewMode(prev => prev === 'single' ? 'comparison' : 'single');
  };

  const toggleFullscreen = () => {
    setIsFullscreen(prev => !prev);
  };

  return {
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
    viewMode,
    setViewMode,
    toggleViewMode,
    isFullscreen,
    setIsFullscreen,
    toggleFullscreen,
    allowZoomOut,
    setAllowZoomOut,
    scrollToBboxIndex,
    setScrollToBboxIndex,
    fixedTooltipPos,
    setFixedTooltipPos,
  };
}
