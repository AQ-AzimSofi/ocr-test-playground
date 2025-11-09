"""
Dynamo Python Script: Complete Wall Creator (All-in-One)
Loads JSON, filters walls, converts coordinates, and creates walls in Revit

IMPORTANT: This script requires EXACTLY 3 inputs!
Before running, make sure you've connected:
  IN[0] - File path to the JSON file (String/File Path node)
  IN[1] - Wall Type from Wall Types selector node
  IN[2] - Level from Levels selector node

This combined approach eliminates data structure mismatches between nodes.
All processing happens in a single transaction for better reliability.

Example JSON path:
  /home/azimsofi/kjm/ocr-test-playground/revit-outputs/zumen_04b-revit.json
"""

# ============================================================================
# BOILERPLATE - Imports for Revit API
# ============================================================================
import clr
clr.AddReference('ProtoGeometry')
from Autodesk.DesignScript.Geometry import *
clr.AddReference('RevitAPI')
from Autodesk.Revit.DB import *
clr.AddReference('RevitServices')
import RevitServices
from RevitServices.Persistence import DocumentManager
from RevitServices.Transactions import TransactionManager

# Get the current Revit document
doc = DocumentManager.Instance.CurrentDBDocument

# ============================================================================
# INPUTS FROM DYNAMO
# ============================================================================
# IN[0] = JSON file path (string)
# IN[1] = Wall Type selected by user
# IN[2] = Level selected by user

# Default values if inputs are not connected
json_file_path = IN[0] if IN[0] else ""
wall_type = UnwrapElement(IN[1]) if IN[1] else None
level = UnwrapElement(IN[2]) if IN[2] else None

# ============================================================================
# PROCESSING - Load JSON, Filter Walls, Create in Revit
# ============================================================================
import json

created_walls = []
error_log = []
success_count = 0
failed_count = 0

# Check if we have everything we need to run
if not json_file_path:
    error_log.append("ERROR: No JSON file path provided. Connect a File Path node to IN[0].")
elif not wall_type:
    error_log.append("ERROR: No Wall Type selected. Connect a Wall Types node to IN[1].")
elif not level:
    error_log.append("ERROR: No Level selected. Connect a Levels node to IN[2].")
else:
    # Safely load the JSON data
    try:
        with open(json_file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        elements = data.get('elements', [])

        # Filter for wall elements only
        walls = [e for e in elements if e.get('type') == 'wall']

        if len(walls) == 0:
            error_log.append("WARNING: No walls found in JSON file.")
        else:
            # Start a transaction to make changes to the Revit model
            TransactionManager.Instance.EnsureInTransaction(doc)

            # Conversion factor: millimeters to feet
            # Revit's internal coordinate system uses decimal feet
            MM_TO_FEET = 1.0 / 304.8

            # Loop through every wall element found in the JSON
            for wall in walls:
                try:
                    # Get the pre-calculated millimeter coordinates
                    geometry = wall.get('geometry', {})
                    coords_mm = geometry.get('coordinates_mm', [])

                    # Skip if we don't have valid line geometry
                    if len(coords_mm) < 2:
                        failed_count += 1
                        error_log.append("Skipped wall {}: Invalid geometry (less than 2 points)".format(
                            wall.get('id', 'unknown')[:8]
                        ))
                        continue

                    start_mm = coords_mm[0]
                    end_mm = coords_mm[1]

                    # --- UNIT CONVERSION ---
                    # Convert our millimeter data to Revit's internal units (decimal feet)
                    start_x_ft = start_mm['x'] * MM_TO_FEET
                    start_y_ft = start_mm['y'] * MM_TO_FEET
                    end_x_ft = end_mm['x'] * MM_TO_FEET
                    end_y_ft = end_mm['y'] * MM_TO_FEET

                    # Get height from properties, use a default if not found
                    properties = wall.get('properties', {})
                    height_mm = properties.get('height', 3000)  # Default 3000mm (3 meters)
                    height_ft = height_mm * MM_TO_FEET

                    # Create Revit API points (Z=0 for ground level)
                    start_point = XYZ(start_x_ft, start_y_ft, 0)
                    end_point = XYZ(end_x_ft, end_y_ft, 0)

                    # Create a line (curve) for the wall's path
                    wall_curve = Line.CreateBound(start_point, end_point)

                    # --- CREATE THE WALL ---
                    # The main Revit API call to create a wall
                    # Wall.Create(document, curve, wallTypeId, levelId, height, offset, flip, structural)
                    new_wall = Wall.Create(
                        doc,              # Document
                        wall_curve,       # Curve (line between start and end)
                        wall_type.Id,     # Wall type ID
                        level.Id,         # Level ID
                        height_ft,        # Height in feet
                        0,                # Offset from level (0 = on the level)
                        False,            # Flip (orientation)
                        False             # Structural (set to False for architectural walls)
                    )

                    created_walls.append(new_wall)
                    success_count += 1

                except Exception as e:
                    # Log an error if a specific wall fails, but continue with others
                    failed_count += 1
                    wall_id_short = wall.get('id', 'unknown')[:8]  # First 8 chars of UUID
                    error_log.append("Failed to create wall {}: {}".format(wall_id_short, str(e)))

            # Commit the transaction to finalize the changes
            TransactionManager.Instance.TransactionTaskDone()

    except FileNotFoundError:
        error_log.append("ERROR: JSON file not found at path: {}".format(json_file_path))
    except json.JSONDecodeError as e:
        error_log.append("ERROR: Invalid JSON format: {}".format(str(e)))
    except Exception as e:
        error_log.append("ERROR: Unexpected error during processing: {}".format(str(e)))

# ============================================================================
# OUTPUTS
# ============================================================================
# Send the results to the output ports
# OUT is a list with 4 elements:
OUT = [
    created_walls,     # [0] List of created Wall elements (for Watch node)
    success_count,     # [1] Number of successfully created walls
    failed_count,      # [2] Number of failed walls
    error_log          # [3] List of error messages (if any)
]
