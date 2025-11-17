// External imports
import { readFileSync } from 'fs';

// Type imports
import type { AccuracyMetrics } from './accuracy';

// i18n for main process
import { t } from './i18n-main';

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
  imagePath?: string,
  language: string = 'en'
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
<html lang="${language}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t('title', language)} - ${timestamp}</title>
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
      font-size: 0.9em;
    }

    th, td {
      padding: 10px;
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
      font-family: 'Courier New', monospace;
      font-size: 0.85em;
      color: #1f2937;
      line-height: 1.5;
      max-height: 300px;
      overflow-y: auto;
    }

    .metric-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin: 20px 0;
    }

    .metric-card {
      background: white;
      padding: 15px;
      border-radius: 6px;
      border: 1px solid #e5e7eb;
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

    /* Accuracy color classes */
    .accuracy-excellent {
      color: #059669 !important;
    }

    .accuracy-good {
      color: #84cc16 !important;
    }

    .accuracy-medium {
      color: #f59e0b !important;
    }

    .accuracy-poor {
      color: #ef4444 !important;
    }
  </style>
</head>
<body>
  <!-- TOC Toggle Button -->
  <button class="toc-toggle" onclick="toggleTOC()" title="${t('toggleTOC', language)}" aria-label="${t('toggleMenu', language)}">
    <span></span>
    <span></span>
    <span></span>
  </button>

  <!-- TOC Backdrop -->
  <div class="toc-backdrop" onclick="closeTOC()"></div>

  <!-- Table of Contents -->
  <nav class="toc">
    <h3>${t('tableOfContents', language)}</h3>
    <ul>
      <li><a href="#summary" onclick="closeTOC()">${t('summary', language)}</a></li>
      ${imagePath ? `<li><a href="#bbox-comparison" onclick="closeTOC()">${t('sections.bboxComparison', language)}</a></li>` : ''}
      ${results
        .map((result, index) => `<li><a href="#processor-${index + 1}" onclick="closeTOC()">${index + 1}. ${result.processorId || result.tool}</a></li>`)
        .join('\n      ')}
    </ul>
  </nav>

  <!-- Scroll to Top Button -->
  <button class="scroll-top" onclick="window.scrollTo({top: 0, behavior: 'smooth'})" title="${t('scrollToTop', language)}">
    <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="18 15 12 9 6 15"></polyline>
    </svg>
  </button>

  <div class="container">
    <header>
      <h1>${t('title', language)}</h1>
      <p class="metadata">${t('generated', language)}: ${timestamp}</p>
      <p class="metadata">${t('metadata.totalCost', language)}: ¥${totalCost.toFixed(2)} | ${t('metadata.totalTime', language)}: ${formatTime(totalTime)}</p>
    </header>

    ${generateSummarySection(results, language)}

    ${imagePath ? generateBBoxComparisonSection(results, imagePath, language) : ''}

    ${results
      .map((result, index) => generateProcessorSection(result, index + 1, groundTruth, imagePath, language))
      .join('\n')}

    <footer>
      <p>${t('footer.generatedBy', language)} ${t('footer.version', language)}</p>
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
function generateBBoxComparisonSection(results: any[], imagePath: string, language: string = 'en'): string {
  const imageData = imageToBase64(imagePath);
  if (!imageData) return '';

  const resultsWithBBoxes = results.filter(r => r.boundingBoxes && r.boundingBoxes.length > 0);
  if (resultsWithBBoxes.length === 0) return '';

  return `
    <section id="bbox-comparison">
      <h2>${t('sections.bboxComparison', language)}</h2>
      <p style="color: #666; margin-bottom: 20px;">${t('bbox.visualComparison', language)}</p>

      <div class="confidence-legend">
        <div class="confidence-legend-item">
          <div class="confidence-color-box" style="background: rgba(34, 197, 94, 0.5);"></div>
          <span><strong>${t('bbox.legend.excellent', language)}</strong> (≥95%)</span>
        </div>
        <div class="confidence-legend-item">
          <div class="confidence-color-box" style="background: rgba(234, 179, 8, 0.5);"></div>
          <span><strong>${t('bbox.legend.good', language)}</strong> (85-95%)</span>
        </div>
        <div class="confidence-legend-item">
          <div class="confidence-color-box" style="background: rgba(249, 115, 22, 0.5);"></div>
          <span><strong>${t('bbox.legend.medium', language)}</strong> (75-85%)</span>
        </div>
        <div class="confidence-legend-item">
          <div class="confidence-color-box" style="background: rgba(239, 68, 68, 0.5);"></div>
          <span><strong>${t('bbox.legend.low', language)}</strong> (&lt;75%)</span>
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
                  ${t(result.boundingBoxes.length === 1 ? 'bbox.detected' : 'bbox.detected_plural', language, { count: result.boundingBoxes.length })}
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

function generateSummarySection(results: any[], language: string = 'en'): string {
  return `
    <section id="summary">
      <h2>${t('summary', language)}</h2>
      <table>
        <thead>
          <tr>
            <th>${t('table.processor', language)}</th>
            <th>${t('table.status', language)}</th>
            <th>${t('table.extractionAccuracy', language)}</th>
            <th>${t('table.editDistance', language)}</th>
            <th>${t('table.cost', language)}</th>
            <th>${t('table.time', language)}</th>
          </tr>
        </thead>
        <tbody>
          ${results
            .map(
              (r) => {
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
                    missingAccuracy = missingPct.toFixed(2) + '%';
                    extraAccuracy = extraPct.toFixed(2) + '%';
                  }
                }

                return `
            <tr>
              <td><strong>${r.processorId || r.tool}</strong></td>
              <td>
                ${
                  r.success
                    ? `<span class="badge badge-success">${t('status.success', language)}</span>`
                    : `<span class="badge badge-error">${t('status.failed', language)}</span>`
                }
              </td>
              <td class="metric-value">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                  <div>
                    <div class="${r.accuracy ? getAccuracyColorClass(r.accuracy.orderIndependentAccuracy) : ''}" style="font-size: 1.2em; font-weight: 700;">
                      ${r.accuracy ? r.accuracy.orderIndependentAccuracy.toFixed(2) + '%' : 'N/A'}
                    </div>
                    ${r.accuracy ? `<div style="font-size: 0.85em; color: #666;">(${charCount} ${t('metadata.chars', language)})</div>` : ''}
                  </div>
                  ${r.accuracy ? `
                  <div style="text-align: right; font-size: 0.9em; margin-left: 10px;">
                    <div style="margin-bottom: 2px;">${t('accuracy.missing', language)}: ${missingAccuracy} <span style="font-size: 0.8em; color: #999;">(${missingCount})</span></div>
                    <div>${t('accuracy.extra', language)}: ${extraAccuracy} <span style="font-size: 0.8em; color: #999;">(${extraCount})</span></div>
                  </div>
                  ` : ''}
                </div>
              </td>
              <td class="metric-value">${r.accuracy ? r.accuracy.editDistance : 'N/A'}</td>
              <td>¥${(r.cost || 0).toFixed(2)}</td>
              <td>
                ${formatTime(r.processingTime || 0)}
                ${(r.rateLimitWaitTime && r.rateLimitWaitTime > 0) ? `<br><span style="color: #f59e0b; font-size: 0.85em;" title="${t('metadata.includesWaitTime', language, { time: formatTime(r.rateLimitWaitTime) })}">${t('metadata.includesWaitTimeShort', language)}</span>` : ''}
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
  imagePath?: string,
  language: string = 'en'
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
        <h3>${t('sections.bboxVisualization', language)}</h3>
        <p style="color: #666; margin-bottom: 15px;">${t(result.boundingBoxes.length === 1 ? 'bbox.detected' : 'bbox.detected_plural', language, { count: result.boundingBoxes.length })}. ${t('bbox.hoverForDetails', language)}</p>
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
            ${t('accuracy.extractionAccuracy', language)}
          </div>
          <div class="metric-card-value" style="font-size: 2.5em; font-weight: 700; color: #059669;">${accuracy.orderIndependentAccuracy.toFixed(2)}%</div>
          <div style="font-size: 0.9em; color: #16a34a; margin-top: 0.3em;">${t('accuracy.basedOnChars', language, { count: accuracy.groundTruthCharCount || 0 })}</div>
          <div style="font-size: 0.85em; color: #666; margin-top: 1em; padding-top: 1em; border-top: 1px solid #d1fae5; text-align: left;">
            <strong style="color: #166534;">${t('accuracy.howCalculated', language)}:</strong>
            <ul style="margin: 0.5em 0; padding-left: 1.2em; line-height: 1.6;">
              <li>${t('accuracy.calculationSteps.step1', language)}</li>
              <li>${t('accuracy.calculationSteps.step2', language)}</li>
              <li>${t('accuracy.calculationSteps.step3', language)}</li>
            </ul>
            <div style="background: #f9fafb; padding: 0.6em; border-radius: 4px; font-family: monospace; font-size: 0.9em; margin-top: 0.5em;">
              <div style="color: #374151;">${t('accuracy.example.line1', language)}</div>
              <div style="color: #6b7280; margin-top: 0.2em;">${t('accuracy.example.line2', language)}</div>
            </div>
          </div>
        </div>
        <div class="metric-card">
          <div class="metric-card-title">${t('accuracy.editDistance', language)}</div>
          <div class="metric-card-value" style="font-size: 2em; font-weight: 700;">${accuracy.editDistance}</div>
          <div style="font-size: 0.85em; color: #666; margin-top: 0.5em;">${t('accuracy.editsNeeded', language)}</div>
          <div style="font-size: 0.85em; color: #666; margin-top: 1em; padding-top: 1em; border-top: 1px solid #e5e7eb;">
            <div style="margin-bottom: 0.5em;"><strong>${t('metadata.cost', language)}:</strong> ¥${(result.cost || 0).toFixed(2)}</div>
            <div><strong>${t('metadata.time', language)}:</strong> ${formatTime(result.processingTime || 0)}</div>
          </div>
        </div>
      </div>

      ${generateCharacterAnalysis(accuracy, language)}

      <h3>${t('sections.textComparison', language)}</h3>
      <div class="comparison">
        <div class="comparison-box">
          <h4>${t('sections.ocrOutput', language)} (${result.rawText?.length || 0} ${t('metadata.chars', language)})</h4>
          <pre>${escapeHtml(result.rawText || t('descriptions.empty', language))}</pre>
        </div>
        <div class="comparison-box">
          <h4>${t('sections.groundTruth', language)}</h4>
          <pre>${escapeHtml(groundTruth || t('descriptions.notProvided', language))}</pre>
        </div>
      </div>
      `
          : '<p>No accuracy metrics available (ground truth not provided)</p>'
      }

      <h3 id="processor-${index}-metadata">${t('sections.metadata', language)}</h3>
      <table>
        <tbody>
          <tr>
            <td><strong>${t('metadata.processingTime', language)}</strong></td>
            <td>
              ${formatTime(result.processingTime || 0)}
              ${result.rateLimitWaitTime && result.rateLimitWaitTime > 0
                ? `<br><span style="color: #f59e0b; font-size: 0.9em;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: text-bottom; margin-right: 4px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>${t('metadata.includesWaitTime', language, { time: formatTime(result.rateLimitWaitTime) })}</span>
                   <br><span style="color: #666; font-size: 0.9em;">${t('metadata.actualProcessing', language)}: ${formatTime((result.processingTime || 0) - result.rateLimitWaitTime)}</span>`
                : ''}
            </td>
          </tr>
          <tr><td><strong>${t('metadata.cost', language)}</strong></td><td>¥${(result.cost || 0).toFixed(2)}</td></tr>
          <tr><td><strong>${t('metadata.confidence', language)}</strong></td><td>${((result.confidence || 0) * 100).toFixed(1)}%</td></tr>
          <tr><td><strong>${t('metadata.textLength', language)}</strong></td><td>${result.rawText?.length || 0} ${t('metadata.characters', language)}</td></tr>
          ${result.metadata?.wordCount ? `<tr><td><strong>${t('metadata.wordCount', language)}</strong></td><td>${result.metadata.wordCount}</td></tr>` : ''}
          ${result.metadata?.pageCount ? `<tr><td><strong>${t('metadata.pageCount', language)}</strong></td><td>${result.metadata.pageCount}</td></tr>` : ''}
        </tbody>
      </table>
    </section>
  `;
}

function generateCharacterAnalysis(accuracy: AccuracyMetrics, language: string = 'en'): string {
  const hasMissingWords = accuracy.missingWords && accuracy.missingWords.length > 0;
  const hasMissingChars = Object.keys(accuracy.missingChars).length > 0;
  const hasExtra = Object.keys(accuracy.extraChars).length > 0;

  if (!hasMissingWords && !hasMissingChars && !hasExtra) {
    return '';
  }

  return `
    <div class="char-analysis">
      <h4>${t('accuracy.orderIndependentAnalysis', language)}</h4>
      ${
        hasMissingWords
          ? `<p><strong>${t('accuracy.missingWords', language)}:</strong> ${accuracy.missingWords
              .map((word: string) => `<span style="background: #ffe0e0; padding: 3px 8px; margin: 2px; border-radius: 3px; font-family: monospace; font-weight: bold; border: 1px solid #ffb0b0;">"${word}"</span>`)
              .join(' ')}</p>`
          : ''
      }
      ${
        hasMissingChars
          ? `<p><strong>${t('accuracy.missingCharacters', language)}:</strong> ${Object.entries(accuracy.missingChars)
              .map(([char, data]) => {
                // Handle both old format (number) and new format ({ count, sourceWords })
                const count = typeof data === 'number' ? data : data.count;
                const sourceWords = typeof data === 'object' && data.sourceWords ? data.sourceWords : [];
                const sourcesText = sourceWords.length > 0
                  ? ` <span style="color: #666; font-size: 0.9em;">(${t('accuracy.from', language)}: ${sourceWords.map((w: string) => `"${w}"`).join(', ')}${sourceWords.length === 5 ? '...' : ''})</span>`
                  : '';
                return `<span style="background: #ffebee; padding: 2px 6px; margin: 2px; border-radius: 3px; font-family: monospace;">"${char}" ×${count}${sourcesText}</span>`;
              })
              .join(' ')}</p>`
          : ''
      }
      ${
        hasExtra
          ? `<p><strong>${t('accuracy.extraCharacters', language)}:</strong> ${Object.entries(accuracy.extraChars)
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

/**
 * Calculate summary statistics for a processor across all files
 */
function calculateProcessorSummary(
  fileResults: any[],
  processorId: string
): {
  processorId: string;
  totalFiles: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  avgAccuracy: number;
  minAccuracy: number;
  maxAccuracy: number;
  totalCost: number;
  avgCost: number;
  totalTime: number;
  avgTime: number;
  totalCharCount: number;
  avgCharCount: number;
  totalPages: number;
} {
  // Get all results for this processor
  const processorResults = fileResults.flatMap(file =>
    file.results.filter((r: any) => (r.processorId || r.tool) === processorId)
  );

  // Separate success and failure results
  const successResults = processorResults.filter((r: any) => r.success && r.accuracy);
  const failureCount = processorResults.filter((r: any) => !r.success).length;

  // Calculate accuracy metrics
  const accuracies = successResults.map((r: any) => r.accuracy.orderIndependentAccuracy);
  const avgAccuracy = accuracies.length > 0
    ? accuracies.reduce((sum: number, a: number) => sum + a, 0) / accuracies.length
    : 0;
  const minAccuracy = accuracies.length > 0 ? Math.min(...accuracies) : 0;
  const maxAccuracy = accuracies.length > 0 ? Math.max(...accuracies) : 0;

  // Calculate cost metrics
  const totalCost = processorResults.reduce((sum: number, r: any) => sum + (r.cost || 0), 0);
  const avgCost = processorResults.length > 0 ? totalCost / processorResults.length : 0;

  // Calculate time metrics
  const totalTime = processorResults.reduce((sum: number, r: any) => sum + (r.processingTime || 0), 0);
  const avgTime = processorResults.length > 0 ? totalTime / processorResults.length : 0;

  // Calculate character count metrics
  const charCounts = successResults.map((r: any) => r.accuracy?.groundTruthCharCount || 0);
  const totalCharCount = charCounts.reduce((sum: number, count: number) => sum + count, 0);
  const avgCharCount = charCounts.length > 0 ? totalCharCount / charCounts.length : 0;

  // Calculate page count metrics
  const totalPages = processorResults.reduce((sum: number, r: any) => sum + (r.metadata?.pageCount || 0), 0);

  // Calculate success rate
  const successRate = processorResults.length > 0
    ? (successResults.length / processorResults.length) * 100
    : 0;

  return {
    processorId,
    totalFiles: processorResults.length,
    successCount: successResults.length,
    failureCount,
    successRate,
    avgAccuracy,
    minAccuracy,
    maxAccuracy,
    totalCost,
    avgCost,
    totalTime,
    avgTime,
    totalCharCount,
    avgCharCount,
    totalPages
  };
}

/**
 * Get color class based on accuracy percentage
 */
function getAccuracyColorClass(accuracy: number): string {
  if (accuracy >= 95) return 'accuracy-excellent';
  if (accuracy >= 85) return 'accuracy-good';
  if (accuracy >= 75) return 'accuracy-medium';
  return 'accuracy-poor';
}

/**
 * Generate HTML Report for Batch OCR Testing
 * Creates a report with summary table (files × processors) and collapsible sections per file
 */
export function generateBatchHTMLReport(
  fileResults: {
    fileName: string;
    filePath: string;
    results: any[];
    groundTruth: string;
    imagePaths: string[]; // Changed from imagePath to array
  }[],
  language: string = 'en'
): string {
  const timestamp = new Date().toLocaleString();

  // Get unique processor IDs from all results
  const processorIds = Array.from(
    new Set(
      fileResults.flatMap(file =>
        file.results.map(r => r.processorId || r.tool)
      )
    )
  );

  // Calculate total cost and time
  const totalCost = fileResults.reduce(
    (sum, file) => sum + file.results.reduce((s, r) => s + (r.cost || 0), 0),
    0
  );
  const totalTime = fileResults.reduce(
    (sum, file) => sum + file.results.reduce((s, r) => s + (r.processingTime || 0), 0),
    0
  );

  return `
<!DOCTYPE html>
<html lang="${language}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t('batchTitle', language)} - ${timestamp}</title>
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
      max-width: 1400px;
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

    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
      background: white;
      font-size: 0.9em;
    }

    th, td {
      padding: 10px;
      text-align: left;
      border: 1px solid #e5e7eb;
    }

    th {
      background: #f9fafb;
      font-weight: 600;
      color: #374151;
      position: sticky;
      top: 0;
      z-index: 10;
    }

    tbody tr:hover {
      background: #f9fafb;
    }

    .badge {
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

    .metric-value {
      font-weight: 600;
      color: #4f46e5;
    }

    .file-section {
      margin: 40px 0;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      overflow: hidden;
    }

    .file-header {
      background: #f9fafb;
      padding: 15px 20px;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      user-select: none;
      transition: background 0.2s;
    }

    .file-header:hover {
      background: #f3f4f6;
    }

    .file-header h3 {
      margin: 0;
      color: #1f2937;
      font-size: 1.1em;
    }

    .file-header .toggle-icon {
      font-size: 1.5em;
      color: #6b7280;
      transition: transform 0.3s;
    }

    .file-header.collapsed .toggle-icon {
      transform: rotate(-90deg);
    }

    .file-content {
      padding: 20px;
      display: block;
    }

    .file-content.hidden {
      display: none;
    }

    .processor-subsection {
      margin: 30px 0;
      padding: 20px;
      background: #fafafa;
      border-left: 4px solid #4f46e5;
      border-radius: 4px;
    }

    .accuracy-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin: 15px 0;
    }

    .accuracy-card {
      background: white;
      padding: 15px;
      border-radius: 6px;
      border: 1px solid #e5e7eb;
    }

    .accuracy-card-label {
      font-size: 0.85em;
      color: #6b7280;
      margin-bottom: 5px;
    }

    .accuracy-card-value {
      font-size: 2.5em;
      font-weight: 700;
      line-height: 1.2;
    }

    /* Accuracy color classes */
    .accuracy-excellent {
      color: #059669;
    }

    .accuracy-good {
      color: #84cc16;
    }

    .accuracy-medium {
      color: #f59e0b;
    }

    .accuracy-poor {
      color: #ef4444;
    }

    /* Tool Summary Styles */
    .tool-summary-section {
      margin: 30px 0;
      padding: 20px;
      background: #f9fafb;
      border-radius: 8px;
    }

    .tool-summary-section h2 {
      margin-bottom: 20px;
      color: #1f2937;
      font-size: 1.5em;
    }

    .processor-summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 20px;
    }

    .processor-summary-card {
      background: white;
      border-radius: 8px;
      padding: 20px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      border: 2px solid #e5e7eb;
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .processor-summary-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }

    .processor-summary-card h3 {
      margin-bottom: 15px;
      color: #1f2937;
      font-size: 1.1em;
      padding-bottom: 10px;
      border-bottom: 2px solid #e5e7eb;
    }

    .summary-metric-large {
      text-align: center;
      margin: 20px 0;
      padding: 15px;
      background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
      border-radius: 6px;
    }

    .metric-value-large {
      display: block;
      font-size: 3em;
      font-weight: 700;
      line-height: 1;
      margin-bottom: 5px;
    }

    .metric-label {
      display: block;
      font-size: 0.9em;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .summary-metrics-small {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-top: 15px;
    }

    .summary-metrics-small .metric {
      background: #f9fafb;
      padding: 10px;
      border-radius: 4px;
      text-align: center;
    }

    .summary-metrics-small .label {
      display: block;
      font-size: 0.75em;
      color: #6b7280;
      margin-bottom: 5px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    .summary-metrics-small .value {
      display: block;
      font-size: 1.2em;
      font-weight: 600;
      color: #1f2937;
    }

    .accuracy-range {
      margin-top: 10px;
      padding: 8px;
      background: #f3f4f6;
      border-radius: 4px;
      text-align: center;
      font-size: 0.85em;
      color: #6b7280;
    }

    .text-comparison {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin: 20px 0;
    }

    .text-box {
      background: #f9fafb;
      padding: 15px;
      border-radius: 6px;
      border: 1px solid #e5e7eb;
    }

    .text-box h4 {
      margin-bottom: 10px;
      color: #4b5563;
      font-size: 0.9em;
      font-weight: 600;
    }

    .text-box pre {
      white-space: pre-wrap;
      word-wrap: break-word;
      font-family: 'Courier New', monospace;
      font-size: 0.85em;
      color: #1f2937;
      max-height: 300px;
      overflow-y: auto;
    }

    canvas {
      max-width: 100%;
      height: auto;
      border: 1px solid #e5e7eb;
      border-radius: 4px;
      margin: 15px 0;
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

    @media print {
      body {
        background: white;
        padding: 0;
      }
      .container {
        box-shadow: none;
        padding: 20px;
      }
      .file-content {
        display: block !important;
      }
      .file-header {
        cursor: default;
      }
      .toggle-icon {
        display: none;
      }
      .toc,
      .toc-toggle,
      .toc-backdrop,
      .scroll-top {
        display: none;
      }
    }
  </style>
</head>
<body>
  <!-- TOC Toggle Button -->
  <button class="toc-toggle" onclick="toggleTOC()" title="${t('toggleTOC', language)}" aria-label="${t('toggleMenu', language)}">
    <span></span>
    <span></span>
    <span></span>
  </button>

  <!-- TOC Backdrop -->
  <div class="toc-backdrop" onclick="closeTOC()"></div>

  <!-- Table of Contents -->
  <nav class="toc">
    <h3>${t('tableOfContents', language)}</h3>
    <ul>
      <li><a href="#summary" onclick="closeTOC()">${t('sections.summaryAllFiles', language)}</a></li>
      ${fileResults.map((file, index) => `<li><a href="#file-${index}" onclick="closeTOC()">${index + 1}. ${escapeHtml(file.fileName)}</a></li>`).join('\n      ')}
    </ul>
  </nav>

  <!-- Scroll to Top Button -->
  <button class="scroll-top" onclick="window.scrollTo({top: 0, behavior: 'smooth'})" title="${t('scrollToTop', language)}">
    <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="18 15 12 9 6 15"></polyline>
    </svg>
  </button>

  <div class="container">
    <header>
      <h1>${t('batchTitle', language)}</h1>
      <div class="metadata">
        <p>${t('generated', language)}: ${timestamp}</p>
        <p>${t('metadata.totalFiles', language)}: ${fileResults.length} | ${t('metadata.totalTests', language)}: ${fileResults.length * processorIds.length}</p>
        <p>${t('metadata.totalCost', language)}: ¥${totalCost.toFixed(2)} | ${t('metadata.totalTime', language)}: ${formatTime(totalTime)}</p>
      </div>
    </header>

    <!-- Tool Summary Section -->
    <section class="tool-summary-section">
      <h2>${t('toolSummary.title', language)}</h2>
      <div class="processor-summary-grid">
        ${processorIds.map(pid => {
          const summary = calculateProcessorSummary(fileResults, pid);
          const avgAccuracyStr = summary.avgAccuracy > 0 ? summary.avgAccuracy.toFixed(2) + '%' : 'N/A';
          const colorClass = summary.avgAccuracy > 0 ? getAccuracyColorClass(summary.avgAccuracy) : 'accuracy-poor';

          return `
            <div class="processor-summary-card">
              <h3>${pid}</h3>

              <!-- Average Accuracy (Large, Prominent) -->
              <div class="summary-metric-large">
                <span class="metric-value-large ${colorClass}">${avgAccuracyStr}</span>
                <span class="metric-label">${t('toolSummary.avgAccuracy', language)}</span>
                ${summary.totalCharCount > 0 ? `
                  <div style="font-size: 0.9em; color: #666; margin-top: 5px;">
                    (${summary.totalCharCount.toLocaleString('en-US')} ${t('metadata.chars', language)} ${language === 'ja' ? '合計' : 'total'})
                  </div>
                ` : ''}
              </div>

              <!-- Secondary Metrics Grid -->
              <div class="summary-metrics-small">
                <div class="metric">
                  <span class="label">${t('toolSummary.filesProcessed', language)}</span>
                  <span class="value">${summary.successCount}/${summary.totalFiles}</span>
                </div>
                <div class="metric">
                  <span class="label">${t('toolSummary.successRate', language)}</span>
                  <span class="value">${summary.successRate.toFixed(0)}%</span>
                </div>
                <div class="metric">
                  <span class="label">${t('toolSummary.totalCost', language)}</span>
                  <span class="value">¥${summary.totalCost.toFixed(2)}</span>
                </div>
                <div class="metric">
                  <span class="label">${t('toolSummary.avgTime', language)}</span>
                  <span class="value">${(summary.avgTime / 1000).toFixed(2)}s${language === 'ja' ? t('toolSummary.perFile', language) : '/file'}</span>
                </div>
                <div class="metric">
                  <span class="label">${t('toolSummary.totalChars', language)}</span>
                  <span class="value">${summary.totalCharCount.toLocaleString('en-US')}</span>
                </div>
                ${summary.totalPages > 0 ? `
                <div class="metric">
                  <span class="label">${t('toolSummary.totalPages', language)}</span>
                  <span class="value">${summary.totalPages}</span>
                </div>
                ` : ''}
              </div>

              <!-- Accuracy Range -->
              ${summary.avgAccuracy > 0 ? `
                <div class="accuracy-range">
                  <strong>${t('toolSummary.accuracyRange', language)}:</strong> ${summary.minAccuracy.toFixed(2)}% - ${summary.maxAccuracy.toFixed(2)}%
                </div>
              ` : ''}

              <!-- Failure Count (if any) -->
              ${summary.failureCount > 0 ? `
                <div class="accuracy-range" style="background: #fee2e2; color: #991b1b;">
                  <strong>${t('toolSummary.failures', language)}:</strong> ${summary.failureCount}
                </div>
              ` : ''}
            </div>
          `;
        }).join('')}
      </div>
    </section>

    <!-- Summary Table -->
    <section id="summary">
      <h2>${t('sections.summaryAllFiles', language)}</h2>
      <p style="color: #666; margin-bottom: 15px;">${t('descriptions.clickAccuracy', language)}</p>
      <table>
        <thead>
          <tr>
            <th style="min-width: 200px;">${t('table.fileName', language)}</th>
            ${processorIds.map(pid => `<th>${pid}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${fileResults.map((file, fileIndex) => {
            // Create a map of processor results for this file
            const resultMap = new Map();
            file.results.forEach(r => {
              resultMap.set(r.processorId || r.tool, r);
            });

            return `
            <tr>
              <td><strong>${escapeHtml(file.fileName)}</strong></td>
              ${processorIds.map(pid => {
                const result = resultMap.get(pid);
                if (!result) {
                  return `<td style="background: #fafafa; color: #999;">-</td>`;
                }

                if (!result.success) {
                  return `<td style="background: #fee2e2;"><span class="badge badge-error">${t('status.failed', language)}</span></td>`;
                }

                const accuracy = result.accuracy
                  ? result.accuracy.orderIndependentAccuracy.toFixed(2) + '%'
                  : 'N/A';
                const charCount = result.accuracy?.groundTruthCharCount || 0;
                const charCountStr = charCount > 0 ? charCount.toLocaleString('en-US') : '-';
                const pageCount = result.metadata?.pageCount || 0;
                const pageCountStr = pageCount > 0 ? pageCount.toLocaleString('en-US') : '-';

                return `<td class="metric-value">
                  <a href="#file-${fileIndex}-processor-${pid}" style="color: #4f46e5; text-decoration: none;">${accuracy}</a>
                  ${charCount > 0 || pageCount > 0 ? `
                    <div style="font-size: 0.75em; color: #999; margin-top: 3px;">
                      ${charCount > 0 ? `${charCountStr} ${t('metadata.chars', language)}` : ''}
                      ${charCount > 0 && pageCount > 0 ? ', ' : ''}
                      ${pageCount > 0 ? `${pageCountStr} ${language === 'ja' ? 'ページ' : 'pages'}` : ''}
                    </div>
                  ` : ''}
                </td>`;
              }).join('')}
            </tr>
          `;
          }).join('')}
        </tbody>
      </table>
    </section>

    <!-- File Sections -->
    <section id="files">
      <h2>${t('sections.detailedResults', language)}</h2>
      ${fileResults.map((file, fileIndex) => `
        <div class="file-section" id="file-${fileIndex}">
          <div class="file-header" id="file-header-${fileIndex}" onclick="toggleFileSection(${fileIndex})">
            <h3>${escapeHtml(file.fileName)}</h3>
            <span class="toggle-icon">▼</span>
          </div>
          <div class="file-content" id="file-${fileIndex}-content">
            <p style="color: #666; font-size: 0.9em; margin-bottom: 20px;">
              <strong>${t('metadata.path', language)}:</strong> ${escapeHtml(file.filePath)}<br>
              <strong>${t('metadata.groundTruthLength', language)}:</strong> ${file.groundTruth.length} ${t('metadata.characters', language)}
            </p>

            ${file.results.map((result, resultIndex) => {
              const processorId = result.processorId || result.tool;
              const accuracy = result.accuracy;

              return `
                <div class="processor-subsection" id="file-${fileIndex}-processor-${processorId}">
                  <h3 style="margin-top: 0;">${processorId}</h3>

                  ${!result.success ? `
                    <div style="background: #fee2e2; border: 1px solid #fecaca; padding: 15px; border-radius: 6px; margin: 15px 0;">
                      <strong style="color: #991b1b;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: text-bottom; margin-right: 4px;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>${t('status.processingFailed', language)}</strong>
                      <p style="color: #7f1d1d; margin-top: 10px;">${escapeHtml(result.error || t('status.unknownError', language))}</p>
                    </div>
                  ` : ''}

                  ${result.success && accuracy ? `
                    <div class="accuracy-grid">
                      <div class="accuracy-card">
                        <div class="accuracy-card-label">${t('accuracy.extractionAccuracy', language)}</div>
                        <div class="accuracy-card-value ${getAccuracyColorClass(accuracy.orderIndependentAccuracy)}">${accuracy.orderIndependentAccuracy.toFixed(2)}%</div>
                        <div style="font-size: 0.8em; color: #6b7280; margin-top: 5px;">
                          ${accuracy.groundTruthCharCount} ${t('metadata.chars', language)}
                        </div>
                      </div>
                      <div class="accuracy-card">
                        <div class="accuracy-card-label">${t('accuracy.missingCharacters', language)}</div>
                        <div class="accuracy-card-value" style="color: ${accuracy.missingCharCount > 0 ? '#ef4444' : '#10b981'};">
                          ${accuracy.missingCharCount}
                        </div>
                        <div style="font-size: 0.8em; color: #6b7280; margin-top: 5px;">
                          ${((accuracy.missingCharCount / accuracy.groundTruthCharCount) * 100).toFixed(2)}%
                        </div>
                      </div>
                      <div class="accuracy-card">
                        <div class="accuracy-card-label">${t('accuracy.extraCharacters', language)}</div>
                        <div class="accuracy-card-value" style="color: ${accuracy.extraCharCount > 0 ? '#f59e0b' : '#10b981'};">
                          ${accuracy.extraCharCount}
                        </div>
                        <div style="font-size: 0.8em; color: #6b7280; margin-top: 5px;">
                          ${((accuracy.extraCharCount / accuracy.groundTruthCharCount) * 100).toFixed(2)}%
                        </div>
                      </div>
                      <div class="accuracy-card">
                        <div class="accuracy-card-label">${t('accuracy.editDistance', language)}</div>
                        <div class="accuracy-card-value" style="color: #6b7280; font-size: 1.8em;">${accuracy.editDistance}</div>
                      </div>
                      <div class="accuracy-card">
                        <div class="accuracy-card-label">${t('metadata.processingTime', language)}</div>
                        <div class="accuracy-card-value" style="font-size: 1.8em; color: #6b7280;">
                          ${formatTime(result.processingTime || 0)}
                        </div>
                      </div>
                      <div class="accuracy-card">
                        <div class="accuracy-card-label">${t('metadata.cost', language)}</div>
                        <div class="accuracy-card-value" style="font-size: 1.8em; color: #6b7280;">
                          ¥${(result.cost || 0).toFixed(2)}
                        </div>
                      </div>
                    </div>

                    ${generateCharacterAnalysis(accuracy, language)}

                    ${result.boundingBoxes && result.boundingBoxes.length > 0 && file.imagePaths.length > 0 ? `
                      <div style="margin: 20px 0;">
                        <h4>${t(result.boundingBoxes.length === 1 ? 'bbox.detected' : 'bbox.detected_plural', language, { count: result.boundingBoxes.length })}</h4>
                        ${(() => {
                          // Group bounding boxes by page
                          const pageGroups: Record<number, any[]> = {};
                          result.boundingBoxes.forEach((bbox: any) => {
                            const page = bbox.page || 1;
                            if (!pageGroups[page]) pageGroups[page] = [];
                            pageGroups[page].push(bbox);
                          });

                          const pages = Object.keys(pageGroups).map(Number).sort((a, b) => a - b);
                          const isMultiPage = pages.length > 1;

                          if (isMultiPage) {
                            // Multi-page PDF: show scrollable container with all pages
                            return `
                              <div style="max-height: 600px; overflow-y: auto; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px; background: #f9fafb;">
                                ${pages.map(pageNum => `
                                  <div style="margin-bottom: 20px;">
                                    <div style="background: #4f46e5; color: white; padding: 8px 12px; border-radius: 4px; margin-bottom: 10px; font-weight: 600;">
                                      ${language === 'ja' ? 'ページ' : 'Page'} ${pageNum} ${language === 'ja' ? `/ ${pages.length}` : `of ${pages.length}`} (${pageGroups[pageNum].length} ${language === 'ja' ? '個のボックス' : 'boxes'})
                                    </div>
                                    <canvas id="canvas-${fileIndex}-${resultIndex}-page${pageNum}" style="width: 100%; border: 1px solid #d1d5db; border-radius: 4px;"></canvas>
                                  </div>
                                `).join('')}
                              </div>
                              <div style="font-size: 0.9em; color: #6b7280; margin-top: 10px; font-style: italic;">
                                ${language === 'ja' ? 'ヒント: コンテナをスクロールしてすべてのページを表示' : 'Tip: Scroll to view all pages'}
                              </div>
                            `;
                          } else {
                            // Single page: use existing simple canvas
                            return `<canvas id="canvas-${fileIndex}-${resultIndex}"></canvas>`;
                          }
                        })()}
                      </div>
                    ` : ''}

                    <div class="text-comparison">
                      <div class="text-box">
                        <h4>${t('sections.groundTruth', language)}</h4>
                        <pre>${escapeHtml(file.groundTruth)}</pre>
                      </div>
                      <div class="text-box">
                        <h4>${t('sections.extractedText', language)}</h4>
                        <pre>${escapeHtml(result.extractedText || '')}</pre>
                      </div>
                    </div>
                  ` : ''}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `).join('')}
    </section>

    <footer>
      <p>${t('footer.batchMode', language)}</p>
      <p>${t('footer.reportGenerated', language, { timestamp })}</p>
    </footer>
  </div>

  ${generateBBoxRenderingScript()}

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

    // Toggle file section visibility
    function toggleFileSection(fileIndex) {
      const content = document.getElementById('file-' + fileIndex + '-content');
      const header = document.getElementById('file-header-' + fileIndex);

      if (!content || !header) {
        console.error('Could not find elements for file index:', fileIndex);
        return;
      }

      if (content.classList.contains('hidden')) {
        content.classList.remove('hidden');
        header.classList.remove('collapsed');
      } else {
        content.classList.add('hidden');
        header.classList.add('collapsed');
      }
    }

    // Image data embedded from server (array of images per file for multi-page PDFs)
    const imageDataMap = {
      ${fileResults.map((file, fileIndex) => {
        // Convert each page to base64
        const pageImages = file.imagePaths.map(imgPath => imageToBase64(imgPath));
        return `'${fileIndex}': ${JSON.stringify(pageImages)}`;
      }).join(',\n      ')}
    };

    // Render all bounding boxes when DOM is ready
    (function() {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', renderAllBBoxes);
      } else {
        renderAllBBoxes();
      }

      function renderAllBBoxes() {
        ${fileResults.map((file, fileIndex) =>
          file.results.map((result, resultIndex) => {
            if (!result.success || !result.boundingBoxes || result.boundingBoxes.length === 0) {
              return '';
            }

            // Group bounding boxes by page
            const pageGroups: Record<number, any[]> = {};
            result.boundingBoxes.forEach((bbox: any) => {
              const page = bbox.page || 1;
              if (!pageGroups[page]) pageGroups[page] = [];
              pageGroups[page].push(bbox);
            });

            const pages = Object.keys(pageGroups).map(Number).sort((a, b) => a - b);
            const isMultiPage = pages.length > 1;

            if (isMultiPage) {
              // Render each page separately with correct page image
              return pages.map(pageNum => {
                const pageBboxes = JSON.stringify(pageGroups[pageNum]);
                const pageIndex = pageNum - 1; // Convert to 0-based index
                return `
                  if (imageDataMap['${fileIndex}'] && imageDataMap['${fileIndex}'][${pageIndex}]) {
                    renderBoundingBoxes(
                      'canvas-${fileIndex}-${resultIndex}-page${pageNum}',
                      imageDataMap['${fileIndex}'][${pageIndex}],
                      ${pageBboxes}
                    );
                    addBBoxHover('canvas-${fileIndex}-${resultIndex}-page${pageNum}');
                  }
                `;
              }).join('');
            } else {
              // Single page rendering - use first (and only) image
              const bboxesJson = JSON.stringify(result.boundingBoxes);
              return `
                if (imageDataMap['${fileIndex}'] && imageDataMap['${fileIndex}'][0]) {
                  renderBoundingBoxes(
                    'canvas-${fileIndex}-${resultIndex}',
                    imageDataMap['${fileIndex}'][0],
                    ${bboxesJson}
                  );
                  addBBoxHover('canvas-${fileIndex}-${resultIndex}');
                }
              `;
            }
          }).join('')
        ).join('')}
      }
    })();
  </script>
</body>
</html>
  `;
}
