import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { db, extractionResults, geometricObjects } from '../db/index.js';
import { wallLineDetector, Line, Room } from '../utils/wall-line-detector.js';
import { isPdfFile } from '../utils/pdf-converter.js';

dotenv.config({ path: '.env.development' });

/**
 * Hybrid wall detector combining OpenCV + Gemini AI
 *
 * APPROACH:
 * Stage 1: Use computer vision (OpenCV-style) to detect lines, walls, and rooms
 * Stage 2: Use Gemini AI to classify and refine detected objects
 * Stage 3: Merge results for best accuracy
 */

interface HybridDetectionResult {
  walls: Array<{
    line: Line;
    classification: {
      type: 'exterior-wall' | 'interior-wall' | 'partition';
      confidence: number;
      label?: string;
    };
  }>;
  rooms: Array<{
    room: Room;
    classification: {
      label: string;
      type: string;
      confidence: number;
    };
  }>;
  metadata: {
    image_width: number;
    image_height: number;
    cv_walls: number;
    cv_rooms: number;
    ai_classification_time: number;
  };
}

export class HybridWallDetector {
  private genAI: GoogleGenerativeAI;
  private model: string;

  constructor(model: string = 'gemini-2.5-flash') {
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_GEMINI_API_KEY environment variable not set');
    }

    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = model;
  }

  /**
   * Hybrid detection: CV for detection, AI for classification
   */
  async detectWallsAndRooms(imagePath: string): Promise<HybridDetectionResult> {
    console.log('  [Hybrid Detector] Stage 1: Computer Vision detection...');

    // Stage 1: CV detection
    const cvResult = await wallLineDetector.detectWalls(imagePath);

    console.log(
      `  [Hybrid Detector] CV found: ${cvResult.walls.length} walls, ${cvResult.rooms.length} rooms`
    );

    // Stage 2: AI classification
    console.log('  [Hybrid Detector] Stage 2: AI classification...');
    const aiStartTime = Date.now();

    const classifiedWalls = await this.classifyWalls(imagePath, cvResult.walls);

    // Stage 2.5: Re-detect rooms with perimeter filtering using classified exterior walls
    console.log('  [Hybrid Detector] Stage 2.5: Filtering interior rooms...');
    const exteriorWalls = classifiedWalls
      .filter((w) => w.classification.type === 'exterior-wall')
      .map((w) => w.line);

    let filteredRooms = cvResult.rooms;
    if (exteriorWalls.length > 0) {
      filteredRooms = await wallLineDetector.redetectRoomsWithPerimeter(
        imagePath,
        exteriorWalls
      );
      console.log(
        `  [Hybrid Detector] Filtered to ${filteredRooms.length} interior rooms (was ${cvResult.rooms.length})`
      );
    }

    const classifiedRooms = await this.classifyRooms(imagePath, filteredRooms);

    const aiClassificationTime = Date.now() - aiStartTime;

    console.log(
      `  [Hybrid Detector] AI classification completed in ${(aiClassificationTime / 1000).toFixed(2)}s`
    );

    return {
      walls: classifiedWalls,
      rooms: classifiedRooms,
      metadata: {
        image_width: cvResult.metadata.image_width,
        image_height: cvResult.metadata.image_height,
        cv_walls: cvResult.walls.length,
        cv_rooms: filteredRooms.length,
        ai_classification_time: aiClassificationTime,
      },
    };
  }

  /**
   * Use Gemini to classify detected walls
   */
  private async classifyWalls(
    imagePath: string,
    walls: Line[]
  ): Promise<HybridDetectionResult['walls']> {
    if (walls.length === 0) {
      return [];
    }

    // Prepare wall list for AI
    const wallDescriptions = walls
      .map(
        (wall, i) =>
          `Wall ${i + 1}: ${wall.orientation}, from (${wall.start.x},${wall.start.y}) to (${wall.end.x},${wall.end.y}), length=${wall.length}px, thickness=${wall.thickness || 'unknown'}px`
      )
      .join('\n');

    const prompt = `You are analyzing a floor plan. I have detected the following walls using computer vision:

${wallDescriptions}

TASK: Classify each wall as:
- "exterior-wall" (perimeter walls, thicker, outer boundaries)
- "interior-wall" (walls inside the floor plan, room dividers)
- "partition" (thin dividers, movable walls)

Return ONLY valid JSON in this format:
{
  "classifications": [
    {
      "wall_id": 1,
      "type": "exterior-wall|interior-wall|partition",
      "confidence": 0.0-1.0,
      "reasoning": "brief explanation"
    }
  ]
}

Consider:
- Location: walls on the perimeter are usually exterior
- Thickness: thicker walls are usually exterior
- Pattern: walls forming main structure vs room divisions

Return ONLY the JSON object, no markdown code blocks.`;

    try {
      const model = this.genAI.getGenerativeModel({ model: this.model });

      const imageData = fs.readFileSync(imagePath);
      const base64Image = imageData.toString('base64');
      const mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

      const result = await model.generateContent([
        prompt,
        {
          inlineData: {
            data: base64Image,
            mimeType,
          },
        },
      ]);

      const response = result.response;
      let jsonText = response.text().trim();

      // Clean markdown
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/^```json\n/, '').replace(/\n```$/, '');
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```\n/, '').replace(/\n```$/, '');
      }

      const parsed = JSON.parse(jsonText) as {
        classifications: Array<{
          wall_id: number;
          type: 'exterior-wall' | 'interior-wall' | 'partition';
          confidence: number;
          reasoning?: string;
        }>;
      };

      // Merge CV walls with AI classifications
      return walls.map((wall, i) => {
        const classification = parsed.classifications.find((c) => c.wall_id === i + 1);

        return {
          line: wall,
          classification: {
            type: classification?.type || 'interior-wall',
            confidence: classification?.confidence || 0.5,
            label: classification?.reasoning,
          },
        };
      });
    } catch (error) {
      console.warn('  [Hybrid Detector] AI classification failed, using defaults:', error);

      // Fallback: use position-based heuristics
      return walls.map((wall) => ({
        line: wall,
        classification: {
          type: 'interior-wall' as const,
          confidence: 0.5,
        },
      }));
    }
  }

  /**
   * Use Gemini to classify and label detected rooms
   */
  private async classifyRooms(
    imagePath: string,
    rooms: Room[]
  ): Promise<HybridDetectionResult['rooms']> {
    if (rooms.length === 0) {
      return [];
    }

    // Prepare room list for AI
    const roomDescriptions = rooms
      .map(
        (room) =>
          `Room ${room.id}: center at (${Math.round(room.center.x)},${Math.round(room.center.y)}), area=${room.area}px², bounds: [${room.bounds.map((p) => `(${p.x},${p.y})`).join(', ')}]`
      )
      .join('\n');

    const prompt = `You are analyzing a floor plan. I have detected the following enclosed rooms using computer vision:

${roomDescriptions}

TASK: Identify and label each room. Look for Japanese or English text labels inside each room area.

Common room types in Japanese floor plans:
- 寝室 (bedroom)
- 浴室 (bathroom)
- トイレ (toilet)
- 台所/キッチン (kitchen)
- リビング (living room)
- ダイニング (dining)
- 玄関 (entrance)
- 廊下 (hallway)
- 収納 (storage)
- 洗面所 (washroom)

Return ONLY valid JSON in this format:
{
  "rooms": [
    {
      "room_id": 1,
      "label": "room name or label found",
      "type": "bedroom|bathroom|kitchen|living|dining|hallway|storage|entrance|other",
      "confidence": 0.0-1.0
    }
  ]
}

If no label is visible, use "unlabeled" and try to infer type from size/location.
Return ONLY the JSON object, no markdown code blocks.`;

    try {
      const model = this.genAI.getGenerativeModel({ model: this.model });

      const imageData = fs.readFileSync(imagePath);
      const base64Image = imageData.toString('base64');
      const mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

      const result = await model.generateContent([
        prompt,
        {
          inlineData: {
            data: base64Image,
            mimeType,
          },
        },
      ]);

      const response = result.response;
      let jsonText = response.text().trim();

      // Clean markdown
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/^```json\n/, '').replace(/\n```$/, '');
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```\n/, '').replace(/\n```$/, '');
      }

      const parsed = JSON.parse(jsonText) as {
        rooms: Array<{
          room_id: number;
          label: string;
          type: string;
          confidence: number;
        }>;
      };

      // Merge CV rooms with AI classifications
      return rooms.map((room) => {
        const classification = parsed.rooms.find((r) => r.room_id === room.id);

        return {
          room,
          classification: {
            label: classification?.label || 'unlabeled',
            type: classification?.type || 'other',
            confidence: classification?.confidence || 0.5,
          },
        };
      });
    } catch (error) {
      console.warn('  [Hybrid Detector] AI room classification failed, using defaults:', error);

      // Fallback: rooms without labels
      return rooms.map((room) => ({
        room,
        classification: {
          label: 'unlabeled',
          type: 'other',
          confidence: 0.5,
        },
      }));
    }
  }

  /**
   * Estimate API cost
   */
  estimateCost(imageCount: number): number {
    // Gemini 2.5 Flash: ~¥1.00 per image for hybrid classification
    // Less than full geometric detection because we're just classifying, not detecting
    return imageCount * 1.0;
  }
}

