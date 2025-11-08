/**
 * Get color based on confidence score
 * Green (≥95%) → Yellow (85-95%) → Orange (75-85%) → Red (<75%)
 */
export function getConfidenceColor(confidence: number | undefined, alpha: number = 1): string {
  const conf = confidence ?? 1.0;

  if (conf >= 0.95) {
    return `rgba(34, 197, 94, ${alpha})`; // green-500
  } else if (conf >= 0.85) {
    return `rgba(234, 179, 8, ${alpha})`; // yellow-500
  } else if (conf >= 0.75) {
    return `rgba(249, 115, 22, ${alpha})`; // orange-500
  } else {
    return `rgba(239, 68, 68, ${alpha})`; // red-500
  }
}

/**
 * Get Tailwind CSS class for confidence badge
 */
export function getConfidenceBadgeClass(confidence: number | undefined): string {
  const conf = confidence ?? 1.0;

  if (conf >= 0.95) {
    return 'bg-green-100 text-green-800 border-green-300';
  } else if (conf >= 0.85) {
    return 'bg-yellow-100 text-yellow-800 border-yellow-300';
  } else if (conf >= 0.75) {
    return 'bg-orange-100 text-orange-800 border-orange-300';
  } else {
    return 'bg-red-100 text-red-800 border-red-300';
  }
}

/**
 * Get confidence level label
 */
export function getConfidenceLabel(confidence: number | undefined): string {
  const conf = confidence ?? 1.0;

  if (conf >= 0.95) return 'Excellent';
  if (conf >= 0.85) return 'Good';
  if (conf >= 0.75) return 'Medium';
  return 'Low';
}

/**
 * Get heatmap color (for heatmap visualization)
 */
export function getHeatmapColor(confidence: number | undefined): string {
  const conf = confidence ?? 1.0;

  // Red (0%) → Yellow (50%) → Green (100%)
  if (conf < 0.5) {
    // Red to Yellow
    const ratio = conf / 0.5;
    const r = 255;
    const g = Math.round(255 * ratio);
    return `rgb(${r}, ${g}, 0)`;
  } else {
    // Yellow to Green
    const ratio = (conf - 0.5) / 0.5;
    const r = Math.round(255 * (1 - ratio));
    const g = 255;
    return `rgb(${r}, ${g}, 0)`;
  }
}
