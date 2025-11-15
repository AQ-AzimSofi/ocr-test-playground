// External imports
import { createTool } from '@mastra/core';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';

// Internal imports
import { formatTime, formatCost } from '../../lib/utils.js';

/**
 * Tool to generate comparison reports for character-level OCR evaluation
 * Creates HTML and JSON reports comparing different OCR tools
 */
export const reportGeneratorTool = createTool({
  id: 'report-generator',
  description:
    'Generate comparison report for OCR test results based on character-level accuracy',
  inputSchema: z.object({
    testRunId: z.string(),
    testResults: z.array(
      z.object({
        drawingId: z.string(),
        tool: z.string(),
        metrics: z.object({
          characterErrorRate: z.number(),
          orderIndependentCER: z.number().optional(),
          orderIndependentAccuracy: z.number().optional(),
          characterAccuracy: z.number(),
          characterSetCoverage: z.number(),
          exactCharCountMatch: z.boolean(),
          extractedCharCount: z.number(),
          groundTruthCharCount: z.number(),
          editDistance: z.number().optional(),
          orderIndependentEditDistance: z.number().optional(),
          processingTimeMs: z.number(),
          apiCost: z.number(),
        }),
        orderIndependentCharAnalysis: z.object({
          missingCharacters: z.record(z.number()),
          extraCharacters: z.record(z.number()),
          missingTotal: z.number(),
          extraTotal: z.number(),
        }).optional(),
      })
    ),
    outputPath: z.string().optional(),
  }),
  outputSchema: z.object({
    reportPath: z.string(),
    summary: z.object({
      bestOverallTool: z.string(),
      bestAccuracyTool: z.string(),
      lowestCERTool: z.string(),
      fastestTool: z.string(),
      cheapestTool: z.string(),
    }),
  }),
  execute: async ({ context }) => {
    const { testRunId, testResults, outputPath = './results' } = context;

    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath, { recursive: true });
    }

    // Calculate summary statistics
    const toolStats: Record<
      string,
      {
        avgCER: number;
        avgOrderIndependentCER: number;
        avgOrderIndependentAccuracy: number;
        avgCharacterAccuracy: number;
        avgCharacterSetCoverage: number;
        avgEditDistance: number;
        avgProcessingTime: number;
        totalCost: number;
        testCount: number;
      }
    > = {};

    for (const result of testResults) {
      if (!toolStats[result.tool]) {
        toolStats[result.tool] = {
          avgCER: 0,
          avgOrderIndependentCER: 0,
          avgOrderIndependentAccuracy: 0,
          avgCharacterAccuracy: 0,
          avgCharacterSetCoverage: 0,
          avgEditDistance: 0,
          avgProcessingTime: 0,
          totalCost: 0,
          testCount: 0,
        };
      }

      const stats = toolStats[result.tool];

      stats.avgCER += result.metrics.characterErrorRate;
      stats.avgOrderIndependentCER +=
        result.metrics.orderIndependentCER || 0;
      stats.avgOrderIndependentAccuracy +=
        result.metrics.orderIndependentAccuracy || 0;
      stats.avgCharacterAccuracy += result.metrics.characterAccuracy;
      stats.avgCharacterSetCoverage += result.metrics.characterSetCoverage;
      stats.avgEditDistance += result.metrics.editDistance || 0;
      stats.avgProcessingTime += result.metrics.processingTimeMs;
      stats.totalCost += result.metrics.apiCost;
      stats.testCount += 1;
    }

    // Calculate averages
    for (const tool in toolStats) {
      const stats = toolStats[tool];
      stats.avgCER = stats.avgCER / stats.testCount;
      stats.avgOrderIndependentCER =
        stats.avgOrderIndependentCER / stats.testCount;
      stats.avgOrderIndependentAccuracy =
        stats.avgOrderIndependentAccuracy / stats.testCount;
      stats.avgCharacterAccuracy = stats.avgCharacterAccuracy / stats.testCount;
      stats.avgCharacterSetCoverage =
        stats.avgCharacterSetCoverage / stats.testCount;
      stats.avgEditDistance = stats.avgEditDistance / stats.testCount;
      stats.avgProcessingTime = stats.avgProcessingTime / stats.testCount;
    }

    // Find best tools
    const lowestCERTool =
      Object.entries(toolStats).sort(
        (a, b) => a[1].avgCER - b[1].avgCER
      )[0]?.[0] || '';

    const bestAccuracyTool =
      Object.entries(toolStats).sort(
        (a, b) => b[1].avgCharacterAccuracy - a[1].avgCharacterAccuracy
      )[0]?.[0] || '';

    const bestOverallTool = lowestCERTool; // Lowest CER is best overall

    const fastestTool =
      Object.entries(toolStats).sort(
        (a, b) => a[1].avgProcessingTime - b[1].avgProcessingTime
      )[0]?.[0] || '';

    const cheapestTool =
      Object.entries(toolStats).sort(
        (a, b) => a[1].totalCost - b[1].totalCost
      )[0]?.[0] || '';

    // Generate HTML report
    const html = generateHTMLReport(testRunId, testResults, toolStats, {
      bestOverallTool,
      bestAccuracyTool,
      lowestCERTool,
      fastestTool,
      cheapestTool,
    });

    const reportPath = path.join(outputPath, `test-run-${testRunId}.html`);
    fs.writeFileSync(reportPath, html);

    // Also save JSON version
    const jsonPath = path.join(outputPath, `test-run-${testRunId}.json`);
    fs.writeFileSync(
      jsonPath,
      JSON.stringify(
        {
          testRunId,
          testResults,
          toolStats,
          summary: {
            bestOverallTool,
            bestAccuracyTool,
            lowestCERTool,
            fastestTool,
            cheapestTool,
          },
        },
        null,
        2
      )
    );

    return {
      reportPath,
      summary: {
        bestOverallTool,
        bestAccuracyTool,
        lowestCERTool,
        fastestTool,
        cheapestTool,
      },
    };
  },
});

