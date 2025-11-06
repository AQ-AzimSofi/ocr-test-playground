import { azureDocumentClient } from '../lib/azure-document-client.js';
import { extractDimensions, extractEquipmentLabels } from '../lib/utils.js';
import { db, extractionResults } from '../db/index.js';

/**
 * Process drawing with Azure AI Document Intelligence (prebuilt-layout model)
 */
export async function processWithAzureDocument(imagePath: string, drawingId: string) {
  console.log(`  Processing with Azure Document Intelligence...`);
  const startTime = Date.now();

  try {
    // Analyze layout
    const result = await azureDocumentClient.analyzeLayout(imagePath);

    // Extract dimensions from text content
    const dimensions = extractDimensions(result.content);

    // Extract equipment labels from text content
    const equipment = extractEquipmentLabels(result.content);

    // Extract tables (useful for equipment schedules)
    const tables = azureDocumentClient.extractTables(result);

    // Extract key-value pairs (useful for labeled dimensions)
    const keyValuePairs = azureDocumentClient.extractKeyValuePairs(result);

    // Enrich dimensions with spatial information from lines
    const enrichedDimensions = dimensions.map((dim) => {
      // Find matching line for this dimension
      const matchingLine = result.lines.find((line: any) =>
        line.text.includes(dim.value)
      );

      return {
        value: dim.value,
        type: dim.type,
        confidence: 0.85, // Azure layout model has high confidence for layout extraction
        source: 'azure-document',
        bounds: matchingLine?.bounds,
        page: matchingLine?.page,
      };
    });

    // Enrich equipment with spatial information
    const enrichedEquipment = equipment.map((eq) => {
      const matchingLine = result.lines.find((line: any) =>
        line.text.includes(eq.term)
      );

      return {
        name: eq.term,
        spec: eq.spec,
        confidence: 0.85,
        source: 'azure-document',
        bounds: matchingLine?.bounds,
        page: matchingLine?.page,
      };
    });

    // Try to extract areas from tables
    const areas = tables
      .flatMap((table: any) =>
        table.cells
          .filter((cell: any) => {
            const content = cell.content.toLowerCase();
            return (
              content.includes('㎡') ||
              content.includes('m²') ||
              content.includes('平米')
            );
          })
          .map((cell: any) => ({
            name: cell.content,
            source: 'azure-document-table',
            confidence: 0.8,
          }))
      );

    const extractedData = {
      dimensions: enrichedDimensions,
      equipment: enrichedEquipment,
      areas,
      tables,
      keyValuePairs,
      structuredData: {
        pageCount: result.pages.length,
        tableCount: tables.length,
        paragraphCount: result.paragraphs.length,
      },
    };

    const processingTime = Date.now() - startTime;
    const estimatedCost = azureDocumentClient.estimateCost(result.pages.length);

    // Save to database
    const [dbResult] = await db
      .insert(extractionResults)
      .values({
        drawingId,
        tool: 'azure-document-intelligence',
        rawText: result.content,
        extractedData,
        processingTimeMs: processingTime,
        apiCost: estimatedCost,
      })
      .returning();

    console.log(`  ✅ Azure Document Intelligence completed in ${(processingTime / 1000).toFixed(2)}s`);
    console.log(`     Extracted: ${enrichedDimensions.length} dimensions, ${enrichedEquipment.length} equipment, ${tables.length} tables`);

    return {
      success: true,
      extractionResultId: dbResult.id,
      tool: 'azure-document-intelligence',
      processingTime,
      cost: estimatedCost,
    };
  } catch (error) {
    console.error(`  ❌ Azure Document Intelligence failed:`, error);
    throw error;
  }
}
