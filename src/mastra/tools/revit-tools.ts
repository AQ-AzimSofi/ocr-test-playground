import { createTool } from '@mastra/core';
import { z } from 'zod';
import { getRevitMCPClient } from '../clients/revit-mcp-client';
import type { GeometricElement } from '../../types';

const isDevelopment = process.env.NODE_ENV !== 'production';

/**
 * Revit MCP Tools
 *
 * Mastra tools that wrap Revit MCP client operations.
 * These tools can be used by AI agents to interact with Revit.
 */

// ============================================================================
// Schemas
// ============================================================================

const coordinateSchema = z.object({
  x: z.number().describe('X coordinate in millimeters'),
  y: z.number().describe('Y coordinate in millimeters'),
});

const geometrySchema = z.object({
  type: z.enum(['line', 'point', 'polygon']),
  coordinates_mm: z.array(coordinateSchema),
});

const elementPropertiesSchema = z.object({
  subType: z.string().optional(),
  length_mm: z.number().optional(),
  width_mm: z.number().optional(),
  thickness_mm: z.number().optional(),
  height_mm: z.number().optional(),
  sill_height_mm: z.number().optional(),
  room_label: z.string().optional(),
  room_number: z.string().optional(),
  level: z.string().optional(),
});

const geometricElementSchema = z.object({
  id: z.string(),
  type: z.enum(['wall', 'door', 'window', 'room', 'stair', 'column']),
  geometry: geometrySchema,
  properties: elementPropertiesSchema,
  metadata: z.record(z.any()).optional(),
});

// ============================================================================
// Tool: Check Revit Status
// ============================================================================

export const revitStatusTool = createTool({
  id: 'revit-status',
  description:
    'Check if Revit is available and get project information. Returns connection status, Revit version, and available families.',
  inputSchema: z.object({}),
  outputSchema: z.object({
    isAvailable: z.boolean().describe('Whether Revit MCP server is available'),
    isConnected: z.boolean().describe('Whether client is connected'),
    revitVersion: z.string().optional().describe('Revit version if available'),
    activeDocument: z.string().optional().describe('Active document name'),
    projectInfo: z
      .object({
        name: z.string(),
        levels: z.array(z.string()),
        wallTypes: z.array(z.string()),
        doorFamilies: z.array(z.string()),
        windowFamilies: z.array(z.string()),
      })
      .optional(),
  }),
  execute: async () => {
    const client = getRevitMCPClient();
    const status = await client.getStatus();
    return status;
  },
});

// ============================================================================
// Tool: Create Single Wall
// ============================================================================

