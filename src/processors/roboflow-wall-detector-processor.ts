import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { db, extractionResults, geometricObjects } from '../db/index.js';

dotenv.config({ path: '.env.development' });

/**
 * Roboflow-based wall and room detector for floor plans
 * Uses pre-trained models from Roboflow Universe
 *
 * Available models:
 * - floor-plan-kaaow/floor-plan_-room-detection/2 (room detection)
 * - floorplanproject-ngpdl/wall-floorplan/1 (wall detection)
 */

interface RoboflowPrediction {
  x: number;           // Center X coordinate
  y: number;           // Center Y coordinate
  width: number;       // Bounding box width
  height: number;      // Bounding box height
  confidence: number;  // 0-1
  class: string;       // Detected class name (wall, room, door, window, etc.)
  class_id: number;    // Class ID
}

interface RoboflowResponse {
  time: number;
  image: {
    width: number;
    height: number;
  };
  predictions: RoboflowPrediction[];
}

interface RoboflowDetectionResult {
  predictions: RoboflowPrediction[];
  metadata: {
    image_width: number;
    image_height: number;
    model_used: string;
    processing_time: number;
  };
}

export class RoboflowWallDetector {
  private apiKey: string | null;
  private model: string;
  private version: string;

  constructor(
    model: string = 'wall-floorplan',
    version: string = '1',
    throwOnMissingKey: boolean = false
  ) {
    const apiKey = process.env.ROBOFLOW_API_KEY;
    if (!apiKey && throwOnMissingKey) {
      throw new Error(
        'ROBOFLOW_API_KEY environment variable not set. Get your API key from https://roboflow.com/'
      );
    }

    this.apiKey = apiKey || null;
    this.model = model; // e.g., 'wall-floorplan' or 'floor-plan_-room-detection'
    this.version = version;
  }

  /**
   * Detect walls and rooms using Roboflow's pre-trained models
   */
  async detectObjects(imagePath: string): Promise<RoboflowDetectionResult> {
    if (!this.apiKey) {
      throw new Error(
        'ROBOFLOW_API_KEY environment variable not set. Get your API key from https://roboflow.com/'
      );
    }

    // Read and encode image to base64
    const imageData = fs.readFileSync(imagePath);
    const base64Image = imageData.toString('base64');

    // Determine workspace and project from model name
    // Using publicly available models from Roboflow Universe
    let workspace: string;
    let project: string;

    if (this.model === 'wall-floorplan') {
      workspace = 'floorplanproject-ngpdl';
      project = 'wall-floorplan';
    } else if (this.model === 'floor-plan-walls') {
      workspace = 'testing-daidy';
      project = 'floor-plan-walls';
    } else {
      workspace = 'floor-plan-kaaow';
      project = 'floor-plan_-room-detection';
    }

    // Roboflow API endpoint
    const apiUrl = `https://detect.roboflow.com/${workspace}/${project}/${this.version}`;

    console.log(`  [Roboflow] Calling API: ${apiUrl} (model: ${this.model})`);

    try {
      // Roboflow V1 API expects base64 image in the body
      const response = await fetch(
        `${apiUrl}?api_key=${this.apiKey}&confidence=40&overlap=30`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: base64Image, // Send base64 string directly as body
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`  [Roboflow] API Error: ${response.status} - ${errorText}`);
        console.error(`  [Roboflow] Endpoint: ${apiUrl}`);
        throw new Error(
          `Roboflow API request failed: ${response.status} - ${errorText}`
        );
      }

      const data = (await response.json()) as RoboflowResponse;

      return {
        predictions: data.predictions,
        metadata: {
          image_width: data.image.width,
          image_height: data.image.height,
          model_used: `${workspace}/${project}/${this.version}`,
          processing_time: data.time,
        },
      };
    } catch (error) {
      console.error('Roboflow API error:', error);
      throw error;
    }
  }

  /**
   * Convert Roboflow bounding box (center + w/h) to corner coordinates
   */
  private convertToCorners(prediction: RoboflowPrediction): Array<{
    x: number;
    y: number;
  }> {
    const left = prediction.x - prediction.width / 2;
    const top = prediction.y - prediction.height / 2;
    const right = prediction.x + prediction.width / 2;
    const bottom = prediction.y + prediction.height / 2;

    // Return as 4 corners (clockwise from top-left)
    return [
      { x: Math.round(left), y: Math.round(top) },
      { x: Math.round(right), y: Math.round(top) },
      { x: Math.round(right), y: Math.round(bottom) },
      { x: Math.round(left), y: Math.round(bottom) },
    ];
  }

  /**
   * Determine object type from Roboflow class name
   */
  private mapClassToType(className: string): {
    type: 'wall' | 'door' | 'window' | 'room';
    subType: string | null;
  } {
    const lowerClass = className.toLowerCase();

    if (lowerClass.includes('wall')) {
      return { type: 'wall', subType: lowerClass };
    } else if (lowerClass.includes('door')) {
      return { type: 'door', subType: lowerClass };
    } else if (lowerClass.includes('window')) {
      return { type: 'window', subType: lowerClass };
    } else if (lowerClass.includes('room')) {
      return { type: 'room', subType: lowerClass };
    } else {
      // Default to wall for unknown classes in wall detection model
      return { type: 'wall', subType: className };
    }
  }

  /**
   * Estimate API cost
   * Roboflow pricing: Free tier = 1000 predictions/month
   * Paid plans start at $20/month for 5000 predictions
   */
  estimateCost(imageCount: number): number {
    // Assuming paid tier: ~¥0.40 per prediction
    return imageCount * 0.4;
  }
}