/**
 * Calculate gradient color based on metric value
 * Returns RGB color string for inline styling
 * Returns gray for undefined/null values (no confidence available)
 */
function getGradientColor(
  value: number | null | undefined,
  metricType: 'cer' | 'accuracy' | 'coverage' | 'time'
): string {
  // Return gray for undefined/null confidence values
  if (value === null || value === undefined) {
    return 'rgb(128, 128, 128)'; // Gray #808080
  }

  let normalizedValue: number;

  // Normalize value to 0-100 scale based on metric type
  switch (metricType) {
    case 'cer':
      // CER: 0% = best (green), 15% = orange, 30%+ = worst (red)
      // Clamp to 0-30 range and normalize to 0-100
      normalizedValue = (Math.min(Math.max(value * 100, 0), 30) / 30) * 100;
      break;

    case 'accuracy':
    case 'coverage':
      // Accuracy/Coverage: 100% = best (green), 75% = orange, 50% = worst (red)
      // Invert so 100 becomes 0 (green) and 50 becomes 100 (red)
      normalizedValue = 100 - Math.min(Math.max(value, 50), 100);
      normalizedValue = (normalizedValue / 50) * 100; // Normalize to 0-100
      break;

    case 'time':
      // Time is passed as normalized 0-100 value (already processed)
      normalizedValue = value;
      break;

    default:
      normalizedValue = 50;
  }

  // Calculate RGB based on normalized value (0 = green, 100 = red)
  let r: number, g: number, b: number;

  if (normalizedValue <= 50) {
    // Green to Orange (0-50)
    const ratio = normalizedValue / 50;
    r = Math.round(76 + (255 - 76) * ratio); // 76 → 255
    g = Math.round(175 + (152 - 175) * ratio); // 175 → 152
    b = Math.round(80 + (0 - 80) * ratio); // 80 → 0
  } else {
    // Orange to Red (50-100)
    const ratio = (normalizedValue - 50) / 50;
    r = 255; // stays 255
    g = Math.round(152 - 152 * ratio); // 152 → 0
    b = 0; // stays 0
  }

  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Calculate contrast text color based on background luminance
 * Returns white for dark backgrounds, black for light backgrounds
 */
function getContrastTextColor(bgRgb: string): string {
  // Extract RGB values from "rgb(r, g, b)" string
  const matches = bgRgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!matches) return '#000000';

  const r = parseInt(matches[1]);
  const g = parseInt(matches[2]);
  const b = parseInt(matches[3]);

  // Calculate relative luminance (WCAG formula)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  // Return black for light backgrounds, white for dark backgrounds
  return luminance > 0.5 ? '#000000' : '#ffffff';
}

