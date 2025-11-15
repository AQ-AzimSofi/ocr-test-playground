// External imports
import { MCPClient } from '@mastra/mcp';

// Type imports
import type {
  GeometricElement,
  CoordinateTransformationResult,
  ValidationResult
} from '../../types';

const isDevelopment = process.env.NODE_ENV !== 'production';

/**
 * Revit MCP Client
 *
 * Provides a wrapper around the Mastra MCP client to communicate with
 * a Revit MCP server for creating and querying Revit elements.
 *
 * Supports both:
 * - WebSocket/HTTP transport (when Revit MCP server is running)
 * - Graceful fallback (returns null when unavailable)
 */

export interface RevitMCPConfig {
  /** Path to the built revit-mcp index.js file (e.g., /path/to/revit-mcp/build/index.js) */
  mcpPath?: string;
  /** Command to execute (default: 'node') */
  command?: string;
  /** Timeout for MCP operations in milliseconds */
  timeout?: number;
  /** Auto-connect on instantiation */
  autoConnect?: boolean;
}

export interface RevitElementCreateParams {
  type: 'wall' | 'door' | 'window' | 'room' | 'stair' | 'column';
  geometry: {
    type: 'line' | 'point' | 'polygon';
    coordinates_mm: Array<{ x: number; y: number }>;
  };
  properties: {
    subType?: string;
    length_mm?: number;
    width_mm?: number;
    thickness_mm?: number;
    height_mm?: number;
    level?: string;
    [key: string]: any;
  };
  metadata?: {
    confidence?: number;
    dimension_texts?: string[];
    [key: string]: any;
  };
}

export interface RevitElementCreateResult {
  success: boolean;
  elementId?: string;
  revitUniqueId?: string;
  error?: string;
  warnings?: string[];
}

export interface RevitBatchCreateResult {
  success: boolean;
  totalElements: number;
  successCount: number;
  failureCount: number;
  results: Array<RevitElementCreateResult & { originalIndex: number }>;
  errors: Array<{ index: number; error: string }>;
}

export interface RevitStatusResult {
  isAvailable: boolean;
  isConnected: boolean;
  revitVersion?: string;
  activeDocument?: string;
  projectInfo?: {
    name: string;
    levels: string[];
    wallTypes: string[];
    doorFamilies: string[];
    windowFamilies: string[];
  };
}

/**
 * Revit MCP Client
 * Wraps Mastra MCP client for Revit-specific operations
 */
export class RevitMCPClient {
  private client: MCPClient | null = null;
  private isConnected: boolean = false;
  private config: Required<RevitMCPConfig>;

  constructor(config: RevitMCPConfig = {}) {
    this.config = {
      mcpPath: config.mcpPath || process.env.REVIT_MCP_PATH || '',
      command: config.command || 'node',
      timeout: config.timeout || 30000,
      autoConnect: config.autoConnect ?? true,
    };

    if (this.config.autoConnect) {
      this.connect().catch((err) => {
        if (isDevelopment) {
          console.warn('Failed to auto-connect to Revit MCP server:', err.message);
        }
      });
    }
  }

  /**
   * Connect to Revit MCP server via stdio transport
   */
  async connect(): Promise<boolean> {
    try {
      if (!this.config.mcpPath) {
        throw new Error('REVIT_MCP_PATH not configured. Please set the path to revit-mcp/build/index.js');
      }

      // Initialize MCP client with command transport (stdio)
      // This spawns the revit-mcp process and communicates via stdin/stdout
      this.client = new MCPClient({
        command: this.config.command,
        args: [this.config.mcpPath],
        timeout: this.config.timeout,
      });

      // Test connection with a simple tool call
      const tools = await this.client.listTools();
      this.isConnected = tools && tools.length > 0;

      if (this.isConnected && isDevelopment) {
        console.log('[OK] Connected to Revit MCP server');
        console.log(`  Available tools: ${tools.map(t => t.name).join(', ')}`);
      }

      return this.isConnected;
    } catch (error) {
      if (isDevelopment) {
        console.warn('Revit MCP server not available:', error);
      }
      this.isConnected = false;
      return false;
    }
  }

