"""
ULTRA-SIMPLE WALL CREATOR - Paste this into a Dynamo Python node

Required: ONLY the JSON file path (IN[0])
Auto-selects: First available wall type and level

2-Node Workflow:
  [File Path] → [Python Script with this code] → Done!

Example:
  IN[0] = "C:\\Users\\azimsofi\\Desktop\\zumen_04b-revit.json"
  or
  IN[0] = "\\\\wsl$\\Ubuntu\\home\\azimsofi\\kjm\\ocr-test-playground\\revit-outputs\\zumen_04b-revit.json"
"""

import clr
clr.AddReference('RevitAPI')
clr.AddReference('RevitServices')
from Autodesk.Revit.DB import *
from RevitServices.Persistence import DocumentManager
from RevitServices.Transactions import TransactionManager

import json

# Get current Revit document
doc = DocumentManager.Instance.CurrentDBDocument

# INPUT
json_file_path = IN[0] if IN[0] else ""

# OUTPUT variables
created_walls = []
error_log = []
success_count = 0
failed_count = 0

# Validation
if not json_file_path:
    error_log.append("ERROR: No JSON file path provided. Connect a File Path node to IN[0].")
else:
    try:
        # AUTO-SELECT WALL TYPE
        # Get all wall types in the project
        wall_types = FilteredElementCollector(doc).OfClass(WallType).ToElements()

        if len(wall_types) == 0:
            error_log.append("ERROR: No wall types found in project. Create a basic wall type first.")
        else:
            # Use the first Basic Wall type found
            wall_type = None
            for wt in wall_types:
                # Try to find a basic wall (not curtain wall, stacked wall, etc.)
                if wt.Kind == WallKind.Basic:
                    wall_type = wt
                    break

            # Fallback to first wall type if no basic wall found
            if not wall_type:
                wall_type = wall_types[0]

            # AUTO-SELECT LEVEL
            # Get all levels in the project
            levels = FilteredElementCollector(doc).OfClass(Level).ToElements()

            if len(levels) == 0:
                error_log.append("ERROR: No levels found in project.")
            else:
                # Try to find "Level 1" or use the first level
                level = None
                for lv in levels:
                    if "Level 1" in lv.Name or "レベル 1" in lv.Name:
                        level = lv
                        break

                # Fallback to first level
                if not level:
                    level = levels[0]

                # Load and process JSON
                with open(json_file_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)

                elements = data.get('elements', [])
                walls = [e for e in elements if e.get('type') == 'wall']

                if len(walls) == 0:
                    error_log.append("WARNING: No walls found in JSON file.")
                else:
                    # Start transaction
                    TransactionManager.Instance.EnsureInTransaction(doc)

                    # Conversion factor
                    MM_TO_FEET = 1.0 / 304.8

                    # Create walls
                    for wall in walls:
                        try:
                            geometry = wall.get('geometry', {})
                            coords_mm = geometry.get('coordinates_mm', [])

                            if len(coords_mm) < 2:
                                failed_count += 1
                                continue

                            start_mm = coords_mm[0]
                            end_mm = coords_mm[1]

                            # Convert to feet
                            start_x_ft = start_mm['x'] * MM_TO_FEET
                            start_y_ft = start_mm['y'] * MM_TO_FEET
                            end_x_ft = end_mm['x'] * MM_TO_FEET
                            end_y_ft = end_mm['y'] * MM_TO_FEET

                            # Get height
                            properties = wall.get('properties', {})
                            height_mm = properties.get('height', 3000)
                            height_ft = height_mm * MM_TO_FEET

                            # Create points and line
                            start_point = XYZ(start_x_ft, start_y_ft, 0)
                            end_point = XYZ(end_x_ft, end_y_ft, 0)
                            wall_curve = Line.CreateBound(start_point, end_point)

                            # Create wall
                            new_wall = Wall.Create(
                                doc, wall_curve, wall_type.Id, level.Id,
                                height_ft, 0, False, False
                            )

                            created_walls.append(new_wall)
                            success_count += 1

                        except Exception as e:
                            failed_count += 1
                            wall_id_short = wall.get('id', 'unknown')[:8]
                            error_log.append("Failed wall {}: {}".format(wall_id_short, str(e)[:50]))

                    # Commit transaction
                    TransactionManager.Instance.TransactionTaskDone()

                    # Add success message
                    error_log.insert(0, "Using wall type: {} | Level: {}".format(wall_type.Name, level.Name))

    except FileNotFoundError:
        error_log.append("ERROR: JSON file not found at: {}".format(json_file_path))
    except json.JSONDecodeError as e:
        error_log.append("ERROR: Invalid JSON format: {}".format(str(e)))
    except Exception as e:
        error_log.append("ERROR: {}".format(str(e)))

# OUTPUT
OUT = [created_walls, success_count, failed_count, error_log]