/**
 * Generate inline style string for metric with gradient color
 * Gray background for undefined/null values (no confidence)
 */
function getMetricStyle(
  value: number | null | undefined,
  metricType: 'cer' | 'accuracy' | 'coverage' | 'time'
): string {
  const bgColor = getGradientColor(value, metricType);
  const textColor = getContrastTextColor(bgColor);
  return `background-color: ${bgColor}; color: ${textColor};`;
}

function generateHTMLReport(
  testRunId: string,
  testResults: any[],
  toolStats: any,
  summary: any
): string {
  // Calculate min/max processing times for normalization
  const allProcessingTimes = Object.values(toolStats).map(
    (stats: any) => stats.avgProcessingTime
  );
  const minProcessingTime = Math.min(...allProcessingTimes);
  const maxProcessingTime = Math.max(...allProcessingTimes);
  const processingTimeRange = maxProcessingTime - minProcessingTime || 1; // Avoid division by zero

  // Also get min/max for individual results
  const allResultTimes = testResults.map((r) => r.metrics.processingTimeMs);
  const minResultTime = Math.min(...allResultTimes);
  const maxResultTime = Math.max(...allResultTimes);
  const resultTimeRange = maxResultTime - minResultTime || 1;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Character-Level OCR Test Report - ${testRunId}</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      max-width: 1400px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f5f5f5;
    }
    h1, h2, h3 {
      color: #333;
    }
    .summary {
      background: white;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .highlight {
      background: #4CAF50;
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-weight: bold;
    }
    .info-box {
      background: #e3f2fd;
      padding: 15px;
      border-radius: 8px;
      margin-bottom: 20px;
      border-left: 4px solid #2196F3;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      background: white;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      margin-bottom: 20px;
    }
    th, td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #ddd;
    }
    th {
      background-color: #2196F3;
      color: white;
    }
    tr:hover {
      background-color: #f5f5f5;
    }
    .metric {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 4px;
      margin: 2px;
      font-weight: 500;
    }
    .char-count {
      font-family: monospace;
      font-size: 0.9em;
    }

    /* Table of Contents Sidebar */
    .toc {
      position: fixed;
      left: 20px;
      top: 100px;
      width: 220px;
      background: white;
      border: 1px solid #ddd;
      border-radius: 8px;
      padding: 15px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      max-height: calc(100vh - 140px);
      overflow-y: auto;
    }

    .toc h3 {
      margin: 0 0 10px 0;
      font-size: 1em;
      color: #2196F3;
      border-bottom: 2px solid #ddd;
      padding-bottom: 8px;
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
      padding: 6px 8px;
      color: #666;
      text-decoration: none;
      font-size: 0.9em;
      border-radius: 4px;
      transition: all 0.2s;
    }

    .toc a:hover {
      background: #f0f0f0;
      color: #2196F3;
    }

    /* Scroll to Top Button */
    .scroll-top {
      position: fixed;
      bottom: 30px;
      right: 30px;
      width: 50px;
      height: 50px;
      background-color: #2196F3;
      border: none;
      border-radius: 50%;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(33, 150, 243, 0.4);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s;
      z-index: 1000;
      text-decoration: none;
      outline: none;
    }

    .scroll-top:hover {
      background-color: #1976D2;
      transform: translateY(-3px);
      box-shadow: 0 6px 16px rgba(33, 150, 243, 0.5);
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
      .toc,
      .scroll-top {
        display: none;
      }
    }
  </style>