  /**
   * Disconnect from Revit MCP server
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      // MCP client doesn't have explicit disconnect, just cleanup
      this.client = null;
      this.isConnected = false;
    }
  }

  /**
   * Check if client is connected to Revit
   */
  isReady(): boolean {
    return this.isConnected && this.client !== null;
  }

  /**
   * Get Revit status and project information
   */
  async getStatus(): Promise<RevitStatusResult> {
    if (!this.client) {
      return {
        isAvailable: false,
        isConnected: false,
      };
    }

    try {
      // Use get_current_view_info to check connection and get project info
      const result = await this.client.callTool('get_current_view_info', {});

      // Also get available family types for more complete status
      const familyTypes = await this.client.callTool('get_available_family_types', {});

      return {
        isAvailable: true,
        isConnected: true,
        revitVersion: result.revit_version,
        activeDocument: result.document_name,
        projectInfo: {
          name: result.document_name || 'Unknown',
          levels: result.levels || [],
          wallTypes: familyTypes.walls || [],
          doorFamilies: familyTypes.doors || [],
          windowFamilies: familyTypes.windows || [],
        },
      };
    } catch (error) {
      return {
        isAvailable: false,
        isConnected: false,
      };
    }
  }

  /**
   * Create a single wall in Revit using create_line_based_element
   */
  async createWall(params: {
    startPoint_mm: { x: number; y: number };
    endPoint_mm: { x: number; y: number };
    wallType?: string;
    height_mm?: number;
    thickness_mm?: number;
    level?: string;
  }): Promise<RevitElementCreateResult> {
    if (!this.isReady()) {
      return {
        success: false,
        error: 'Revit MCP client not connected',
      };
    }

    try {
      // Convert mm to feet (Revit internal units)
      const MM_TO_FEET = 1.0 / 304.8;

      const result = await this.client!.callTool('create_line_based_element', {
        element_type: 'Wall',
        family_type: params.wallType || 'Generic - 200mm',
        start_point: {
          x: params.startPoint_mm.x * MM_TO_FEET,
          y: params.startPoint_mm.y * MM_TO_FEET,
          z: 0
        },
        end_point: {
          x: params.endPoint_mm.x * MM_TO_FEET,
          y: params.endPoint_mm.y * MM_TO_FEET,
          z: 0
        },
        level: params.level || 'Level 1',
        height: params.height_mm ? params.height_mm * MM_TO_FEET : undefined,
      });

      return {
        success: true,
        elementId: result.element_id,
        revitUniqueId: result.unique_id,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to create wall',
      };
    }
  }

  /**
   * Create a door in Revit (wall-hosted) using create_point_based_element
   */
  async createDoor(params: {
    centerPoint_mm: { x: number; y: number };
    hostWallId?: string;
    doorFamily?: string;
    width_mm?: number;
    height_mm?: number;
    level?: string;
  }): Promise<RevitElementCreateResult> {
    if (!this.isReady()) {
      return {
        success: false,
        error: 'Revit MCP client not connected',
      };
    }

    try {
      // Convert mm to feet (Revit internal units)
      const MM_TO_FEET = 1.0 / 304.8;

      const result = await this.client!.callTool('create_point_based_element', {
        element_type: 'Door',
        family_type: params.doorFamily || 'Single-Flush',
        location: {
          x: params.centerPoint_mm.x * MM_TO_FEET,
          y: params.centerPoint_mm.y * MM_TO_FEET,
          z: 0
        },
        level: params.level || 'Level 1',
        host_id: params.hostWallId,
        // Set width parameter if provided
        parameters: params.width_mm ? {
          Width: params.width_mm * MM_TO_FEET
        } : undefined,
      });

      return {
        success: true,
        elementId: result.element_id,
        revitUniqueId: result.unique_id,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to create door',
      };
    }
  }

