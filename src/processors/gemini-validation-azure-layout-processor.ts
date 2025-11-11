import { geminiClient } from '../lib/gemini-client.js';
import { azureDocumentClient } from '../lib/azure-document-client.js';
import { db, extractionResults } from '../db/index.js';
import sharp from 'sharp';
import { parseGeminiValidation } from '../utils/gemini-parser.js';
import {
  synthesizeBboxForText,
  descriptionToApproximatePosition,
  BoundingBox,
  fuzzyMatchTextToBbox,
} from '../utils/bbox-estimator.js';
import { cropImageRegion } from '../utils/image-cropper.js';

/**
 * Process drawing using Azure Layout + Gemini validation workflow
 * 1. Run Azure Layout for baseline OCR (with structure)
 * 2. Ask Gemini to validate and find missing text
 * 3. Crop and re-process regions with missing text
 * 4. Synthesize bboxes for Gemini-found text
 */
export async function processWithGeminiValidationAzureLayout(
  imagePath: string,
  drawingId: string
) {
  console.log(`  Processing with Gemini Validation (Azure Layout)...`);
  const startTime = Date.now();

  try {
    // Get image dimensions
    const metadata = await sharp(imagePath).metadata();
    const imageWidth = metadata.width || 1000;
    const imageHeight = metadata.height || 1000;

    // Step 1: Run Azure Layout for baseline OCR
    console.log(`  Running Azure Layout (baseline)...`);
    const azureResult = await azureDocumentClient.analyzeLayout(imagePath);

    console.log(
      `  Azure extracted: ${azureResult.content.length} chars, ${azureResult.lines.length} lines`
    );

    // Convert Azure lines to our bbox format
    const azureBboxes: BoundingBox[] = azureResult.lines.map((line) => ({
      bounds: line.bounds,
      text: line.text,
      confidence: line.confidence || 0.85,
    }));

    // Step 2: Ask Gemini to validate Azure's results
    console.log(`  Asking Gemini to validate Azure Layout results...`);

    const validationPrompt = `You are a quality assurance system for OCR.

Compare the OCR text below with what you see in the image.
Identify any missing text or incorrect text.

OCR TEXT:
${azureResult.content}

TASK:
1. List any text visible in the image that is MISSING from the OCR above
2. List any text that is INCORRECT in the OCR

FORMAT YOUR RESPONSE AS:

Missing Text:
- "text1" (location description: e.g. top-left corner)
- "text2" (location: center-right)

Incorrect Text:
- Found "wrong" but should be "correct" (location: bottom)

IMPORTANT:
- Only report text that is clearly visible in the image
- Provide location descriptions (top/bottom/left/right/center)
- Be concise and specific
- If everything is correct, say "No issues found"`;

    const validationResponse = await geminiClient.extractWithCustomPrompt(
      imagePath,
      validationPrompt
    );

    console.log(
      `  Gemini validation response preview: ${validationResponse.substring(0, 300)}...`
    );

    // Step 3: Parse validation results
    const validation = parseGeminiValidation(validationResponse);

    console.log(
      `  Gemini found: ${validation.missingText.length} missing, ${validation.incorrectText.length} incorrect`
    );

    // If no issues found, return Azure results as-is
    if (
      validation.missingText.length === 0 &&
      validation.incorrectText.length === 0
    ) {
      console.log(`  No issues found - using Azure Layout results as-is`);

      const processingTime = Date.now() - startTime;
      const azureCost = azureDocumentClient.estimateCost(
        azureResult.pages.length,
        'layout'
      );
      const geminiCost = geminiClient.estimateCost(1); // One validation call
      const totalCost = azureCost + geminiCost;

      const [dbResult] = await db
        .insert(extractionResults)
        .values({
          drawingId,
          tool: 'gemini-validation-azure-layout',
          rawText: azureResult.content,
          boundingBoxes: azureResult.lines.map((line) => ({
            text: line.text,
            bounds: line.bounds,
            confidence: line.confidence || 0.85,
            bboxSource: 'ocr',
          })),
          processingTimeMs: processingTime,
          apiCost: totalCost,
          metadata: {
            azureLineCount: azureResult.lines.length,
            geminiValidationPassed: true,
            issuesFound: 0,
            baselineOCR: 'azure-layout',
          },
        })
        .returning();

      console.log(
        `  Gemini Validation (Azure Layout) completed in ${(processingTime / 1000).toFixed(2)}s`
      );
      console.log(`     No issues found - Azure Layout results validated`);

      return {
        success: true,
        extractionResultId: dbResult.id,
        tool: 'gemini-validation-azure-layout',
        rawText: azureResult.content,
        processingTime,
        cost: totalCost,
      };
    }

    // Step 4: Process missing and incorrect text
    const synthesizedBboxes: Array<{
      text: string;
      bounds: Array<{ x: number; y: number }>;
      confidence: number;
      bboxSource: 'synthesized' | 'estimated';
      metadata?: any;
    }> = [];

    let additionalGeminiCalls = 0;

    // Process missing text
    for (const missing of validation.missingText) {
      console.log(`  Processing missing text: "${missing.text}"`);

      // Try to estimate position from description
      let estimatedPosition = undefined;
      if (missing.locationDescription) {
        estimatedPosition = descriptionToApproximatePosition(
          missing.locationDescription,
          imageWidth,
          imageHeight
        );
      }

      if (estimatedPosition) {
        console.log(
          `  Estimated position from description: (${estimatedPosition.x.toFixed(0)}, ${estimatedPosition.y.toFixed(0)})`
        );

        // Crop region around estimated position
        const cropSize = 200; // Pixels
        const cropRegion = {
          bounds: [
            {
              x: Math.max(0, estimatedPosition.x - cropSize / 2),
              y: Math.max(0, estimatedPosition.y - cropSize / 2),
            },
            {
              x: Math.min(imageWidth, estimatedPosition.x + cropSize / 2),
              y: Math.max(0, estimatedPosition.y - cropSize / 2),
            },
            {
              x: Math.min(imageWidth, estimatedPosition.x + cropSize / 2),
              y: Math.min(imageHeight, estimatedPosition.y + cropSize / 2),
            },
            {
              x: Math.max(0, estimatedPosition.x - cropSize / 2),
              y: Math.min(imageHeight, estimatedPosition.y + cropSize / 2),
            },
          ],
          text: '',
          confidence: 0,
          index: synthesizedBboxes.length,
        };

        try {
          const cropped = await cropImageRegion(imagePath, cropRegion, 20);
          const geminiResult = await geminiClient.extractTextFromRegion(
            cropped.base64
          );

          additionalGeminiCalls++;

          // Synthesize bbox for the found text
          const synthesizedBbox = synthesizeBboxForText(
            geminiResult.text,
            azureBboxes,
            estimatedPosition,
            imageWidth,
            imageHeight
          );

          synthesizedBboxes.push({
            text: geminiResult.text,
            bounds: synthesizedBbox.bounds,
            confidence: 0.7,
            bboxSource: 'synthesized',
            metadata: {
              fromValidation: true,
              locationDescription: missing.locationDescription,
              estimatedPosition,
              geminiExtracted: true,
            },
          });

          console.log(
            `  Extracted missing text from region: "${geminiResult.text.substring(0, 50)}..."`
          );
        } catch (error) {
          console.warn(`  Failed to extract missing text region:`, error);

          // Fallback: synthesize bbox without crop
          const fallbackBbox = synthesizeBboxForText(
            missing.text,
            azureBboxes,
            estimatedPosition,
            imageWidth,
            imageHeight
          );

          synthesizedBboxes.push({
            text: missing.text,
            bounds: fallbackBbox.bounds,
            confidence: 0.5,
            bboxSource: 'estimated',
            metadata: {
              fromValidation: true,
              locationDescription: missing.locationDescription,
              estimatedPosition,
              croppingFailed: true,
            },
          });
        }
      } else {
        // No location description - synthesize bbox based on context
        console.log(`  No location description, using context-based synthesis`);

        const synthesizedBbox = synthesizeBboxForText(
          missing.text,
          azureBboxes,
          undefined,
          imageWidth,
          imageHeight
        );

        synthesizedBboxes.push({
          text: missing.text,
          bounds: synthesizedBbox.bounds,
          confidence: 0.4,
          bboxSource: 'estimated',
          metadata: {
            fromValidation: true,
            noLocationDescription: true,
          },
        });
      }
    }

    // Process incorrect text
    for (const incorrect of validation.incorrectText) {
      console.log(
        `  Correcting: "${incorrect.found}" -> "${incorrect.shouldBe}"`
      );

      // Find the Azure bbox that matches the incorrect text
      const match = fuzzyMatchTextToBbox(incorrect.found, azureBboxes, 0.5);

      if (match) {
        // Update the text in place (will replace Azure's version)
        synthesizedBboxes.push({
          text: incorrect.shouldBe,
          bounds: match.bbox.bounds,
          confidence: 0.8,
          bboxSource: 'synthesized',
          metadata: {
            corrected: true,
            originalText: incorrect.found,
            geminiCorrected: true,
          },
        });
      } else {
        console.warn(
          `  Could not find bbox for incorrect text: "${incorrect.found}"`
        );
      }
    }

    // Step 5: Merge Azure bboxes with synthesized ones
    const allBboxes = [
      ...azureResult.lines.map((line) => ({
        text: line.text,
        bounds: line.bounds,
        confidence: line.confidence || 0.85,
        bboxSource: 'ocr' as const,
      })),
      ...synthesizedBboxes,
    ];

    // Rebuild full text (Azure + synthesized)
    const finalText =
      azureResult.content +
      '\n' +
      synthesizedBboxes.map((b) => b.text).join('\n');

    const processingTime = Date.now() - startTime;
    const azureCost = azureDocumentClient.estimateCost(
      azureResult.pages.length,
      'layout'
    );
    const geminiCost = geminiClient.estimateCost(
      1 + additionalGeminiCalls,
      false
    );
    const totalCost = azureCost + geminiCost;

    // Save to database
    const [dbResult] = await db
      .insert(extractionResults)
      .values({
        drawingId,
        tool: 'gemini-validation-azure-layout',
        rawText: finalText,
        boundingBoxes: allBboxes,
        processingTimeMs: processingTime,
        apiCost: totalCost,
        metadata: {
          azureLineCount: azureResult.lines.length,
          geminiValidationIssues:
            validation.missingText.length + validation.incorrectText.length,
          missingTextCount: validation.missingText.length,
          incorrectTextCount: validation.incorrectText.length,
          synthesizedBboxCount: synthesizedBboxes.length,
          additionalGeminiCalls,
          baselineOCR: 'azure-layout',
        },
      })
      .returning();

    console.log(
      `  Gemini Validation (Azure Layout) completed in ${(processingTime / 1000).toFixed(2)}s`
    );
    console.log(
      `     Fixed ${validation.missingText.length} missing + ${validation.incorrectText.length} incorrect`
    );
    console.log(
      `     Total bboxes: ${allBboxes.length} (${azureResult.lines.length} Azure + ${synthesizedBboxes.length} synthesized)`
    );

    return {
      success: true,
      extractionResultId: dbResult.id,
      tool: 'gemini-validation-azure-layout',
      rawText: finalText,
      boundingBoxes: allBboxes,
      processingTime,
      cost: totalCost,
    };
  } catch (error) {
    console.error(`  Gemini Validation (Azure Layout) failed:`, error);
    throw error;
  }
}