</head>
<body>
  <!-- Table of Contents -->
  <nav class="toc">
    <h3>Table of Contents</h3>
    <ul>
      <li><a href="#summary">Summary</a></li>
      <li><a href="#info">About Metrics</a></li>
      <li><a href="#tool-comparison">Tool Comparison</a></li>
      <li><a href="#detailed-results">Detailed Results</a></li>
      <li><a href="#character-differences">Character Differences</a></li>
    </ul>
  </nav>

  <!-- Scroll to Top Button -->
  <button class="scroll-top" onclick="window.scrollTo({top: 0, behavior: 'smooth'})" title="Scroll to top">
    <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="18 15 12 9 6 15"></polyline>
    </svg>
  </button>


  <h1>Character-Level OCR Test Report</h1>
  <p>Test Run ID: <code>${testRunId}</code></p>
  <p>Generated: ${new Date().toLocaleString()}</p>

  <div class="info-box" id="info">
    <h3>About OCR Evaluation Metrics</h3>

    <div style="margin-bottom: 1.5em;">
      <h4 style="margin-bottom: 0.5em; color: #2196F3;">
        Extraction Accuracy
      </h4>
      <p style="margin: 0.5em 0;">Measures content completeness regardless of character order. Higher is better (0-100%)</p>
      <div style="background: white; padding: 1em; border-radius: 4px; border-left: 3px solid #4CAF50;">
        <p style="margin: 0 0 0.5em 0;"><strong>How it's calculated:</strong></p>
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

    <div>
      <h4 style="margin-bottom: 0.5em; color: #2196F3;">Edit Distance</h4>
      <p style="margin: 0;">Number of character insertions, deletions, or substitutions needed to transform extracted text to ground truth (Levenshtein distance). Lower is better.</p>
    </div>
  </div>

  <div class="summary" id="summary">
    <h2>Summary</h2>
    <ul>
      <li><strong>Best Overall Tool (Lowest CER):</strong> <span class="highlight">${summary.bestOverallTool}</span></li>
      <li><strong>Best Character Accuracy:</strong> ${summary.bestAccuracyTool}</li>
      <li><strong>Lowest CER:</strong> ${summary.lowestCERTool}</li>
      <li><strong>Fastest:</strong> ${summary.fastestTool}</li>
      <li><strong>Cheapest:</strong> ${summary.cheapestTool}</li>
    </ul>
  </div>

  <h2 id="tool-comparison">Tool Performance Comparison</h2>
  <table>
    <thead>
      <tr>
        <th>Tool</th>
        <th>Extraction Accuracy</th>
        <th>Avg Edit Distance</th>
        <th>Avg Processing Time</th>
        <th>Total Cost</th>
        <th>Tests</th>
      </tr>
    </thead>
    <tbody>
      ${Object.entries(toolStats)
        .map(([tool, stats]: [string, any]) => {
          // Normalize processing time to 0-100 scale for gradient
          const normalizedTime =
            ((stats.avgProcessingTime - minProcessingTime) /
              processingTimeRange) *
            100;

          return `
        <tr>
          <td><strong>${tool}</strong></td>
          <td><span class="metric" style="${getMetricStyle(stats.avgOrderIndependentAccuracy, 'accuracy')}; font-weight: 700; font-size: 1.1em;"><strong>${stats.avgOrderIndependentAccuracy.toFixed(1)}%</strong></span></td>
          <td><span class="metric">${stats.avgEditDistance ? stats.avgEditDistance.toFixed(0) : 'N/A'}</span></td>
          <td><span class="metric" style="${getMetricStyle(normalizedTime, 'time')}">${formatTime(stats.avgProcessingTime)}</span></td>
          <td>${formatCost(stats.totalCost)}</td>
          <td>${stats.testCount}</td>
        </tr>
      `;
        })
        .join('')}
    </tbody>
  </table>

  <h2 id="detailed-results">Detailed Results</h2>
  <table>
    <thead>
      <tr>
        <th>Drawing ID</th>
        <th>Tool</th>
        <th>Position-Sensitive CER</th>
        <th>Order-Independent CER</th>
        <th>Order-Independent Accuracy</th>
        <th>Char Accuracy</th>
        <th>Char Set Coverage</th>
        <th>Char Count</th>
        <th>Edit Distance</th>
        <th>Order-Indep. Edit Dist.</th>
        <th>Processing Time</th>
        <th>Cost</th>
      </tr>
    </thead>
    <tbody>
      ${testResults
        .map((result) => {
          // Normalize processing time to 0-100 scale for gradient
          const normalizedTime =
            ((result.metrics.processingTimeMs - minResultTime) /
              resultTimeRange) *
            100;

          return `
        <tr>
          <td>${result.drawingId}</td>
          <td>${result.tool}</td>
          <td><span class="metric" style="${getMetricStyle(result.metrics.characterErrorRate, 'cer')}">${(result.metrics.characterErrorRate * 100).toFixed(2)}%</span></td>
          <td><span class="metric" style="${getMetricStyle(result.metrics.orderIndependentCER || null, 'cer')}">${result.metrics.orderIndependentCER ? (result.metrics.orderIndependentCER * 100).toFixed(2) + '%' : 'N/A'}</span></td>
          <td><span class="metric" style="${getMetricStyle(result.metrics.orderIndependentAccuracy || null, 'accuracy')}">${result.metrics.orderIndependentAccuracy ? result.metrics.orderIndependentAccuracy.toFixed(1) + '%' : 'N/A'}</span></td>
          <td><span class="metric" style="${getMetricStyle(result.metrics.characterAccuracy, 'accuracy')}">${result.metrics.characterAccuracy.toFixed(1)}%</span></td>
          <td><span class="metric" style="${getMetricStyle(result.metrics.characterSetCoverage, 'coverage')}">${result.metrics.characterSetCoverage.toFixed(1)}%</span></td>
          <td class="char-count">${result.metrics.extractedCharCount}/${result.metrics.groundTruthCharCount} ${result.metrics.exactCharCountMatch ? 'match' : 'mismatch'}</td>
          <td>${result.metrics.editDistance !== undefined ? result.metrics.editDistance : 'N/A'}</td>
          <td>${result.metrics.orderIndependentEditDistance !== undefined ? result.metrics.orderIndependentEditDistance : 'N/A'}</td>
          <td><span class="metric" style="${getMetricStyle(normalizedTime, 'time')}">${formatTime(result.metrics.processingTimeMs)}</span></td>
          <td>${formatCost(result.metrics.apiCost)}</td>
        </tr>
      `;
        })
        .join('')}
    </tbody>
  </table>

  <h2 id="character-differences">Character Differences by Drawing</h2>
  <p>Order-independent character frequency analysis showing which specific characters each processor missed or added extra.</p>
  ${generateCharacterDifferencesSection(testResults)}