  /**
   * Create a window in Revit (wall-hosted) using create_point_based_element
   */
  async createWindow(params: {
    centerPoint_mm: { x: number; y: number };
    hostWallId?: string;
    windowFamily?: string;
    width_mm?: number;
    height_mm?: number;
    sillHeight_mm?: number;
    level?: string;
  }): Promise<RevitElementCreateResult> {
    if (!this.isReady()) {
      return {
        success: false,
        error: 'Revit MCP client not connected',
      };
    }

    try {
      // Convert mm to feet (Revit internal units)
      const MM_TO_FEET = 1.0 / 304.8;

      const result = await this.client!.callTool('create_point_based_element', {
        element_type: 'Window',
        family_type: params.windowFamily || 'Fixed',
        location: {
          x: params.centerPoint_mm.x * MM_TO_FEET,
          y: params.centerPoint_mm.y * MM_TO_FEET,
          z: params.sillHeight_mm ? params.sillHeight_mm * MM_TO_FEET : 0.9 * MM_TO_FEET * 1000  // Default 900mm
        },
        level: params.level || 'Level 1',
        host_id: params.hostWallId,
        // Set width and sill height parameters if provided
        parameters: {
          ...(params.width_mm ? { Width: params.width_mm * MM_TO_FEET } : {}),
          ...(params.height_mm ? { Height: params.height_mm * MM_TO_FEET } : {}),
          ...(params.sillHeight_mm ? { 'Sill Height': params.sillHeight_mm * MM_TO_FEET } : {}),
        },
      });

      return {
        success: true,
        elementId: result.element_id,
        revitUniqueId: result.unique_id,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to create window',
      };
    }
  }

  /**
   * Create a room in Revit
   * Note: Room creation is not directly supported by revit-mcp tools yet.
   * This would need to be implemented via send_code_to_revit or a custom command.
   */
  async createRoom(params: {
    centerPoint_mm: { x: number; y: number };
    roomName?: string;
    roomNumber?: string;
    level?: string;
  }): Promise<RevitElementCreateResult> {
    if (!this.isReady()) {
      return {
        success: false,
        error: 'Revit MCP client not connected',
      };
    }

    // Room creation not yet supported via standard revit-mcp tools
    // Future: Could use send_code_to_revit to execute custom C# code
    return {
      success: false,
      error: 'Room creation not yet supported via revit-mcp. Use send_code_to_revit for custom implementation.',
    };
  }

  /**
   * Query Revit elements by filter
   * Uses get_current_view_elements to retrieve elements from the active view
   */
  async queryElements(filter: {
    type?: string;
    level?: string;
    boundingBox?: { min: { x: number; y: number }; max: { x: number; y: number } };
  }): Promise<Array<any>> {
    if (!this.isReady()) {
      return [];
    }

    try {
      const result = await this.client!.callTool('get_current_view_elements', {
        element_type: filter.type,
      });

      // Filter by level if specified
      let elements = result.elements || [];
      if (filter.level) {
        elements = elements.filter((el: any) => el.level === filter.level);
      }

      return elements;
    } catch (error: any) {
      if (isDevelopment) {
        console.warn('Failed to query Revit elements:', error.message);
      }
      return [];
    }
  }

