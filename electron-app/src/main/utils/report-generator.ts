// External imports
import { readFileSync } from 'fs';

// Type imports
import type { AccuracyMetrics } from './accuracy';

/**
 * HTML Report Generator for OCR Testing
 * Creates self-contained HTML reports with embedded CSS and bbox visualization
 */

/**
 * Convert image file to base64 data URI
 */
function imageToBase64(imagePath: string): string {
  try {
    const imageBuffer = readFileSync(imagePath);
    const base64 = imageBuffer.toString('base64');
    const extension = imagePath.toLowerCase().split('.').pop() || 'png';
    const mimeType = extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : 'image/png';
    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    console.error('Failed to convert image to base64:', error);
    return '';
  }
}

/**
 * Generate JavaScript code for bbox rendering on canvas
 */
function generateBBoxRenderingScript(): string {
  return `
    <script>
      // Confidence-based color function (matching frontend)
      function getConfidenceColor(confidence, alpha) {
        const conf = confidence ?? 1.0;
        alpha = alpha ?? 1;

        if (conf >= 0.95) {
          return 'rgba(34, 197, 94, ' + alpha + ')'; // green-500
        } else if (conf >= 0.85) {
          return 'rgba(234, 179, 8, ' + alpha + ')'; // yellow-500
        } else if (conf >= 0.75) {
          return 'rgba(249, 115, 22, ' + alpha + ')'; // orange-500
        } else {
          return 'rgba(239, 68, 68, ' + alpha + ')'; // red-500
        }
      }

      // Normalize bounds to polygon format
      function normalizeBounds(bounds) {
        if (bounds.length >= 4) return bounds;
        if (bounds.length === 2) {
          const topLeft = bounds[0];
          const bottomRight = bounds[1];
          return [
            topLeft,
            { x: bottomRight.x, y: topLeft.y },
            bottomRight,
            { x: topLeft.x, y: bottomRight.y }
          ];
        }
        return bounds;
      }

      // Render bounding boxes on canvas
      function renderBoundingBoxes(canvasId, imageData, boundingBoxes) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const img = new Image();

        img.onload = function() {
          canvas.width = img.width;
          canvas.height = img.height;

          // Draw image
          ctx.drawImage(img, 0, 0);

          // Draw each bounding box
          boundingBoxes.forEach(function(bbox, index) {
            if (!bbox.bounds || bbox.bounds.length === 0) return;

            const normalizedBounds = normalizeBounds(bbox.bounds);
            if (normalizedBounds.length < 3) return;

            const confidence = bbox.confidence ?? 1;

            // Draw polygon
            ctx.beginPath();
            ctx.moveTo(normalizedBounds[0].x, normalizedBounds[0].y);
            for (let i = 1; i < normalizedBounds.length; i++) {
              ctx.lineTo(normalizedBounds[i].x, normalizedBounds[i].y);
            }
            ctx.closePath();

            // Fill
            ctx.fillStyle = getConfidenceColor(confidence, 0.2);
            ctx.fill();

            // Stroke
            ctx.strokeStyle = getConfidenceColor(confidence, 0.9);
            ctx.lineWidth = 1.5;
            ctx.stroke();
          });

          // Store bbox data for hover functionality
          canvas.bboxData = boundingBoxes;
          canvas.imgElement = img;
        };

        img.src = imageData;
      }

      // Add hover functionality to show bbox info
      function addBBoxHover(canvasId) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        const tooltip = document.createElement('div');
        tooltip.className = 'bbox-tooltip';
        tooltip.style.cssText = 'position: absolute; background: rgba(0,0,0,0.9); color: white; padding: 8px 12px; border-radius: 6px; font-size: 12px; pointer-events: none; display: none; z-index: 1000; max-width: 300px; word-wrap: break-word; box-shadow: 0 4px 12px rgba(0,0,0,0.3);';
        document.body.appendChild(tooltip);

        canvas.addEventListener('mousemove', function(e) {
          if (!canvas.bboxData) return;

          const rect = canvas.getBoundingClientRect();
          const scaleX = canvas.width / rect.width;
          const scaleY = canvas.height / rect.height;
          const x = (e.clientX - rect.left) * scaleX;
          const y = (e.clientY - rect.top) * scaleY;

          // Find hovered bbox
          let hoveredIndex = -1;
          for (let i = canvas.bboxData.length - 1; i >= 0; i--) {
            const bbox = canvas.bboxData[i];
            if (!bbox.bounds || bbox.bounds.length === 0) continue;

            const normalizedBounds = normalizeBounds(bbox.bounds);
            const ctx = canvas.getContext('2d');
            ctx.beginPath();
            ctx.moveTo(normalizedBounds[0].x, normalizedBounds[0].y);
            for (let j = 1; j < normalizedBounds.length; j++) {
              ctx.lineTo(normalizedBounds[j].x, normalizedBounds[j].y);
            }
            ctx.closePath();

            if (ctx.isPointInPath(x, y)) {
              hoveredIndex = i;
              break;
            }
          }

          if (hoveredIndex >= 0) {
            const bbox = canvas.bboxData[hoveredIndex];
            const confidence = ((bbox.confidence ?? 1) * 100).toFixed(1);
            tooltip.innerHTML = '<strong>Text:</strong> ' + (bbox.text || '(empty)') + '<br><strong>Confidence:</strong> ' + confidence + '%';
            tooltip.style.display = 'block';

            // Position tooltip near cursor, accounting for scroll position
            let left = e.pageX + 15;
            let top = e.pageY + 15;

            // Make tooltip visible to measure its size
            tooltip.style.left = left + 'px';
            tooltip.style.top = top + 'px';

            // Prevent tooltip from going off-screen
            const tooltipRect = tooltip.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            // Adjust horizontal position if tooltip goes off right edge
            if (tooltipRect.right > viewportWidth) {
              left = e.pageX - tooltipRect.width - 15;
            }

            // Adjust vertical position if tooltip goes off bottom edge
            if (tooltipRect.bottom > viewportHeight) {
              top = e.pageY - tooltipRect.height - 15;
            }

            tooltip.style.left = left + 'px';
            tooltip.style.top = top + 'px';

            // Redraw with highlight
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(canvas.imgElement, 0, 0);

            canvas.bboxData.forEach(function(b, idx) {
              if (!b.bounds || b.bounds.length === 0) return;
              const normalizedBounds = normalizeBounds(b.bounds);
              if (normalizedBounds.length < 3) return;

              const conf = b.confidence ?? 1;
              const isHovered = idx === hoveredIndex;

              ctx.beginPath();
              ctx.moveTo(normalizedBounds[0].x, normalizedBounds[0].y);
              for (let i = 1; i < normalizedBounds.length; i++) {
                ctx.lineTo(normalizedBounds[i].x, normalizedBounds[i].y);
              }
              ctx.closePath();

              ctx.fillStyle = getConfidenceColor(conf, 0.2);
              ctx.fill();
              ctx.strokeStyle = getConfidenceColor(conf, 0.9);
              ctx.lineWidth = isHovered ? 3 : 1.5;
              ctx.stroke();
            });
          } else {
            tooltip.style.display = 'none';

            // Redraw without highlight
            if (canvas.imgElement) {
              const ctx = canvas.getContext('2d');
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              ctx.drawImage(canvas.imgElement, 0, 0);

              canvas.bboxData.forEach(function(bbox) {
                if (!bbox.bounds || bbox.bounds.length === 0) return;
                const normalizedBounds = normalizeBounds(bbox.bounds);
                if (normalizedBounds.length < 3) return;

                const confidence = bbox.confidence ?? 1;

                ctx.beginPath();
                ctx.moveTo(normalizedBounds[0].x, normalizedBounds[0].y);
                for (let i = 1; i < normalizedBounds.length; i++) {
                  ctx.lineTo(normalizedBounds[i].x, normalizedBounds[i].y);
                }
                ctx.closePath();

                ctx.fillStyle = getConfidenceColor(confidence, 0.2);
                ctx.fill();
                ctx.strokeStyle = getConfidenceColor(confidence, 0.9);
                ctx.lineWidth = 1.5;
                ctx.stroke();
              });
            }
          }
        });

        canvas.addEventListener('mouseleave', function() {
          tooltip.style.display = 'none';
        });
      }
    </script>
  `;
}

