import { cloudVisionClient } from '../lib/cloud-vision-client.js';
import { geminiClient } from '../lib/gemini-client.js';
import { extractDimensions, extractEquipmentLabels, deduplicateByValue, calculateSimilarity } from '../lib/utils.js';
import { db, extractionResults } from '../db/index.js';

/**
 * Process drawing with both Cloud Vision and Gemini, then merge results
 */
export async function processWithHybrid(imagePath: string, drawingId: string) {
  console.log(`  Processing with Hybrid (Cloud Vision + Gemini)...`);
  const startTime = Date.now();

  try {
    // Run both extractions in parallel
    const [cloudVisionResult, geminiResult] = await Promise.all([
      cloudVisionClient.extractText(imagePath),
      geminiClient.extractDrawingData(imagePath),
    ]);

    // Extract from Cloud Vision text
    const cvDimensions = extractDimensions(cloudVisionResult.text);
    const cvEquipment = extractEquipmentLabels(cloudVisionResult.text);

    // Merge dimensions from both sources
    const allDimensions = [
      ...cvDimensions.map((d) => ({
        value: d.value,
        source: 'cloud-vision',
        confidence: 0.8,
      })),
      ...(geminiResult.dimensions || []).map((d: any) => ({
        value: d.value,
        source: 'gemini',
        location: d.location,
        element: d.element,
        type: d.type,
        confidence: 0.9,
      })),
    ];

    // Deduplicate dimensions
    const uniqueDimensions = deduplicateByValue(allDimensions, 0.85);

    // Add confidence boost for dimensions found by both tools
    const boostedDimensions = uniqueDimensions.map((dim) => {
      const foundInBoth =
        cvDimensions.some((cv) => calculateSimilarity(cv.value, dim.value) > 0.85) &&
        geminiResult.dimensions?.some(
          (g: any) => calculateSimilarity(g.value, dim.value) > 0.85
        );

      return {
        ...dim,
        confidence: foundInBoth ? 0.95 : dim.confidence,
        agreementLevel: foundInBoth ? 'high' : 'single-source',
      };
    });

    // Merge equipment from both sources
    const allEquipment = [
      ...cvEquipment.map((e) => ({
        name: e.term,
        spec: e.spec,
        source: 'cloud-vision',
        confidence: 0.7,
      })),
      ...(geminiResult.equipment || []).map((e: any) => ({
        name: e.name,
        spec: e.spec,
        position: e.position,
        source: 'gemini',
        confidence: 0.9,
      })),
    ];

    // Deduplicate equipment by name
    const uniqueEquipment: any[] = [];
    for (const eq of allEquipment) {
      const isDuplicate = uniqueEquipment.some(
        (existing) => calculateSimilarity(existing.name, eq.name) >= 0.7
      );

      if (!isDuplicate) {
        uniqueEquipment.push(eq);
      } else {
        // If duplicate, boost confidence and merge data
        const existingIndex = uniqueEquipment.findIndex(
          (existing) => calculateSimilarity(existing.name, eq.name) >= 0.7
        );
        if (existingIndex !== -1) {
          uniqueEquipment[existingIndex].confidence = 0.95;
          uniqueEquipment[existingIndex].agreementLevel = 'high';
          // Prefer Gemini's position data if available
          if (eq.position && !uniqueEquipment[existingIndex].position) {
            uniqueEquipment[existingIndex].position = eq.position;
          }
        }
      }
    }

    const mergedData = {
      dimensions: boostedDimensions,
      equipment: uniqueEquipment,
      areas: geminiResult.areas || [],
      distances: geminiResult.distances || [],
    };

    // Calculate agreement
    const dimensionsWithHighAgreement = boostedDimensions.filter(
      (d: any) => d.agreementLevel === 'high'
    );

    const equipmentWithHighAgreement = uniqueEquipment.filter(
      (e: any) => e.agreementLevel === 'high'
    );

    const totalDimensions = boostedDimensions.length;
    const totalEquipment = uniqueEquipment.length;

    const dimensionAgreementRate =
      totalDimensions > 0 ? dimensionsWithHighAgreement.length / totalDimensions : 0;

    const equipmentAgreementRate =
      totalEquipment > 0 ? equipmentWithHighAgreement.length / totalEquipment : 0;

    const overallAgreement = (dimensionAgreementRate + equipmentAgreementRate) / 2;

    const processingTime = Date.now() - startTime;
    const totalCost = cloudVisionClient.estimateCost(1) + geminiClient.estimateCost(1);

    // Save to database
    const [dbResult] = await db
      .insert(extractionResults)
      .values({
        drawingId,
        tool: 'hybrid',
        extractedData: mergedData,
        processingTimeMs: processingTime,
        apiCost: totalCost,
      })
      .returning();

    console.log(`  ✅ Hybrid completed in ${(processingTime / 1000).toFixed(2)}s`);
    console.log(`     Agreement: ${Math.round(overallAgreement * 100)}% (${dimensionsWithHighAgreement.length}/${totalDimensions} dimensions, ${equipmentWithHighAgreement.length}/${totalEquipment} equipment)`);

    return {
      success: true,
      extractionResultId: dbResult.id,
      tool: 'hybrid',
      processingTime,
      cost: totalCost,
      agreement: {
        dimensionsAgreed: dimensionsWithHighAgreement.length,
        equipmentAgreed: equipmentWithHighAgreement.length,
        totalAgreement: Math.round(overallAgreement * 100),
      },
    };
  } catch (error) {
    console.error(`  ❌ Hybrid processing failed:`, error);
    throw error;
  }
}
