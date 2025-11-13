import { createTool } from '@mastra/core';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
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
  </style>
</head>
<body>
  <h1>Character-Level OCR Test Report</h1>
  <p>Test Run ID: <code>${testRunId}</code></p>
  <p>Generated: ${new Date().toLocaleString()}</p>

  <div class="info-box">
    <h3>About Character-Level OCR Metrics</h3>
    <ul>
      <li><strong>Position-Sensitive CER:</strong> Industry-standard metric that considers character order. Lower is better (0.0 = perfect)</li>
      <li><strong>Order-Independent CER:</strong> Measures content completeness ignoring text order (full-width normalized, whitespace removed, characters sorted). Lower is better (0.0 = perfect)</li>
      <li><strong>Order-Independent Accuracy:</strong> Content accuracy percentage ignoring order. Higher is better (0-100%)</li>
      <li><strong>Character Accuracy:</strong> Position-based accuracy. Higher is better (0-100%)</li>
      <li><strong>Character Set Coverage:</strong> Percentage of unique characters found. Higher is better (0-100%)</li>
      <li><strong>Edit Distance:</strong> Number of insertions, deletions, or substitutions needed to transform extracted text to ground truth (Levenshtein distance). Lower is better.</li>
      <li><strong>Order-Independent Edit Distance:</strong> Edit distance after sorting characters (ignores order). Shows content completeness regardless of sequence. Lower is better.</li>
    </ul>
    <p><em>Note: Order-independent metrics treat "first second" and "second first" as equal, useful for comparing content completeness.</em></p>
  </div>

  <div class="summary">
    <h2>Summary</h2>
    <ul>
      <li><strong>Best Overall Tool (Lowest CER):</strong> <span class="highlight">${summary.bestOverallTool}</span></li>
      <li><strong>Best Character Accuracy:</strong> ${summary.bestAccuracyTool}</li>
      <li><strong>Lowest CER:</strong> ${summary.lowestCERTool}</li>
      <li><strong>Fastest:</strong> ${summary.fastestTool}</li>
      <li><strong>Cheapest:</strong> ${summary.cheapestTool}</li>
    </ul>
  </div>

  <h2>Tool Performance Comparison</h2>
  <table>
    <thead>
      <tr>
        <th>Tool</th>
        <th>Position-Sensitive CER</th>
        <th>Order-Independent CER</th>
        <th>Order-Independent Accuracy</th>
        <th>Char Accuracy</th>
        <th>Char Set Coverage</th>
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
          <td><span class="metric" style="${getMetricStyle(stats.avgCER, 'cer')}">${(stats.avgCER * 100).toFixed(2)}%</span></td>
          <td><span class="metric" style="${getMetricStyle(stats.avgOrderIndependentCER, 'cer')}">${(stats.avgOrderIndependentCER * 100).toFixed(2)}%</span></td>
          <td><span class="metric" style="${getMetricStyle(stats.avgOrderIndependentAccuracy, 'accuracy')}">${stats.avgOrderIndependentAccuracy.toFixed(1)}%</span></td>
          <td><span class="metric" style="${getMetricStyle(stats.avgCharacterAccuracy, 'accuracy')}">${stats.avgCharacterAccuracy.toFixed(1)}%</span></td>
          <td><span class="metric" style="${getMetricStyle(stats.avgCharacterSetCoverage, 'coverage')}">${stats.avgCharacterSetCoverage.toFixed(1)}%</span></td>
          <td><span class="metric" style="${getMetricStyle(normalizedTime, 'time')}">${formatTime(stats.avgProcessingTime)}</span></td>
          <td>${formatCost(stats.totalCost)}</td>
          <td>${stats.testCount}</td>
        </tr>
      `;
        })
        .join('')}
    </tbody>
  </table>

  <h2>Detailed Results</h2>
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

  <h2>Character Differences by Drawing</h2>
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

              // Format missing characters
              let missingHtml = '';
              if (analysis.missingTotal > 0) {
                const missingList = Object.entries(analysis.missingCharacters)
                  .sort((a: any, b: any) => b[1] - a[1])
                  .map(([char, count]: any) => `<span style="background: #ffebee; padding: 2px 6px; margin: 2px; border-radius: 3px; font-family: monospace;">'${char}'×${count}</span>`)
                  .join(' ');
                missingHtml = `${missingList} <strong>(${analysis.missingTotal} total)</strong>`;
              } else {
                missingHtml = '<span style="color: #4CAF50;">✓ None</span>';
              }

              // Format extra characters
              let extraHtml = '';
              if (analysis.extraTotal > 0) {
                const extraList = Object.entries(analysis.extraCharacters)
                  .sort((a: any, b: any) => b[1] - a[1])
                  .map(([char, count]: any) => `<span style="background: #fff3e0; padding: 2px 6px; margin: 2px; border-radius: 3px; font-family: monospace;">'${char}'×${count}</span>`)
                  .join(' ');
                extraHtml = `${extraList} <strong>(${analysis.extraTotal} total)</strong>`;
              } else {
                extraHtml = '<span style="color: #4CAF50;">✓ None</span>';
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