// Singleton instances for different models
// Using publicly available models from Roboflow Universe
export const roboflowWallDetector = new RoboflowWallDetector('floor-plan-walls', '1');
export const roboflowRoomDetector = new RoboflowWallDetector('floor-plan_-room-detection', '2');

/**
 * Process drawing with Roboflow for wall and room detection
 */
export async function processWithRoboflow(
  imagePath: string,
  drawingId: string,
  model: 'wall' | 'room' | 'both' = 'both'
) {
  console.log(`  Processing with Roboflow (model: ${model})...`);
  const startTime = Date.now();

  try {
    const results: RoboflowDetectionResult[] = [];
    const allPredictions: RoboflowPrediction[] = [];

    // Detect walls
    if (model === 'wall' || model === 'both') {
      const wallResult = await roboflowWallDetector.detectObjects(imagePath);
      results.push(wallResult);
      allPredictions.push(...wallResult.predictions);
    }

    // Detect rooms (optional - can be run separately or together)
    if (model === 'room' || model === 'both') {
      try {
        const roomResult = await roboflowRoomDetector.detectObjects(imagePath);
        results.push(roomResult);
        allPredictions.push(...roomResult.predictions);
      } catch (error) {
        console.warn('  Room detection model failed (may not be available):', error);
      }
    }

    const processingTime = Date.now() - startTime;
    const estimatedCost = roboflowWallDetector.estimateCost(results.length);

    // Generate text summary
    const textSummary = allPredictions
      .map((pred) => {
        return `${pred.class} [center: (${Math.round(pred.x)},${Math.round(pred.y)}), size: ${Math.round(pred.width)}x${Math.round(pred.height)}] confidence: ${pred.confidence.toFixed(2)}`;
      })
      .join('\n');

    // Save extraction result to database
    const [dbResult] = await db
      .insert(extractionResults)
      .values({
        drawingId,
        tool: 'roboflow-wall-detector',
        rawText: textSummary,
        boundingBoxes: allPredictions.map((pred) => {
          const corners = roboflowWallDetector['convertToCorners'](pred);
          return {
            text: pred.class,
            bounds: corners,
            confidence: pred.confidence,
            bboxSource: 'ocr' as const,
            metadata: {
              center: { x: pred.x, y: pred.y },
              width: pred.width,
              height: pred.height,
              class_id: pred.class_id,
            },
          };
        }),
        processingTimeMs: processingTime,
        apiCost: estimatedCost,
        metadata: {
          imageMetadata: results[0]?.metadata,
          objectCount: allPredictions.length,
          models_used: results.map((r) => r.metadata.model_used),
          classDistribution: allPredictions.reduce(
            (acc, pred) => {
              acc[pred.class] = (acc[pred.class] || 0) + 1;
              return acc;
            },
            {} as Record<string, number>
          ),
        },
      })
      .returning();

    console.log(
      `  Roboflow completed in ${(processingTime / 1000).toFixed(2)}s`
    );
    console.log(`     Detected ${allPredictions.length} objects:`);

    // Count objects by class
    const classCounts: Record<string, number> = {};
    allPredictions.forEach((pred) => {
      classCounts[pred.class] = (classCounts[pred.class] || 0) + 1;
    });
    Object.entries(classCounts).forEach(([className, count]) => {
      console.log(`       - ${count} ${className}(s)`);
    });

    // Save each detected object to geometric_objects table
    const geometricObjectIds: string[] = [];

    for (const pred of allPredictions) {
      const { type, subType } = roboflowWallDetector['mapClassToType'](pred.class);
      const corners = roboflowWallDetector['convertToCorners'](pred);

      const [geometricObj] = await db
        .insert(geometricObjects)
        .values({
          extractionResultId: dbResult.id,
          drawingId,
          objectType: type,
          subType: subType,
          geometry: {
            type: 'polygon',
            coordinates: corners,
          },
          properties: {
            width: pred.width,
            height: pred.height,
            center_x: pred.x,
            center_y: pred.y,
            class_name: pred.class,
          },
          confidence: pred.confidence,
          detectionMethod: 'ml-detection',
          metadata: {
            model: results[0]?.metadata.model_used,
            class_id: pred.class_id,
          },
        })
        .returning();

      geometricObjectIds.push(geometricObj.id);
    }

    return {
      success: true,
      extractionResultId: dbResult.id,
      tool: 'roboflow-wall-detector',
      objectCount: allPredictions.length,
      geometricObjectIds,
      processingTime,
      cost: estimatedCost,
      metadata: results[0]?.metadata,
    };
  } catch (error) {
    console.error(`  Roboflow failed:`, error);
    throw error;
  }
}