// Singleton instance
export const hybridWallDetector = new HybridWallDetector();

/**
 * Process drawing with Hybrid Wall Detector
 */
export async function processWithHybridDetector(
  imagePath: string,
  drawingId: string
) {
  console.log(`  Processing with Hybrid Wall Detector...`);

  // Skip PDF files - hybrid detector only supports image formats
  if (isPdfFile(imagePath)) {
    const errorMessage = 'Hybrid Wall Detector does not support PDF files. Only PNG/JPEG images are supported.';
    console.log(`  [SKIPPED] ${errorMessage}`);

    // Return a failed result without throwing
    return {
      success: false,
      error: errorMessage,
      tool: 'hybrid-wall-detector',
      skipped: true,
    };
  }

  const startTime = Date.now();

  try {
    // Detect walls and rooms
    const result = await hybridWallDetector.detectWallsAndRooms(imagePath);

    const processingTime = Date.now() - startTime;
    const estimatedCost = hybridWallDetector.estimateCost(1);

    // Generate text summary
    const textSummary = [
      ...result.walls.map((w) => {
        const line = w.line;
        return `${w.classification.type} [${line.orientation}] from (${line.start.x},${line.start.y}) to (${line.end.x},${line.end.y}) length=${line.length}px thickness=${line.thickness}px confidence=${w.classification.confidence.toFixed(2)}`;
      }),
      ...result.rooms.map((r) => {
        const room = r.room;
        return `room [${r.classification.label}] type=${r.classification.type} center=(${Math.round(room.center.x)},${Math.round(room.center.y)}) area=${room.area}px² confidence=${r.classification.confidence.toFixed(2)}`;
      }),
    ].join('\n');

    // Save extraction result to database
    const [dbResult] = await db
      .insert(extractionResults)
      .values({
        drawingId,
        tool: 'hybrid-cv-ai',
        rawText: textSummary,
        boundingBoxes: [
          ...result.walls.map((w) => ({
            text: w.classification.type,
            bounds: [w.line.start, w.line.end],
            confidence: w.classification.confidence,
            bboxSource: 'ocr' as const,
            metadata: {
              orientation: w.line.orientation,
              length: w.line.length,
              thickness: w.line.thickness,
            },
          })),
          ...result.rooms.map((r) => ({
            text: r.classification.label,
            bounds: r.room.bounds,
            confidence: r.classification.confidence,
            bboxSource: 'ocr' as const,
            metadata: {
              type: r.classification.type,
              area: r.room.area,
            },
          })),
        ],
        processingTimeMs: processingTime,
        apiCost: estimatedCost,
        metadata: {
          imageMetadata: result.metadata,
          objectCount: result.walls.length + result.rooms.length,
          walls: result.walls.length,
          rooms: result.rooms.length,
          cv_detection_time:
            processingTime - result.metadata.ai_classification_time,
          ai_classification_time: result.metadata.ai_classification_time,
        },
      })
      .returning();

    console.log(
      `  Hybrid Detector completed in ${(processingTime / 1000).toFixed(2)}s`
    );
    console.log(
      `     Detected ${result.walls.length} walls, ${result.rooms.length} rooms`
    );

    // Count wall types
    const wallTypes: Record<string, number> = {};
    result.walls.forEach((w) => {
      wallTypes[w.classification.type] =
        (wallTypes[w.classification.type] || 0) + 1;
    });
    Object.entries(wallTypes).forEach(([type, count]) => {
      console.log(`       - ${count} ${type}(s)`);
    });

    // Save each detected object to geometric_objects table
    const geometricObjectIds: string[] = [];

    // Save walls
    for (const w of result.walls) {
      const [geometricObj] = await db
        .insert(geometricObjects)
        .values({
          extractionResultId: dbResult.id,
          drawingId,
          objectType: 'wall',
          subType: w.classification.type,
          geometry: {
            type: 'line',
            coordinates: [w.line.start, w.line.end],
          },
          properties: {
            length: w.line.length,
            thickness: w.line.thickness,
            orientation: w.line.orientation,
          },
          confidence: w.classification.confidence,
          detectionMethod: 'hybrid-cv-ai',
          metadata: {
            cv_detected: true,
            ai_classified: true,
          },
        })
        .returning();

      geometricObjectIds.push(geometricObj.id);
    }

    // Save rooms
    for (const r of result.rooms) {
      const [geometricObj] = await db
        .insert(geometricObjects)
        .values({
          extractionResultId: dbResult.id,
          drawingId,
          objectType: 'room',
          subType: r.classification.type,
          geometry: {
            type: 'polygon',
            coordinates: r.room.bounds,
          },
          properties: {
            label: r.classification.label,
            area: r.room.area,
            center_x: r.room.center.x,
            center_y: r.room.center.y,
          },
          confidence: r.classification.confidence,
          detectionMethod: 'hybrid-cv-ai',
          metadata: {
            room_id: r.room.id,
            cv_detected: true,
            ai_classified: true,
          },
        })
        .returning();

      geometricObjectIds.push(geometricObj.id);
    }

    return {
      success: true,
      extractionResultId: dbResult.id,
      tool: 'hybrid-wall-detector',
      objectCount: result.walls.length + result.rooms.length,
      geometricObjectIds,
      processingTime,
      cost: estimatedCost,
      metadata: result.metadata,
    };
  } catch (error) {
    console.error(`  Hybrid Detector failed:`, error);
    throw error;
  }
}