</body>
</html>
  `.trim();
}

/**
 * Generate character differences section grouped by drawing
 */
function generateCharacterDifferencesSection(testResults: any[]): string {
  // Group results by drawing
  const byDrawing = new Map<string, any[]>();
  for (const result of testResults) {
    if (!byDrawing.has(result.drawingId)) {
      byDrawing.set(result.drawingId, []);
    }
    byDrawing.get(result.drawingId)!.push(result);
  }

  if (byDrawing.size === 0) {
    return '<p>No character difference data available.</p>';
  }

  let html = '';
  for (const [drawingId, results] of byDrawing) {
    html += `
    <div style="background: white; padding: 15px; margin-bottom: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
      <h3 style="margin-top: 0; color: #2196F3;">Drawing: ${drawingId}</h3>
      <table style="box-shadow: none; margin-bottom: 0;">
        <thead>
          <tr>
            <th>Tool</th>
            <th>Missing Characters</th>
            <th>Extra Characters</th>
          </tr>
        </thead>
        <tbody>
          ${results
            .map((result) => {
              const analysis = result.orderIndependentCharAnalysis;
              if (!analysis) {
                return `
                <tr>
                  <td>${result.tool}</td>
                  <td colspan="2" style="text-align: center; color: #999;">No data available</td>
                </tr>
                `;
              }

              // Format missing content (words + characters)
              let missingHtml = '';
              const hasMissingWords = analysis.missingWords && analysis.missingWords.length > 0;
              const hasMissingChars = Object.keys(analysis.missingCharacters || {}).length > 0;

              if (hasMissingWords || hasMissingChars || analysis.missingTotal > 0) {
                const parts: string[] = [];

                // Show missing words first
                if (hasMissingWords) {
                  const wordsHtml = analysis.missingWords
                    .map((word: string) => `<span style="background: #ffe0e0; padding: 3px 8px; margin: 2px; border-radius: 3px; font-family: monospace; font-weight: bold; border: 1px solid #ffb0b0;">"${word}"</span>`)
                    .join(' ');
                  parts.push(`<div style="margin-bottom: 4px;"><strong>Words:</strong> ${wordsHtml}</div>`);
                }

                // Show missing characters
                if (hasMissingChars) {
                  const charsList = Object.entries(analysis.missingCharacters)
                    .sort((a: any, b: any) => {
                      const countA = typeof b[1] === 'number' ? b[1] : b[1].count;
                      const countB = typeof a[1] === 'number' ? a[1] : a[1].count;
                      return countA - countB;
                    })
                    .map(([char, data]: any) => {
                      const count = typeof data === 'number' ? data : data.count;
                      const sourceWords = typeof data === 'object' && data.sourceWords ? data.sourceWords : [];
                      const sourcesText = sourceWords.length > 0
                        ? ` <span style="color: #666; font-size: 0.85em;">(from: ${sourceWords.map((w: string) => `"${w}"`).join(', ')}${sourceWords.length === 5 ? '...' : ''})</span>`
                        : '';
                      return `<span style="background: #ffebee; padding: 2px 6px; margin: 2px; border-radius: 3px; font-family: monospace;">'${char}'×${count}${sourcesText}</span>`;
                    })
                    .join(' ');
                  parts.push(`<div><strong>Chars:</strong> ${charsList}</div>`);
                }

                missingHtml = parts.join('') + ` <strong>(${analysis.missingTotal} total)</strong>`;
              } else {
                missingHtml = '<span style="color: #4CAF50;">None</span>';
              }

              // Format extra characters (no source words)
              let extraHtml = '';
              if (analysis.extraTotal > 0) {
                const extraList = Object.entries(analysis.extraCharacters)
                  .sort((a: any, b: any) => (b[1] as number) - (a[1] as number))
                  .map(([char, count]: any) => `<span style="background: #fff3e0; padding: 2px 6px; margin: 2px; border-radius: 3px; font-family: monospace;">'${char}'×${count}</span>`)
                  .join(' ');
                extraHtml = `${extraList} <strong>(${analysis.extraTotal} total)</strong>`;
              } else {
                extraHtml = '<span style="color: #4CAF50;">None</span>';
              }

              return `
              <tr>
                <td><strong>${result.tool}</strong></td>
                <td>${missingHtml}</td>
                <td>${extraHtml}</td>
              </tr>
              `;
            })
            .join('')}
        </tbody>
      </table>
    </div>
    `;
  }

  return html;
}