export function generateHTMLReport(
  results: any[],
  groundTruth?: string,
  imagePath?: string
): string {
  const timestamp = new Date().toLocaleString();

  // Calculate total cost
  const totalCost = results.reduce((sum, r) => sum + (r.cost || 0), 0);
  const totalTime = results.reduce(
    (sum, r) => sum + (r.processingTime || 0),
    0
  );

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OCR Test Results - ${timestamp}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    html {
      scroll-behavior: smooth;
    }

    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #333;
      background: #f5f5f5;
      padding: 20px;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      padding: 40px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    header {
      border-bottom: 3px solid #4f46e5;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }

    h1 {
      color: #4f46e5;
      font-size: 2em;
      margin-bottom: 10px;
    }

    .metadata {
      color: #666;
      font-size: 0.9em;
    }

    h2 {
      color: #333;
      margin-top: 40px;
      margin-bottom: 20px;
      font-size: 1.5em;
      border-bottom: 2px solid #e5e7eb;
      padding-bottom: 10px;
    }

    h3 {
      color: #4f46e5;
      margin-top: 30px;
      margin-bottom: 15px;
      font-size: 1.2em;
    }

    h4 {
      color: #666;
      margin-top: 20px;
      margin-bottom: 10px;
      font-size: 1em;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
      background: white;
    }

    th, td {
      padding: 12px;
      text-align: left;
      border: 1px solid #e5e7eb;
    }

    th {
      background: #f9fafb;
      font-weight: 600;
      color: #374151;
    }

    tr:hover {
      background: #f9fafb;
    }

    .metric-value {
      font-weight: 600;
      color: #4f46e5;
    }

    .success {
      color: #10b981;
    }

    .error {
      color: #ef4444;
    }

    .warning {
      color: #f59e0b;
    }

    .badge {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 0.85em;
      font-weight: 500;
    }

    .badge-success {
      background: #d1fae5;
      color: #065f46;
    }

    .badge-error {
      background: #fee2e2;
      color: #991b1b;
    }

    .comparison {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin: 20px 0;
    }

    .comparison-box {
      background: #f9fafb;
      padding: 15px;
      border-radius: 4px;
      border-left: 4px solid #4f46e5;
    }

    .comparison-box h4 {
      margin-top: 0;
    }

    pre {
      white-space: pre-wrap;
      word-wrap: break-word;
      background: #f9fafb;
      padding: 15px;
      border-radius: 4px;
      border: 1px solid #e5e7eb;
      font-size: 0.9em;
      line-height: 1.5;
    }

    .metric-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin: 20px 0;
    }

    .metric-card {
      background: #f9fafb;
      padding: 15px;
      border-radius: 4px;
      border-left: 4px solid #4f46e5;
    }

    .metric-card-title {
      font-size: 0.85em;
      color: #6b7280;
      margin-bottom: 5px;
    }

    .metric-card-value {
      font-size: 1.5em;
      font-weight: 600;
      color: #4f46e5;
    }

    .char-analysis {
      background: #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 15px;
      margin: 15px 0;
      border-radius: 4px;
    }

    footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      color: #6b7280;
      font-size: 0.9em;
    }

    /* TOC Toggle Button */
    .toc-toggle {
      position: fixed;
      left: 20px;
      top: 20px;
      width: 50px;
      height: 50px;
      background: #4f46e5;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      z-index: 1002;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 8px rgba(79, 70, 229, 0.3);
      transition: all 0.3s;
      flex-direction: column;
      gap: 5px;
      padding: 12px;
    }

    .toc-toggle:hover {
      background: #4338ca;
      transform: scale(1.05);
      box-shadow: 0 4px 12px rgba(79, 70, 229, 0.4);
    }

    .toc-toggle:active {
      transform: scale(0.95);
    }

    .toc-toggle span {
      width: 24px;
      height: 2px;
      background: white;
      border-radius: 2px;
      transition: all 0.3s;
    }

    .toc-toggle.active span:nth-child(1) {
      transform: translateY(7px) rotate(45deg);
    }

    .toc-toggle.active span:nth-child(2) {
      opacity: 0;
    }

    .toc-toggle.active span:nth-child(3) {
      transform: translateY(-7px) rotate(-45deg);
    }

    /* TOC Backdrop */
    .toc-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.3);
      display: none;
      z-index: 999;
      transition: opacity 0.3s;
    }

    .toc-backdrop.show {
      display: block;
    }

    /* Table of Contents Sidebar */
    .toc {
      position: fixed;
      left: -280px;
      top: 0;
      height: 100vh;
      width: 260px;
      background: white;
      border-right: 1px solid #e5e7eb;
      padding: 80px 20px 20px 20px;
      box-shadow: 2px 0 12px rgba(0,0,0,0.1);
      overflow-y: auto;
      transition: left 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      z-index: 1000;
    }

    .toc.open {
      left: 0;
    }

    .toc h3 {
      margin: 0 0 15px 0;
      font-size: 1.1em;
      color: #4f46e5;
      border-bottom: 2px solid #e5e7eb;
      padding-bottom: 10px;
    }

    .toc ul {
      list-style: none;
      padding: 0;
      margin: 0;
    }

    .toc li {
      margin: 0;
      padding: 0;
    }

    .toc a {
      display: block;
      padding: 8px 12px;
      color: #666;
      text-decoration: none;
      font-size: 0.9em;
      border-radius: 4px;
      transition: all 0.2s;
    }

    .toc a:hover {
      background: #f0f0f0;
      color: #4f46e5;
    }

    /* Scroll to Top Button */
    .scroll-top {
      position: fixed;
      bottom: 30px;
      right: 30px;
      width: 50px;
      height: 50px;
      background-color: #4f46e5;
      border: none;
      border-radius: 50%;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(79, 70, 229, 0.4);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s;
      z-index: 1000;
      text-decoration: none;
      outline: none;
    }

    .scroll-top:hover {
      background-color: #4338ca;
      transform: translateY(-3px);
      box-shadow: 0 6px 16px rgba(79, 70, 229, 0.5);
    }

    .scroll-top:active {
      transform: translateY(-1px);
    }

    .scroll-top svg {
      display: block;
      width: 24px;
      height: 24px;
    }

    /* Bbox Canvas Styles */
    .bbox-canvas-container {
      margin: 20px 0;
      background: #f9fafb;
      border-radius: 8px;
      padding: 20px;
      border: 1px solid #e5e7eb;
    }

    .bbox-canvas-wrapper {
      position: relative;
      width: 100%;
      max-width: 100%;
      overflow: auto;
      background: #1f2937;
      border-radius: 4px;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 20px;
    }

    .bbox-canvas {
      max-width: 100%;
      height: auto;
      display: block;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      border-radius: 4px;
    }

    .bbox-comparison-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 25px;
      margin: 30px 0;
    }

    .bbox-comparison-item {
      background: #f9fafb;
      border-radius: 8px;
      padding: 20px;
      border: 2px solid #e5e7eb;
      transition: all 0.2s;
    }

    .bbox-comparison-item:hover {
      border-color: #4f46e5;
      box-shadow: 0 4px 12px rgba(79, 70, 229, 0.1);
    }

    .bbox-comparison-item h4 {
      margin-top: 0;
      margin-bottom: 15px;
      color: #4f46e5;
      font-size: 1.1em;
      padding-bottom: 10px;
      border-bottom: 2px solid #e5e7eb;
    }

    .confidence-legend {
      display: flex;
      gap: 15px;
      flex-wrap: wrap;
      margin: 15px 0;
      padding: 15px;
      background: #f9fafb;
      border-radius: 6px;
      border: 1px solid #e5e7eb;
    }

    .confidence-legend-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.85em;
    }

    .confidence-color-box {
      width: 20px;
      height: 20px;
      border-radius: 3px;
      border: 1px solid rgba(0,0,0,0.2);
    }

    @media print {
      body {
        background: white;
        padding: 0;
      }

      .container {
        box-shadow: none;
      }

      .toc,
      .toc-toggle,
      .toc-backdrop,
      .scroll-top {
        display: none;
      }

      .bbox-canvas {
        max-width: 100%;
        page-break-inside: avoid;
      }

      .bbox-comparison-grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <!-- TOC Toggle Button -->
  <button class="toc-toggle" onclick="toggleTOC()" title="Toggle Table of Contents" aria-label="Toggle menu">
    <span></span>
    <span></span>
    <span></span>
  </button>

  <!-- TOC Backdrop -->
  <div class="toc-backdrop" onclick="closeTOC()"></div>

  <!-- Table of Contents -->
  <nav class="toc">
    <h3>Table of Contents</h3>
    <ul>
      <li><a href="#summary" onclick="closeTOC()">Summary</a></li>
      ${imagePath ? '<li><a href="#bbox-comparison" onclick="closeTOC()">Bbox Comparison</a></li>' : ''}
      ${results
        .map((result, index) => `<li><a href="#processor-${index + 1}" onclick="closeTOC()">${index + 1}. ${result.processorId || result.tool}</a></li>`)
        .join('\n      ')}
    </ul>
  </nav>

  <!-- Scroll to Top Button -->
  <button class="scroll-top" onclick="window.scrollTo({top: 0, behavior: 'smooth'})" title="Scroll to top">
    <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="18 15 12 9 6 15"></polyline>
    </svg>
  </button>

  <div class="container">
    <header>
      <h1>OCR Test Results</h1>
      <p class="metadata">Generated: ${timestamp}</p>
      <p class="metadata">Total Cost: ¥${totalCost.toFixed(2)} | Total Time: ${formatTime(totalTime)}</p>
    </header>

    ${generateSummarySection(results)}

    ${imagePath ? generateBBoxComparisonSection(results, imagePath) : ''}

    ${results
      .map((result, index) => generateProcessorSection(result, index + 1, groundTruth, imagePath))
      .join('\n')}

    <footer>
      <p>Generated by OCR Testing Tool v1.0</p>
    </footer>
  </div>

  ${generateBBoxRenderingScript()}

  ${imagePath ? generateInitializationScript(results, imagePath) : generateSmoothScrollScript()}
</body>
</html>
  `.trim();
}

/**
 * Generate smooth scroll script (for when there's no image/bbox data)
 */
function generateSmoothScrollScript(): string {
  return `
    <script>
      // TOC Toggle Functions
      function toggleTOC() {
        const toc = document.querySelector('.toc');
        const backdrop = document.querySelector('.toc-backdrop');
        const toggle = document.querySelector('.toc-toggle');

        toc.classList.toggle('open');
        backdrop.classList.toggle('show');
        toggle.classList.toggle('active');
      }

      function closeTOC() {
        const toc = document.querySelector('.toc');
        const backdrop = document.querySelector('.toc-backdrop');
        const toggle = document.querySelector('.toc-toggle');

        toc.classList.remove('open');
        backdrop.classList.remove('show');
        toggle.classList.remove('active');
      }

      (function() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', initializeSmoothScroll);
        } else {
          initializeSmoothScroll();
        }

        function initializeSmoothScroll() {
          // Add smooth scroll behavior to all TOC links
          const tocLinks = document.querySelectorAll('.toc a[href^="#"]');
          tocLinks.forEach(function(link) {
            link.addEventListener('click', function(e) {
              e.preventDefault();
              const targetId = this.getAttribute('href').substring(1);
              const targetElement = document.getElementById(targetId);
              if (targetElement) {
                targetElement.scrollIntoView({
                  behavior: 'smooth',
                  block: 'start'
                });
              }
            });
          });
        }
      })();
    </script>
  `;
}

/**
 * Generate side-by-side bbox comparison section
 */
function generateBBoxComparisonSection(results: any[], imagePath: string): string {
  const imageData = imageToBase64(imagePath);
  if (!imageData) return '';

  const resultsWithBBoxes = results.filter(r => r.boundingBoxes && r.boundingBoxes.length > 0);
  if (resultsWithBBoxes.length === 0) return '';

  return `
    <section id="bbox-comparison">
      <h2>Bounding Box Comparison</h2>
      <p style="color: #666; margin-bottom: 20px;">Visual comparison of bounding box detection across all processors. Hover over boxes to see text and confidence.</p>

      <div class="confidence-legend">
        <div class="confidence-legend-item">
          <div class="confidence-color-box" style="background: rgba(34, 197, 94, 0.5);"></div>
          <span><strong>Excellent</strong> (≥95%)</span>
        </div>
        <div class="confidence-legend-item">
          <div class="confidence-color-box" style="background: rgba(234, 179, 8, 0.5);"></div>
          <span><strong>Good</strong> (85-95%)</span>
        </div>
        <div class="confidence-legend-item">
          <div class="confidence-color-box" style="background: rgba(249, 115, 22, 0.5);"></div>
          <span><strong>Medium</strong> (75-85%)</span>
        </div>
        <div class="confidence-legend-item">
          <div class="confidence-color-box" style="background: rgba(239, 68, 68, 0.5);"></div>
          <span><strong>Low</strong> (&lt;75%)</span>
        </div>
      </div>

      <div class="bbox-comparison-grid">
        ${resultsWithBBoxes
          .map((result, index) => {
            const canvasId = `bbox-comparison-${index}`;
            return `
              <div class="bbox-comparison-item">
                <h4>${result.processorId || result.tool}</h4>
                <div class="bbox-canvas-wrapper">
                  <canvas id="${canvasId}" class="bbox-canvas"></canvas>
                </div>
                <p style="text-align: center; margin-top: 10px; color: #666; font-size: 0.9em;">
                  ${result.boundingBoxes.length} bounding box${result.boundingBoxes.length !== 1 ? 'es' : ''} detected
                </p>
              </div>
            `;
          })
          .join('\n')}
      </div>
    </section>
  `;
}

/**
 * Generate initialization script to render all canvases
 */
function generateInitializationScript(results: any[], imagePath: string): string {
  const imageData = imageToBase64(imagePath);
  if (!imageData) return '';

  const resultsWithBBoxes = results.filter(r => r.boundingBoxes && r.boundingBoxes.length > 0);

  const initCalls = resultsWithBBoxes.map((result, index) => {
    const canvasId = `bbox-comparison-${index}`;
    const bboxData = JSON.stringify(result.boundingBoxes || []);
    return `
      renderBoundingBoxes('${canvasId}', imageData, ${bboxData});
      addBBoxHover('${canvasId}');
    `;
  }).join('\n');

  const processorInitCalls = results.map((result, index) => {
    if (!result.boundingBoxes || result.boundingBoxes.length === 0) return '';
    const canvasId = `bbox-processor-${index + 1}`;
    const bboxData = JSON.stringify(result.boundingBoxes || []);
    return `
      renderBoundingBoxes('${canvasId}', imageData, ${bboxData});
      addBBoxHover('${canvasId}');
    `;
  }).join('\n');

  return `
    <script>
      // TOC Toggle Functions
      function toggleTOC() {
        const toc = document.querySelector('.toc');
        const backdrop = document.querySelector('.toc-backdrop');
        const toggle = document.querySelector('.toc-toggle');

        toc.classList.toggle('open');
        backdrop.classList.toggle('show');
        toggle.classList.toggle('active');
      }

      function closeTOC() {
        const toc = document.querySelector('.toc');
        const backdrop = document.querySelector('.toc-backdrop');
        const toggle = document.querySelector('.toc-toggle');

        toc.classList.remove('open');
        backdrop.classList.remove('show');
        toggle.classList.remove('active');
      }

      (function() {
        const imageData = ${JSON.stringify(imageData)};

        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', initialize);
        } else {
          initialize();
        }

        function initialize() {
          initializeCanvases();
          initializeSmoothScroll();
        }

        function initializeCanvases() {
          ${initCalls}
          ${processorInitCalls}
        }

        function initializeSmoothScroll() {
          // Add smooth scroll behavior to all TOC links
          const tocLinks = document.querySelectorAll('.toc a[href^="#"]');
          tocLinks.forEach(function(link) {
            link.addEventListener('click', function(e) {
              e.preventDefault();
              const targetId = this.getAttribute('href').substring(1);
              const targetElement = document.getElementById(targetId);
              if (targetElement) {
                targetElement.scrollIntoView({
                  behavior: 'smooth',
                  block: 'start'
                });
              }
            });
          });
        }
      })();
    </script>
  `;
}

function generateSummarySection(results: any[]): string {
  return `
    <section id="summary">
      <h2>Summary</h2>
      <table>
        <thead>
          <tr>
            <th>Processor</th>
            <th>Status</th>
            <th>Extraction Accuracy</th>
            <th>Edit Distance</th>
            <th>Cost</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          ${results
            .map(
              (r) => {
                const hasRateLimitWait = r.rateLimitWaitTime && r.rateLimitWaitTime > 0;
                const actualProcessingTime = hasRateLimitWait
                  ? (r.processingTime || 0) - r.rateLimitWaitTime
                  : (r.processingTime || 0);

                // Calculate missing and extra accuracy (inverse of percentage)
                let missingAccuracy = 'N/A';
                let extraAccuracy = 'N/A';
                let missingCount = 0;
                let extraCount = 0;
                let charCount = 0;

                if (r.accuracy) {
                  charCount = r.accuracy.groundTruthCharCount || 0;
                  missingCount = r.accuracy.missingCharCount || 0;
                  extraCount = r.accuracy.extraCharCount || 0;

                  if (charCount > 0) {
                    const missingPct = (missingCount / charCount) * 100;
                    const extraPct = (extraCount / charCount) * 100;
                    missingAccuracy = (100 - missingPct).toFixed(2) + '%';
                    extraAccuracy = (100 - extraPct).toFixed(2) + '%';
                  }
                }

                return `
            <tr>
              <td><strong>${r.processorId || r.tool}</strong></td>
              <td>
                ${
                  r.success
                    ? '<span class="badge badge-success">Success</span>'
                    : `<span class="badge badge-error">Failed</span>`
                }
              </td>
              <td class="metric-value">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                  <div>
                    <div style="font-size: 1.2em; font-weight: 700; color: #4f46e5;">
                      ${r.accuracy ? r.accuracy.orderIndependentAccuracy.toFixed(2) + '%' : 'N/A'}
                    </div>
                    ${r.accuracy ? `<div style="font-size: 0.85em; color: #666;">(${charCount} chars)</div>` : ''}
                  </div>
                  ${r.accuracy ? `
                  <div style="text-align: right; font-size: 0.9em; margin-left: 10px;">
                    <div style="margin-bottom: 2px;">Missing: ${missingAccuracy} <span style="font-size: 0.8em; color: #999;">(${missingCount})</span></div>
                    <div>Extra: ${extraAccuracy} <span style="font-size: 0.8em; color: #999;">(${extraCount})</span></div>
                  </div>
                  ` : ''}
                </div>
              </td>
              <td class="metric-value">${r.accuracy ? r.accuracy.editDistance : 'N/A'}</td>
              <td>¥${(r.cost || 0).toFixed(2)}</td>
              <td>
                ${formatTime(r.processingTime || 0)}
                ${hasRateLimitWait ? `<br><span style="color: #f59e0b; font-size: 0.85em;" title="This includes ${formatTime(r.rateLimitWaitTime)} of rate limit wait time">Includes rate limit wait</span>` : ''}
              </td>
            </tr>
          `;
              }
            )
            .join('')}
        </tbody>
      </table>
    </section>
  `;
}

function generateProcessorSection(
  result: any,
  index: number,
  groundTruth?: string,
  imagePath?: string
): string {
  const accuracy: AccuracyMetrics | undefined = result.accuracy;
  const hasBBoxes = result.boundingBoxes && result.boundingBoxes.length > 0;

  return `
    <section id="processor-${index}">
      <h2>${index}. ${result.processorId || result.tool}</h2>

      ${
        result.error
          ? `<div class="badge badge-error">Error: ${result.error}</div>`
          : ''
      }

      ${
        hasBBoxes && imagePath
          ? `
      <div class="bbox-canvas-container">
        <h3>Bounding Box Visualization</h3>
        <p style="color: #666; margin-bottom: 15px;">Detected ${result.boundingBoxes.length} bounding box${result.boundingBoxes.length !== 1 ? 'es' : ''}. Hover over boxes to see details.</p>
        <div class="bbox-canvas-wrapper">
          <canvas id="bbox-processor-${index}" class="bbox-canvas"></canvas>
        </div>
      </div>
      `
          : ''
      }

      ${
        accuracy
          ? `
      <div class="metric-grid" style="grid-template-columns: 2fr 1fr;">
        <div class="metric-card" style="background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border: 2px solid #86efac; padding: 1.5em;">
          <div class="metric-card-title" style="font-size: 1.2em; font-weight: 700; color: #166534;">
            Extraction Accuracy
          </div>
          <div class="metric-card-value" style="font-size: 2.5em; font-weight: 700; color: #059669;">${accuracy.orderIndependentAccuracy.toFixed(2)}%</div>
          <div style="font-size: 0.9em; color: #16a34a; margin-top: 0.3em;">Based on ${accuracy.groundTruthCharCount || 0} characters</div>
          <div style="font-size: 0.85em; color: #666; margin-top: 1em; padding-top: 1em; border-top: 1px solid #d1fae5; text-align: left;">
            <strong style="color: #166534;">How it's calculated:</strong>
            <ul style="margin: 0.5em 0; padding-left: 1.2em; line-height: 1.6;">
              <li>Removes all whitespace</li>
              <li>Sorts characters alphabetically</li>
              <li>Compares content regardless of order</li>
            </ul>
            <div style="background: #f9fafb; padding: 0.6em; border-radius: 4px; font-family: monospace; font-size: 0.9em; margin-top: 0.5em;">
              <div style="color: #374151;">"first second" = "second first"</div>
              <div style="color: #6b7280; margin-top: 0.2em;">Both → "cdefinorsst"</div>
            </div>
          </div>
        </div>
        <div class="metric-card">
          <div class="metric-card-title">Edit Distance</div>
          <div class="metric-card-value" style="font-size: 2em; font-weight: 700;">${accuracy.editDistance}</div>
          <div style="font-size: 0.85em; color: #666; margin-top: 0.5em;">edits needed (insertions, deletions, substitutions)</div>
          <div style="font-size: 0.85em; color: #666; margin-top: 1em; padding-top: 1em; border-top: 1px solid #e5e7eb;">
            <div style="margin-bottom: 0.5em;"><strong>Cost:</strong> ¥${(result.cost || 0).toFixed(2)}</div>
            <div><strong>Time:</strong> ${formatTime(result.processingTime || 0)}</div>
          </div>
        </div>
      </div>

      ${generateCharacterAnalysis(accuracy)}

      <h3>Text Comparison</h3>
      <div class="comparison">
        <div class="comparison-box">
          <h4>OCR Output (${result.rawText?.length || 0} chars)</h4>
          <pre>${escapeHtml(result.rawText || '(empty)')}</pre>
        </div>
        <div class="comparison-box">
          <h4>Ground Truth</h4>
          <pre>${escapeHtml(groundTruth || '(not provided)')}</pre>
        </div>
      </div>
      `
          : '<p>No accuracy metrics available (ground truth not provided)</p>'
      }

      <h3 id="processor-${index}-metadata">Metadata</h3>
      <table>
        <tbody>
          <tr>
            <td><strong>Processing Time</strong></td>
            <td>
              ${formatTime(result.processingTime || 0)}
              ${result.rateLimitWaitTime && result.rateLimitWaitTime > 0
                ? `<br><span style="color: #f59e0b; font-size: 0.9em;">⚠ Includes ${formatTime(result.rateLimitWaitTime)} rate limit wait time</span>
                   <br><span style="color: #666; font-size: 0.9em;">Actual processing: ${formatTime((result.processingTime || 0) - result.rateLimitWaitTime)}</span>`
                : ''}
            </td>
          </tr>
          <tr><td><strong>Cost</strong></td><td>¥${(result.cost || 0).toFixed(2)}</td></tr>
          <tr><td><strong>Confidence</strong></td><td>${((result.confidence || 0) * 100).toFixed(1)}%</td></tr>
          <tr><td><strong>Text Length</strong></td><td>${result.rawText?.length || 0} characters</td></tr>
          ${result.metadata?.wordCount ? `<tr><td><strong>Word Count</strong></td><td>${result.metadata.wordCount}</td></tr>` : ''}
          ${result.metadata?.pageCount ? `<tr><td><strong>Page Count</strong></td><td>${result.metadata.pageCount}</td></tr>` : ''}
        </tbody>
      </table>
    </section>
  `;
}

function generateCharacterAnalysis(accuracy: AccuracyMetrics): string {
  const hasMissingWords = accuracy.missingWords && accuracy.missingWords.length > 0;
  const hasMissingChars = Object.keys(accuracy.missingChars).length > 0;
  const hasExtra = Object.keys(accuracy.extraChars).length > 0;

  if (!hasMissingWords && !hasMissingChars && !hasExtra) {
    return '';
  }

  return `
    <div class="char-analysis">
      <h4>Order-Independent Character Analysis</h4>
      ${
        hasMissingWords
          ? `<p><strong>Missing Words:</strong> ${accuracy.missingWords
              .map((word: string) => `<span style="background: #ffe0e0; padding: 3px 8px; margin: 2px; border-radius: 3px; font-family: monospace; font-weight: bold; border: 1px solid #ffb0b0;">"${word}"</span>`)
              .join(' ')}</p>`
          : ''
      }
      ${
        hasMissingChars
          ? `<p><strong>Missing Characters:</strong> ${Object.entries(accuracy.missingChars)
              .map(([char, data]) => {
                // Handle both old format (number) and new format ({ count, sourceWords })
                const count = typeof data === 'number' ? data : data.count;
                const sourceWords = typeof data === 'object' && data.sourceWords ? data.sourceWords : [];
                const sourcesText = sourceWords.length > 0
                  ? ` <span style="color: #666; font-size: 0.9em;">(from: ${sourceWords.map((w: string) => `"${w}"`).join(', ')}${sourceWords.length === 5 ? '...' : ''})</span>`
                  : '';
                return `<span style="background: #ffebee; padding: 2px 6px; margin: 2px; border-radius: 3px; font-family: monospace;">"${char}" ×${count}${sourcesText}</span>`;
              })
              .join(' ')}</p>`
          : ''
      }
      ${
        hasExtra
          ? `<p><strong>Extra Characters:</strong> ${Object.entries(accuracy.extraChars)
              .map(([char, count]) => `<span style="background: #fff3e0; padding: 2px 6px; margin: 2px; border-radius: 3px; font-family: monospace;">"${char}" ×${count}</span>`)
              .join(' ')}</p>`
          : ''
      }
    </div>
  `;
}

function formatTime(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(0);
  return `${minutes}m ${seconds}s`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
