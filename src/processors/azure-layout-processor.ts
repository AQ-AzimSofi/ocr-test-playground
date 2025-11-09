import { azureDocumentClient } from '../lib/azure-document-client.js';
import { db, extractionResults } from '../db/index.js';

/**
 * Process drawing with Azure AI Document Intelligence (prebuilt-layout model)
 * Optimized for document structure, tables, and layout analysis
 */
export async function processWithAzureLayout(
  imagePath: string,
  drawingId: string
) {
  console.log(`  Processing with Azure Layout (prebuilt-layout)...`);
  const startTime = Date.now();

  try {
    const result = await azureDocumentClient.analyzeLayout(imagePath);

    const processingTime = Date.now() - startTime;
    const estimatedCost = azureDocumentClient.estimateCost(
      result.pages.length,
      'layout'
    );

    const confidences = result.lines
      .map((line: any) => line.confidence)
      .filter((c: number) => c !== undefined);
    const avgConfidence =
      confidences.length > 0
        ? confidences.reduce((sum: number, c: number) => sum + c, 0) /
          confidences.length
        : undefined;

    const [dbResult] = await db
      .insert(extractionResults)
      .values({
        drawingId,
        tool: 'azure-layout',
        rawText: result.content,
        boundingBoxes: result.lines.map((line) => ({
          text: line.text,
          bounds: line.bounds,
          confidence: line.confidence,
          page: line.page,
        })),
        processingTimeMs: processingTime,
        apiCost: estimatedCost,
        metadata: {
          model: 'prebuilt-layout',
          lineCount: result.lines.length,
        },
      })
      .returning();

    console.log(
      `  Azure Layout completed in ${(processingTime / 1000).toFixed(2)}s`
    );
    console.log(
      `     Extracted ${result.content.length} characters from ${result.pages.length} page(s)`
    );
    console.log(`     Lines: ${result.lines.length}`);

    return {
      success: true,
      extractionResultId: dbResult.id,
      tool: 'azure-layout',
      rawText: result.content,
      confidence: avgConfidence,
      processingTime,
      cost: estimatedCost,
      metadata: {
        model: 'prebuilt-layout',
        lineCount: result.lines.length,
      },
    };
  } catch (error) {
    console.error(`  Azure Layout failed:`, error);
    throw error;
  }
}
