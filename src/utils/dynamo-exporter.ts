/**
 * Dynamo/Revit Export Utility
 * Converts geometric objects (rooms, walls) to Dynamo Python script format
 */

export interface GeometricObject {
  id: string;
  objectType: 'wall' | 'room' | 'door' | 'window';
  subType?: string;
  geometry: {
    type: 'line' | 'polygon' | 'point';
    coordinates: Array<{ x: number; y: number }>;
  };
  properties: {
    length?: number;
    thickness?: number;
    area?: number;
    label?: string;
    [key: string]: any;
  };
  confidence: number;
}

export interface DynamoExportOptions {
  scaleFactor?: number; // Pixels to mm conversion (e.g., 1 pixel = 10mm)
  units?: 'mm' | 'feet' | 'meters';
  includeWalls?: boolean;
  includeRooms?: boolean;
  includeDoors?: boolean;
  wallHeight?: number; // Default wall height in target units
}

const DEFAULT_OPTIONS: Required<DynamoExportOptions> = {
  scaleFactor: 10, // 1 pixel = 10mm by default
  units: 'mm',
  includeWalls: true,
  includeRooms: true,
  includeDoors: true,
  wallHeight: 3000, // 3000mm = 3 meters
};

/**
 * Export geometric objects to Dynamo Python script
 */
export function exportToDynamoPython(
  objects: GeometricObject[],
  options: DynamoExportOptions = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const rooms = objects.filter((obj) => obj.objectType === 'room');
  const walls = objects.filter((obj) => obj.objectType === 'wall');
  const doors = objects.filter((obj) => obj.objectType === 'door');

  const script = `# Dynamo Python Script - Generated from Floor Plan OCR
# Units: ${opts.units}
# Scale Factor: 1 pixel = ${opts.scaleFactor} ${opts.units}

import clr
clr.AddReference('RevitAPI')
clr.AddReference('RevitServices')

from Autodesk.Revit.DB import *
from RevitServices.Persistence import DocumentManager
from RevitServices.Transactions import TransactionManager

doc = DocumentManager.Instance.CurrentDBDocument

# Helper function to create XYZ point
def create_point(x_px, y_px, z=0):
    """Convert pixel coordinates to Revit XYZ with scaling"""
    x = x_px * ${opts.scaleFactor}
    y = y_px * ${opts.scaleFactor}
    z = z * ${opts.scaleFactor}
    return XYZ(x, y, z)

# Helper function to convert units
def ${opts.units}_to_feet(value):
    """Convert ${opts.units} to feet (Revit's internal unit)"""
    ${generateUnitConversion(opts.units)}

${opts.includeRooms ? generateRoomsCode(rooms, opts) : '# Rooms export disabled'}

${opts.includeWalls ? generateWallsCode(walls, opts) : '# Walls export disabled'}

${opts.includeDoors ? generateDoorsCode(doors, opts) : '# Doors export disabled'}

# Output results
OUT = {
    'rooms_created': len(created_rooms) if ${opts.includeRooms} else 0,
    'walls_created': len(created_walls) if ${opts.includeWalls} else 0,
    'doors_created': len(created_doors) if ${opts.includeDoors} else 0,
}
`;

  return script;
}

/**
 * Generate unit conversion function
 */
function generateUnitConversion(units: string): string {
  switch (units) {
    case 'mm':
      return 'return value / 304.8  # 1 foot = 304.8mm';
    case 'meters':
      return 'return value / 0.3048  # 1 foot = 0.3048m';
    case 'feet':
      return 'return value  # Already in feet';
    default:
      return 'return value / 304.8';
  }
}

/**
 * Generate Python code for creating rooms
 */
