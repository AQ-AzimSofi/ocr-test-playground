# Revit Integration Guide

This guide explains how to use the generated JSON/CSV files to create 3D models in Revit using Dynamo.

## Overview

The OCR processing pipeline extracts geometric objects (walls, doors, windows) from 2D architectural drawings and outputs them in a Revit-compatible format. This allows you to automatically generate 3D BIM models from 2D drawings.

## Workflow

```
2D Drawing (PNG/JPG/PDF)
         ↓
   OCR Pipeline
         ↓
Geometric Objects Detection
         ↓
Dimension Association
         ↓
Revit JSON/CSV Output
         ↓
   Dynamo Script
         ↓
3D Revit Model
```

## Generated Output Files

After running the Revit pipeline, you'll find two files in the `revit-outputs/` directory:

### 1. JSON File (`[drawing-id]-revit.json`)

**Structure:**

```json
{
  "metadata": {
    "drawing_id": "zumen_04b",
    "file_name": "zumen_04b.png",
    "scale": "1:100",
    "units": "mm",
    "image_width": 960,
    "image_height": 679,
    "processing_date": "2025-11-09T00:32:15.110Z",
    "tool": "gemini-geometric"
  },
  "elements": [
    {
      "id": "uuid-here",
      "type": "wall",
      "subType": "exterior-wall",
      "geometry": {
        "type": "line",
        "coordinates": [
          { "x": 864, "y": 98 },
          { "x": 864, "y": 520 }
        ]
      },
      "properties": {
        "length": 7280,
        "thickness": 12,
        "height": 2700,
        "dimension_text": "7,280"
      },
      "level": "Level 1",
      "confidence": 0.95
    }
  ],
  "statistics": {
    "total_elements": 48,
    "elements_by_type": {
      "wall": 17,
      "door": 7,
      "window": 11,
      "room": 13
    },
    "elements_with_dimensions": 22
  }
}
```

**Key Fields:**

- `metadata.scale`: Drawing scale (e.g., "1:100") - important for converting pixel coordinates to real-world dimensions
- `metadata.units`: Units used (typically "mm")
- `elements[].type`: Element type (`wall`, `door`, `window`, `room`)
- `elements[].geometry.coordinates`: Start and end points (for lines) or vertices (for polygons)
- `elements[].properties.length`: Extracted dimension in mm
- `elements[].properties.thickness`: Wall thickness in mm
- `elements[].properties.height`: 3D extrusion height (default: 2700mm for walls)

### 2. CSV File (`[drawing-id]-revit.csv`)

Simplified tabular format for easier import into Dynamo or Excel:

```csv
ID,Type,SubType,GeometryType,StartX,StartY,EndX,EndY,Length,Width,Thickness,Height,Level,DimensionText,Confidence
"uuid","wall","exterior-wall","line",864,98,864,520,7280,,,2700,"Level 1","7,280",0.95
```

## Using Dynamo to Generate 3D Models

### Prerequisites

1. **Autodesk Revit** (2020 or later)
2. **Dynamo** (comes with Revit, or install separately)
3. **Python in Dynamo** (for JSON parsing)

### Step 1: Create a New Dynamo Script

1. Open Revit
2. Go to **Manage** → **Dynamo**
3. Create a new script

### Step 2: Read the JSON File

Use these Dynamo nodes:

**Method A: Using Python Script**

```python
# Python Script Node in Dynamo
import json
import clr
clr.AddReference('ProtoGeometry')
from Autodesk.DesignScript.Geometry import *

# File path input
file_path = IN[0]

# Read JSON
with open(file_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

# Extract metadata
metadata = data['metadata']
scale_str = metadata.get('scale', '1:100')
scale_ratio = int(scale_str.split(':')[1])  # e.g., 100 from "1:100"

# Extract elements
elements = data['elements']
walls = [e for e in elements if e['type'] == 'wall']

# Output
OUT = [metadata, walls, scale_ratio]
```

