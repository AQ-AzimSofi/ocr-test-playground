import { createTool } from '@mastra/core';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { formatTime, formatCost } from '../../lib/utils.js';

/**
 * Tool to generate comparison reports
 * Creates HTML and JSON reports comparing different OCR tools
 */
export const reportGeneratorTool = createTool({
  id: 'report-generator',
  description: 'Generate comparison report for OCR test results',
  inputSchema: z.object({
    testRunId: z.string(),
    testResults: z.array(
      z.object({
        drawingId: z.string(),
        tool: z.string(),
        metrics: z.object({
          dimensionMetrics: z.object({
            recall: z.number(),
            precision: z.number(),
            f1Score: z.number(),
          }),
          equipmentMetrics: z.object({
            recall: z.number(),
            precision: z.number(),
            f1Score: z.number(),
          }),
          processingTimeMs: z.number(),
          apiCost: z.number(),
        }),
      })
    ),
    outputPath: z.string().optional(),
  }),
  outputSchema: z.object({
    reportPath: z.string(),
    summary: z.object({
      bestOverallTool: z.string(),
      bestAccuracyTool: z.string(),
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
        avgAccuracy: number;
        avgProcessingTime: number;
        totalCost: number;
        testCount: number;
      }
    > = {};

    for (const result of testResults) {
      if (!toolStats[result.tool]) {
        toolStats[result.tool] = {
          avgAccuracy: 0,
          avgProcessingTime: 0,
          totalCost: 0,
          testCount: 0,
        };
      }

      const stats = toolStats[result.tool];
      const accuracy =
        (result.metrics.dimensionMetrics.f1Score + result.metrics.equipmentMetrics.f1Score) / 2;

      stats.avgAccuracy += accuracy;
      stats.avgProcessingTime += result.metrics.processingTimeMs;
      stats.totalCost += result.metrics.apiCost;
      stats.testCount += 1;
    }

    // Calculate averages
    for (const tool in toolStats) {
      const stats = toolStats[tool];
      stats.avgAccuracy = stats.avgAccuracy / stats.testCount;
      stats.avgProcessingTime = stats.avgProcessingTime / stats.testCount;
    }

    // Find best tools
    const bestOverallTool =
      Object.entries(toolStats).sort((a, b) => b[1].avgAccuracy - a[1].avgAccuracy)[0]?.[0] || '';

    const bestAccuracyTool = bestOverallTool;

    const fastestTool =
      Object.entries(toolStats).sort((a, b) => a[1].avgProcessingTime - b[1].avgProcessingTime)[0]?.[0] || '';

    const cheapestTool =
      Object.entries(toolStats).sort((a, b) => a[1].totalCost - b[1].totalCost)[0]?.[0] || '';

    // Generate HTML report
    const html = generateHTMLReport(testRunId, testResults, toolStats, {
      bestOverallTool,
      bestAccuracyTool,
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
        fastestTool,
        cheapestTool,
      },
    };
  },
});

function generateHTMLReport(
  testRunId: string,
  testResults: any[],
  toolStats: any,
  summary: any
): string {
  return `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OCR Test Report - ${testRunId}</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      max-width: 1200px;
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
    }
    .metric.good {
      background-color: #c8e6c9;
      color: #2e7d32;
    }
    .metric.medium {
      background-color: #fff9c4;
      color: #f57f17;
    }
    .metric.poor {
      background-color: #ffcdd2;
      color: #c62828;
    }
  </style>
</head>
<body>
  <h1>OCR Test Report</h1>
  <p>Test Run ID: <code>${testRunId}</code></p>
  <p>Generated: ${new Date().toLocaleString('ja-JP')}</p>

  <div class="summary">
    <h2>Summary</h2>
    <ul>
      <li><strong>Best Overall Tool:</strong> <span class="highlight">${summary.bestOverallTool}</span></li>
      <li><strong>Best Accuracy:</strong> ${summary.bestAccuracyTool}</li>
      <li><strong>Fastest:</strong> ${summary.fastestTool}</li>
      <li><strong>Cheapest:</strong> ${summary.cheapestTool}</li>
    </ul>
  </div>

  <h2>Tool Performance Comparison</h2>
  <table>
    <thead>
      <tr>
        <th>Tool</th>
        <th>Avg Accuracy</th>
        <th>Avg Processing Time</th>
        <th>Total Cost</th>
        <th>Tests Count</th>
      </tr>
    </thead>
    <tbody>
      ${Object.entries(toolStats)
        .map(
          ([tool, stats]: [string, any]) => `
        <tr>
          <td><strong>${tool}</strong></td>
          <td><span class="metric ${stats.avgAccuracy > 0.8 ? 'good' : stats.avgAccuracy > 0.6 ? 'medium' : 'poor'}">${(stats.avgAccuracy * 100).toFixed(1)}%</span></td>
          <td>${formatTime(stats.avgProcessingTime)}</td>
          <td>${formatCost(stats.totalCost)}</td>
          <td>${stats.testCount}</td>
        </tr>
      `
        )
        .join('')}
    </tbody>
  </table>

  <h2>Detailed Results</h2>
  <table>
    <thead>
      <tr>
        <th>Drawing ID</th>
        <th>Tool</th>
        <th>Dimension F1</th>
        <th>Equipment F1</th>
        <th>Processing Time</th>
        <th>Cost</th>
      </tr>
    </thead>
    <tbody>
      ${testResults
        .map(
          (result) => `
        <tr>
          <td>${result.drawingId}</td>
          <td>${result.tool}</td>
          <td><span class="metric ${result.metrics.dimensionMetrics.f1Score > 0.8 ? 'good' : result.metrics.dimensionMetrics.f1Score > 0.6 ? 'medium' : 'poor'}">${(result.metrics.dimensionMetrics.f1Score * 100).toFixed(1)}%</span></td>
          <td><span class="metric ${result.metrics.equipmentMetrics.f1Score > 0.8 ? 'good' : result.metrics.equipmentMetrics.f1Score > 0.6 ? 'medium' : 'poor'}">${(result.metrics.equipmentMetrics.f1Score * 100).toFixed(1)}%</span></td>
          <td>${formatTime(result.metrics.processingTimeMs)}</td>
          <td>${formatCost(result.metrics.apiCost)}</td>
        </tr>
      `
        )
        .join('')}
    </tbody>
  </table>
</body>
</html>
  `.trim();
}