function generateRoomsCode(rooms: GeometricObject[], opts: Required<DynamoExportOptions>): string {
  if (rooms.length === 0) {
    return '# No rooms to create\ncreated_rooms = []';
  }

  let code = `# ============================================
# ROOMS
# ============================================

TransactionManager.Instance.EnsureInTransaction(doc)

created_rooms = []

# Find first level in project
levels = FilteredElementCollector(doc).OfClass(Level).ToElements()
if levels.Count == 0:
    raise Exception("No levels found in project. Please create a level first.")
level = levels[0]

# Room creation function
def create_room_boundary(polygon_points):
    """Create room boundary curve loop from polygon vertices"""
    curves = []

    for i in range(len(polygon_points)):
        p1 = polygon_points[i]
        p2 = polygon_points[(i + 1) % len(polygon_points)]  # Wrap to first point

        line = Line.CreateBound(p1, p2)
        curves.append(line)

    return CurveLoop.Create(curves)

`;

  rooms.forEach((room, index) => {
    const vertices = room.geometry.coordinates;
    const roomName = room.properties.label || room.subType || `Room ${index + 1}`;
    const areaM2 = room.properties.area
      ? (room.properties.area * opts.scaleFactor * opts.scaleFactor) / 1000000
      : 0;

    code += `
# Room ${index + 1}: ${roomName} (${vertices.length} vertices, ~${areaM2.toFixed(1)}m²)
room_${index}_points = [
${vertices.map((v) => `    create_point(${v.x}, ${v.y}, 0),`).join('\n')}
]

try:
    room_boundary_${index} = create_room_boundary(room_${index}_points)

    # Create room
    # Note: In Revit, rooms are created at a point, not from boundaries
    # The boundary is implied by surrounding walls
    center_x = sum([p.X for p in room_${index}_points]) / len(room_${index}_points)
    center_y = sum([p.Y for p in room_${index}_points]) / len(room_${index}_points)
    room_point = XYZ(center_x, center_y, 0)

    new_room = doc.Create.NewRoom(level, UV(room_point.X, room_point.Y))
    new_room.Name = "${roomName}"
    new_room.Number = "${index + 1}"

    created_rooms.append(new_room.Id)
    print(f"Created room: ${roomName}")

except Exception as e:
    print(f"Failed to create room ${roomName}: {str(e)}")

`;
  });

  code += `\nTransactionManager.Instance.TransactionTaskDone()\n`;

  return code;
}

/**
 * Generate Python code for creating walls
 */
function generateWallsCode(walls: GeometricObject[], opts: Required<DynamoExportOptions>): string {
  if (walls.length === 0) {
    return '# No walls to create\ncreated_walls = []';
  }

  let code = `# ============================================
# WALLS
# ============================================

TransactionManager.Instance.EnsureInTransaction(doc)

created_walls = []

# Find first level and wall type
levels = FilteredElementCollector(doc).OfClass(Level).ToElements()
if levels.Count == 0:
    raise Exception("No levels found in project.")
level = levels[0]

wall_types = FilteredElementCollector(doc).OfClass(WallType).ToElements()
if wall_types.Count == 0:
    raise Exception("No wall types found in project.")
wall_type = wall_types[0]

# Wall height in feet
wall_height_feet = ${opts.units}_to_feet(${opts.wallHeight})

`;

  walls.forEach((wall, index) => {
    const coords = wall.geometry.coordinates;
    if (coords.length < 2) return;

    const start = coords[0];
    const end = coords[1];
    const thickness = wall.properties.thickness || 200; // Default 200mm
    const isExterior = wall.subType === 'exterior-wall';

    code += `
# Wall ${index + 1}: ${wall.subType || 'wall'} (thickness: ${thickness}mm)
try:
    wall_${index}_start = create_point(${start.x}, ${start.y}, 0)
    wall_${index}_end = create_point(${end.x}, ${end.y}, 0)
    wall_${index}_line = Line.CreateBound(wall_${index}_start, wall_${index}_end)

    # Create wall
    new_wall = Wall.Create(doc, wall_${index}_line, wall_type.Id, level.Id, wall_height_feet, 0, False, ${isExterior})

    created_walls.append(new_wall.Id)
    print(f"Created wall ${index + 1}: ${start.x},${start.y} to ${end.x},${end.y}")

except Exception as e:
    print(f"Failed to create wall ${index + 1}: {str(e)}")

`;
  });

  code += `\nTransactionManager.Instance.TransactionTaskDone()\n`;

  return code;
}

/**
 * Generate Python code for creating doors
 */
function generateDoorsCode(doors: GeometricObject[], opts: Required<DynamoExportOptions>): string {
  if (doors.length === 0) {
    return '# No doors to create\ncreated_doors = []';
  }

  return `# ============================================
# DOORS
# ============================================
# Note: Door placement requires existing walls
# Implement door placement logic here based on your requirements

created_doors = []
print("Door creation not yet implemented")
`;
}

/**
 * Export to JSON format (for Dynamo custom nodes)
 */
export function exportToDynamoJSON(objects: GeometricObject[], options: DynamoExportOptions = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return {
    version: '1.0.0',
    generator: 'OCR Floor Plan Analyzer',
    units: opts.units,
    scaleFactor: opts.scaleFactor,
    objects: objects.map((obj) => ({
      id: obj.id,
      type: obj.objectType,
      subType: obj.subType,
      geometry: {
        type: obj.geometry.type,
        coordinates: obj.geometry.coordinates.map((p) => ({
          x: p.x * opts.scaleFactor,
          y: p.y * opts.scaleFactor,
        })),
      },
      properties: obj.properties,
      confidence: obj.confidence,
    })),
  };
}
