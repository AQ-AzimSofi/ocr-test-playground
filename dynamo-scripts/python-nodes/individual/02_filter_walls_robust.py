"""
Dynamo Python Script Node 2: Filter Walls and Prepare Data (Robust Version)
Extracts wall elements and converts coordinates to Revit units (feet)

This version handles both connection methods:
- If connected via Code Block (recommended): receives elements array directly
- If connected directly: extracts elements from the output list
"""

# Inputs from previous node
raw_input = IN[0]

# Smart detection: Check if we received a list of dicts (elements) or the full output list
if isinstance(raw_input, list) and len(raw_input) > 0:
    # Check first item to determine what we received
    first_item = raw_input[0]

    if isinstance(first_item, dict):
        # We received the elements array directly (via Code Block)
        elements = raw_input
    elif isinstance(first_item, list):
        # We received the full output list [metadata, elements, ...]
        # Extract elements (index 1)
        elements = raw_input[1] if len(raw_input) > 1 else []
    else:
        # Unknown format
        elements = []
else:
    elements = []

# Conversion factor: millimeters to feet
# Revit's internal coordinate system uses decimal feet
MM_TO_FEET = 1.0 / 304.8

# Filter for walls only
walls = [e for e in elements if e.get('type') == 'wall']

# Prepare wall data for Revit creation
wall_data = []

for wall in walls:
    # Extract geometry
    geometry = wall.get('geometry', {})
    coords_mm = geometry.get('coordinates_mm', [])

    # Skip if we don't have valid line geometry
    if len(coords_mm) < 2:
        continue

    # Get start and end points (already in millimeters from pipeline)
    start_mm = coords_mm[0]
    end_mm = coords_mm[1]

    # Convert millimeters to feet for Revit
    start_ft = {
        'x': start_mm['x'] * MM_TO_FEET,
        'y': start_mm['y'] * MM_TO_FEET,
        'z': 0.0  # Ground level
    }

    end_ft = {
        'x': end_mm['x'] * MM_TO_FEET,
        'y': end_mm['y'] * MM_TO_FEET,
        'z': 0.0  # Ground level
    }

    # Extract properties
    properties = wall.get('properties', {})
    thickness_mm = properties.get('thickness', 150)  # Default 150mm
    height_mm = properties.get('height', 3000)       # Default 3000mm (3 meters)

    # Convert to feet
    thickness_ft = thickness_mm * MM_TO_FEET
    height_ft = height_mm * MM_TO_FEET

    # Store wall data
    wall_data.append({
        'id': wall.get('id'),
        'subType': wall.get('subType', 'interior-wall'),
        'start': start_ft,
        'end': end_ft,
        'thickness': thickness_ft,
        'height': height_ft,
        'confidence': wall.get('confidence', 0),
        'dimension_text': properties.get('dimension_text', ''),
        'length_verified': properties.get('length_verified', False)
    })

# Output for next node
# Simplified: just output wall_data directly
# The create walls script expects a list of wall dictionaries
OUT = wall_data