export const createWallTool = createTool({
  id: 'create-wall',
  description: 'Create a single wall in Revit with specified geometry and properties',
  inputSchema: z.object({
    startPoint_mm: coordinateSchema.describe('Start point coordinates in mm'),
    endPoint_mm: coordinateSchema.describe('End point coordinates in mm'),
    wallType: z.string().optional().default('Generic - 200mm').describe('Wall type name'),
    height_mm: z.number().optional().default(3000).describe('Wall height in mm'),
    thickness_mm: z.number().optional().default(200).describe('Wall thickness in mm'),
    level: z.string().optional().default('Level 1').describe('Level name'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    elementId: z.string().optional(),
    revitUniqueId: z.string().optional(),
    error: z.string().optional(),
  }),
  execute: async ({ context }) => {
    const client = getRevitMCPClient();
    const result = await client.createWall(context);
    return result;
  },
});

// ============================================================================
// Tool: Create Single Door
// ============================================================================

export const createDoorTool = createTool({
  id: 'create-door',
  description: 'Create a wall-hosted door in Revit',
  inputSchema: z.object({
    centerPoint_mm: coordinateSchema.describe('Door center point in mm'),
    hostWallId: z.string().optional().describe('Revit ID of host wall'),
    doorFamily: z.string().optional().default('Single-Flush').describe('Door family name'),
    width_mm: z.number().optional().default(900).describe('Door width in mm'),
    height_mm: z.number().optional().default(2000).describe('Door height in mm'),
    level: z.string().optional().default('Level 1').describe('Level name'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    elementId: z.string().optional(),
    revitUniqueId: z.string().optional(),
    error: z.string().optional(),
  }),
  execute: async ({ context }) => {
    const client = getRevitMCPClient();
    const result = await client.createDoor(context);
    return result;
  },
});

// ============================================================================
// Tool: Create Single Window
// ============================================================================

export const createWindowTool = createTool({
  id: 'create-window',
  description: 'Create a wall-hosted window in Revit',
  inputSchema: z.object({
    centerPoint_mm: coordinateSchema.describe('Window center point in mm'),
    hostWallId: z.string().optional().describe('Revit ID of host wall'),
    windowFamily: z.string().optional().default('Fixed').describe('Window family name'),
    width_mm: z.number().optional().default(1200).describe('Window width in mm'),
    height_mm: z.number().optional().default(1500).describe('Window height in mm'),
    sillHeight_mm: z.number().optional().default(900).describe('Sill height in mm'),
    level: z.string().optional().default('Level 1').describe('Level name'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    elementId: z.string().optional(),
    revitUniqueId: z.string().optional(),
    error: z.string().optional(),
  }),
  execute: async ({ context }) => {
    const client = getRevitMCPClient();
    const result = await client.createWindow(context);
    return result;
  },
});

// ============================================================================
// Tool: Create Single Room
// ============================================================================

export const createRoomTool = createTool({
  id: 'create-room',
  description: 'Create a room in Revit at specified location',
  inputSchema: z.object({
    centerPoint_mm: coordinateSchema.describe('Room center point in mm'),
    roomName: z.string().optional().default('Room').describe('Room name'),
    roomNumber: z.string().optional().default('').describe('Room number'),
    level: z.string().optional().default('Level 1').describe('Level name'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    elementId: z.string().optional(),
    revitUniqueId: z.string().optional(),
    error: z.string().optional(),
  }),
  execute: async ({ context }) => {
    const client = getRevitMCPClient();
    const result = await client.createRoom(context);
    return result;
  },
});

// ============================================================================
// Tool: Create Elements in Batch
// ============================================================================

export const createElementsBatchTool = createTool({
  id: 'create-elements-batch',
  description:
    'Create multiple Revit elements (walls, doors, windows, rooms) from floor plan analysis. ' +
    'Automatically handles creation order (walls first, then doors/windows) and progress tracking.',
  inputSchema: z.object({
    elements: z.array(geometricElementSchema).describe('Array of geometric elements to create'),
    level: z.string().optional().default('Level 1').describe('Level name for all elements'),
    stopOnError: z
      .boolean()
      .optional()
      .default(false)
      .describe('Stop creation if an error occurs'),
  }),
  outputSchema: z.object({
    success: z.boolean().describe('Overall success status'),
    totalElements: z.number().describe('Total number of elements attempted'),
    successCount: z.number().describe('Number of successfully created elements'),
    failureCount: z.number().describe('Number of failed elements'),
    results: z
      .array(
        z.object({
          originalIndex: z.number(),
          success: z.boolean(),
          elementId: z.string().optional(),
          revitUniqueId: z.string().optional(),
          error: z.string().optional(),
        })
      )
      .describe('Detailed results for each element'),
    errors: z
      .array(
        z.object({
          index: z.number(),
          error: z.string(),
        })
      )
      .describe('List of errors that occurred'),
  }),
  execute: async ({ context }) => {
    const { elements, level, stopOnError } = context;
    const client = getRevitMCPClient();

    // Cast elements to GeometricElement type
    const geometricElements = elements as GeometricElement[];

    const result = await client.createElementsBatch(geometricElements, {
      level,
      stopOnError,
      onProgress: (progress) => {
        if (isDevelopment) {
          console.log(
            `Creating element ${progress.current}/${progress.total}: ${progress.element.type} (${progress.element.id})`
          );
        }
      },
    });

    return result;
  },
});

// ============================================================================
// Tool: Query Revit Elements
// ============================================================================

export const queryRevitElementsTool = createTool({
  id: 'query-revit-elements',
  description:
    'Query existing elements in Revit by type, level, or bounding box. ' +
    'Useful for checking what already exists before creating new elements.',
  inputSchema: z.object({
    type: z
      .enum(['wall', 'door', 'window', 'room', 'stair', 'column'])
      .optional()
      .describe('Filter by element type'),
    level: z.string().optional().describe('Filter by level name'),
    boundingBox: z
      .object({
        min: coordinateSchema,
        max: coordinateSchema,
      })
      .optional()
      .describe('Filter by bounding box'),
  }),
  outputSchema: z.object({
    elements: z.array(z.any()).describe('Array of matching elements'),
    count: z.number().describe('Number of elements found'),
  }),
  execute: async ({ context }) => {
    const client = getRevitMCPClient();
    const elements = await client.queryElements(context);

    return {
      elements,
      count: elements.length,
    };
  },
});

// ============================================================================
// Export all tools as an array for easy registration
// ============================================================================

export const revitTools = [
  revitStatusTool,
  createWallTool,
  createDoorTool,
  createWindowTool,
  createRoomTool,
  createElementsBatchTool,
  queryRevitElementsTool,
];

export default revitTools;