  /**
   * Create multiple elements in batch
   * This is the main method used by the Mastra pipeline
   */
  async createElementsBatch(
    elements: GeometricElement[],
    options: {
      level?: string;
      onProgress?: (progress: { current: number; total: number; element: GeometricElement }) => void;
      stopOnError?: boolean;
    } = {}
  ): Promise<RevitBatchCreateResult> {
    if (!this.isReady()) {
      return {
        success: false,
        totalElements: elements.length,
        successCount: 0,
        failureCount: elements.length,
        results: [],
        errors: elements.map((_, index) => ({
          index,
          error: 'Revit MCP client not connected',
        })),
      };
    }

    const results: Array<RevitElementCreateResult & { originalIndex: number }> = [];
    const errors: Array<{ index: number; error: string }> = [];
    const elementIdMap = new Map<string, string>(); // Map from original element ID to Revit ID

    // Step 1: Create walls first (they need to exist before doors/windows)
    const walls = elements.filter((el) => el.type === 'wall');
    for (let i = 0; i < walls.length; i++) {
      const element = walls[i];
      const originalIndex = elements.indexOf(element);

      if (options.onProgress) {
        options.onProgress({ current: i + 1, total: elements.length, element });
      }

      const result = await this.createElement(element, options.level);
      results.push({ ...result, originalIndex });

      if (result.success && result.elementId) {
        elementIdMap.set(element.id, result.elementId);
      } else {
        errors.push({ index: originalIndex, error: result.error || 'Unknown error' });
        if (options.stopOnError) {
          break;
        }
      }
    }

    // Step 2: Create doors, windows (they need host walls)
    const hostedElements = elements.filter((el) => el.type === 'door' || el.type === 'window');
    for (let i = 0; i < hostedElements.length; i++) {
      const element = hostedElements[i];
      const originalIndex = elements.indexOf(element);

      if (options.onProgress) {
        options.onProgress({
          current: walls.length + i + 1,
          total: elements.length,
          element,
        });
      }

      // Find nearest wall for hosting
      const nearestWallId = this.findNearestWall(element, elementIdMap);

      const result = await this.createElement(element, options.level, nearestWallId);
      results.push({ ...result, originalIndex });

      if (!result.success) {
        errors.push({ index: originalIndex, error: result.error || 'Unknown error' });
        if (options.stopOnError) {
          break;
        }
      }
    }

    // Step 3: Create other elements (rooms, stairs, columns)
    const otherElements = elements.filter(
      (el) => el.type !== 'wall' && el.type !== 'door' && el.type !== 'window'
    );
    for (let i = 0; i < otherElements.length; i++) {
      const element = otherElements[i];
      const originalIndex = elements.indexOf(element);

      if (options.onProgress) {
        options.onProgress({
          current: walls.length + hostedElements.length + i + 1,
          total: elements.length,
          element,
        });
      }

      const result = await this.createElement(element, options.level);
      results.push({ ...result, originalIndex });

      if (!result.success) {
        errors.push({ index: originalIndex, error: result.error || 'Unknown error' });
        if (options.stopOnError) {
          break;
        }
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.length - successCount;

    return {
      success: failureCount === 0,
      totalElements: elements.length,
      successCount,
      failureCount,
      results,
      errors,
    };
  }

  /**
   * Create a single element (internal helper)
   */
  private async createElement(
    element: GeometricElement,
    level?: string,
    hostWallId?: string
  ): Promise<RevitElementCreateResult> {
    const coords = element.geometry.coordinates_mm;
    const props = element.properties;

    switch (element.type) {
      case 'wall':
        return this.createWall({
          startPoint_mm: coords[0],
          endPoint_mm: coords[1],
          wallType: props.subType,
          height_mm: props.height_mm,
          thickness_mm: props.thickness_mm,
          level,
        });

      case 'door':
        return this.createDoor({
          centerPoint_mm: coords[0],
          hostWallId,
          doorFamily: props.subType,
          width_mm: props.width_mm,
          height_mm: props.height_mm,
          level,
        });

      case 'window':
        return this.createWindow({
          centerPoint_mm: coords[0],
          hostWallId,
          windowFamily: props.subType,
          width_mm: props.width_mm,
          height_mm: props.height_mm,
          sillHeight_mm: props.sill_height_mm,
          level,
        });

      case 'room':
        return this.createRoom({
          centerPoint_mm: coords[0],
          roomName: props.room_label,
          roomNumber: props.room_number,
          level,
        });

      default:
        return {
          success: false,
          error: `Unsupported element type: ${element.type}`,
        };
    }
  }

  /**
   * Find nearest wall ID for hosting doors/windows
   * Simple implementation - can be enhanced with more sophisticated logic
   */
  private findNearestWall(
    element: GeometricElement,
    wallIdMap: Map<string, string>
  ): string | undefined {
    // For now, just return the first wall ID
    // In a real implementation, calculate distances and find closest wall
    const firstWallId = Array.from(wallIdMap.values())[0];
    return firstWallId;
  }
}

/**
 * Singleton instance for global access
 */
let globalRevitClient: RevitMCPClient | null = null;

export function getRevitMCPClient(config?: RevitMCPConfig): RevitMCPClient {
  if (!globalRevitClient) {
    globalRevitClient = new RevitMCPClient(config);
  }
  return globalRevitClient;
}

export function resetRevitMCPClient(): void {
  if (globalRevitClient) {
    globalRevitClient.disconnect();
    globalRevitClient = null;
  }
}