**Method B: Using File.ReadText + String.FromJSON**

1. Use **File Path** node to select the JSON file
2. Use **File.ReadText** node to read the file content
3. Use **String.FromJSON** (if available) to parse JSON

### Step 3: Convert Pixel Coordinates to Real-World Dimensions

The coordinates in the JSON are in **pixel space** from the original drawing image. You need to convert them to real-world dimensions.

**Conversion formula:**

```
scale_ratio = 100 (from "1:100")
image_width = 960px
assumed_real_width = 10920mm (from dimension text)

pixels_per_mm = image_width / assumed_real_width
real_coordinate = pixel_coordinate / pixels_per_mm
```

**Python script for conversion:**

```python
# Inputs: walls (from previous node), scale_ratio
walls = IN[0]
scale_ratio = IN[1]

# Conversion factor (customize based on your drawing)
# Option 1: Use metadata if available
# Option 2: Calculate from known dimension
pixels_per_mm = 0.088  # Example: 960px / 10920mm

converted_walls = []
for wall in walls:
    coords = wall['geometry']['coordinates']

    # Convert coordinates
    start_x = coords[0]['x'] / pixels_per_mm
    start_y = coords[0]['y'] / pixels_per_mm
    end_x = coords[1]['x'] / pixels_per_mm
    end_y = coords[1]['y'] / pixels_per_mm

    converted_walls.append({
        'id': wall['id'],
        'start': (start_x, start_y, 0),  # Z=0 for ground level
        'end': (end_x, end_y, 0),
        'thickness': wall['properties'].get('thickness', 150),
        'height': wall['properties'].get('height', 2700),
        'type': wall.get('subType', 'interior-wall')
    })

OUT = converted_walls
```

### Step 4: Create Wall Elements in Revit

Use these Dynamo nodes:

**Node Graph:**

```
[JSON File Path]
      ↓
[Read & Parse JSON] (Python)
      ↓
[Convert Coordinates] (Python)
      ↓
[Create Points] (Point.ByCoordinates)
      ↓
[Create Lines] (Line.ByStartPointEndPoint)
      ↓
[Select Wall Type] (Wall Types picker)
      ↓
[Select Level] (Levels picker - "Level 1")
      ↓
[Create Walls] (Wall.ByCurveAndHeight)
```

**Python script to create walls:**

```python
import clr
clr.AddReference('RevitAPI')
clr.AddReference('RevitServices')
from Autodesk.Revit.DB import *
from RevitServices.Persistence import DocumentManager
from RevitServices.Transactions import TransactionManager

# Inputs
converted_walls = IN[0]
wall_type = UnwrapElement(IN[1])  # Wall Type from picker
level = UnwrapElement(IN[2])  # Level from picker

doc = DocumentManager.Instance.CurrentDBDocument
created_walls = []

# Start transaction
TransactionManager.Instance.EnsureInTransaction(doc)

for wall_data in converted_walls:
    # Create start and end points
    start_point = XYZ(wall_data['start'][0], wall_data['start'][1], 0)
    end_point = XYZ(wall_data['end'][0], wall_data['end'][1], 0)

    # Create line (curve)
    line = Line.CreateBound(start_point, end_point)

    # Create wall
    height = wall_data['height'] / 304.8  # Convert mm to feet (Revit uses feet)
    wall = Wall.Create(doc, line, wall_type.Id, level.Id, height, 0, False, False)

    created_walls.append(wall)

# End transaction
TransactionManager.Instance.TransactionTaskDone()

OUT = created_walls
```

### Step 5: Add Doors and Windows

Similar process for doors and windows:

```python
# Filter doors from elements
doors = [e for e in elements if e['type'] == 'door']

# For each door:
for door_data in doors:
    # Find the host wall (nearest wall to door location)
    # Create door instance on wall
    # Use FamilyInstance.ByPointAndLevel or similar
```

## Alternative Approach: IFC Export

If Dynamo is complex, you can also:

1. Convert the JSON to **IFC format** (Industry Foundation Classes)
2. Import IFC into Revit directly

**JSON → IFC conversion:**

Create a Python script that:

- Reads the JSON
- Uses `ifcopenshell` library
- Generates IFC file with walls, doors, windows
- Imports into Revit via **Insert** → **Import IFC**

## Coordinate System Notes

### Pixel Coordinates vs. Real-World Coordinates

**Important:** The JSON file contains coordinates in **pixel space** (from the original image), not real-world dimensions.

**Coordinate origin:**

- **Image pixel space**: Top-left corner is (0, 0), x increases right, y increases down
- **Revit space**: Origin varies, typically (0, 0, 0) in project base point

**Transformation required:**

1. **Scale conversion**: pixels → mm (using drawing scale)
2. **Axis flip**: Y-axis is inverted (image Y down vs. Revit Y up)
3. **Origin offset**: Adjust to desired Revit origin

**Example transformation:**

```python
# Convert pixel coordinates to Revit coordinates
def pixel_to_revit(px, py, image_height, pixels_per_mm):
    # Convert pixels to mm
    x_mm = px / pixels_per_mm
    y_mm = py / pixels_per_mm

    # Flip Y axis (image Y down → Revit Y up)
    y_mm_flipped = image_height / pixels_per_mm - y_mm

    # Convert mm to feet (Revit internal units)
    x_ft = x_mm / 304.8
    y_ft = y_mm_flipped / 304.8

    return (x_ft, y_ft, 0)
```

## Example Dynamo Workflow

### Minimal Wall Generation Script

**Inputs:**

- JSON file path
- Wall type (from Revit)
- Level (from Revit)

**Process:**

1. Read JSON
2. Filter wall elements
3. Convert coordinates
4. Create Revit walls

**Outputs:**

- List of created wall elements
- Success/failure count

### Complete Project Script

**Additional features:**

- Create doors and windows as family instances
- Create rooms as room elements
- Apply materials based on wall type (exterior vs. interior)
- Set parameters (fire rating, structural, etc.)
- Create floor plan views

## Troubleshooting

### Common Issues

**1. Walls not appearing:**

- Check coordinate conversion (pixels → mm → feet)
- Verify wall height is not zero
- Ensure level is correct

**2. Walls in wrong location:**

- Check Y-axis flip
- Verify scale ratio calculation
- Check pixels_per_mm conversion factor

**3. JSON parsing errors:**

- Ensure JSON file is valid (use JSON validator)
- Check file encoding (UTF-8)
- Verify file path is correct

**4. Wall creation fails:**

- Check wall type is valid
- Ensure level exists
- Verify start and end points are different

## Next Steps

1. **Test with simple drawing**: Start with a simple floor plan with 4-5 walls
2. **Refine coordinate conversion**: Calibrate pixels_per_mm factor
3. **Add more element types**: Implement doors, windows, rooms
4. **Create reusable Dynamo package**: Package your script for reuse
5. **Automate**: Create batch processing workflow for multiple drawings

## Resources

- **Dynamo Primer**: [dynamoprimer.com](https://dynamoprimer.com)
- **Dynamo Forum**: [forum.dynamobim.com](https://forum.dynamobim.com)
- **Revit API Docs**: [www.revitapidocs.com](https://www.revitapidocs.com)
- **ifcopenshell** (IFC export): [ifcopenshell.org](https://ifcopenshell.org)

## Support

For issues with:

- **OCR Pipeline**: Check the main README.md
- **Dynamo Scripts**: Refer to Dynamo documentation
- **Revit API**: Consult Revit API docs

## Example Files

Sample Dynamo scripts will be added to the `dynamo-scripts/` directory:

- `simple-wall-import.dyn` - Basic wall creation
- `complete-import.dyn` - Walls + doors + windows
- `coordinate-conversion.py` - Coordinate transformation utilities
