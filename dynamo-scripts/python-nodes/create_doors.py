"""
DOOR CREATOR - Paste this into a Dynamo Python node

Required: ONLY the JSON file path (IN[0])
Auto-selects: First available door family and level

2-Node Workflow:
  [File Path] → [Python Script with this code] → Done!

Example:
  IN[0] = "C:\\Users\\azimsofi\\Desktop\\clean-sample01-revit.json"
  or
  IN[0] = "\\\\wsl$\\Ubuntu\\home\\azimsofi\\kjm\\ocr-test-playground\\revit-outputs\\clean-sample01-revit.json"
"""

import clr
clr.AddReference('RevitAPI')
clr.AddReference('RevitServices')
from Autodesk.Revit.DB import *
from Autodesk.Revit.DB.Structure import StructuralType
from RevitServices.Persistence import DocumentManager
from RevitServices.Transactions import TransactionManager

import json
import math

# Get current Revit document
doc = DocumentManager.Instance.CurrentDBDocument

# INPUT
json_file_path = IN[0] if IN[0] else ""

# OUTPUT variables
created_doors = []
error_log = []
success_count = 0
failed_count = 0

# ============================================================
# HELPER FUNCTIONS FOR WALL-HOSTED PLACEMENT
# ============================================================

def find_nearest_wall(walls, target_point):
    """Find the nearest wall to a target point."""
    if not walls:
        return None

    nearest_wall = None
    min_distance = float('inf')

    for wall in walls:
        try:
            location_curve = wall.Location
            if location_curve and hasattr(location_curve, 'Curve'):
                curve = location_curve.Curve
                # Get the closest point on the wall curve to the target
                result = curve.Project(target_point)
                if result:
                    distance = result.Distance
                    if distance < min_distance:
                        min_distance = distance
                        nearest_wall = wall
        except:
            continue

    return nearest_wall

def get_wall_insertion_point(wall, target_point, offset_height=0):
    """
    Calculate the insertion point on a wall face for a door.
    Returns (XYZ point, direction vector) for wall-hosted placement.
    """
    try:
        location_curve = wall.Location
        if not location_curve or not hasattr(location_curve, 'Curve'):
            return None, None

        curve = location_curve.Curve
        # Project target point onto the wall curve
        result = curve.Project(target_point)
        if not result:
            return None, None

        # Get the point on the wall curve
        point_on_curve = result.XYZPoint

        # Add height offset (for doors, typically 0)
        insertion_point = XYZ(point_on_curve.X, point_on_curve.Y, point_on_curve.Z + offset_height)

        # Get wall direction (tangent to curve)
        param = result.Parameter
        direction = curve.ComputeDerivatives(param, True).BasisX.Normalize()

        return insertion_point, direction
    except:
        return None, None

# Validation
if not json_file_path:
    error_log.append("ERROR: No JSON file path provided. Connect a File Path node to IN[0].")
else:
    try:
        # AUTO-SELECT DOOR FAMILY
        # Get all door family symbols in the project
        door_symbols = FilteredElementCollector(doc)\
            .OfCategory(BuiltInCategory.OST_Doors)\
            .OfClass(FamilySymbol)\
            .ToElements()

        if len(door_symbols) == 0:
            error_log.append("WARNING: No door families found in project. Load door families first.")
            error_log.append("INFO: Doors will be skipped. Load a door family (e.g., 'Single-Flush') and re-run.")
            door_symbol = None
        else:
            # Use the first door family found
            door_symbol = door_symbols[0]

            # Ensure the symbol is activated (required for placement)
            if not door_symbol.IsActive:
                door_symbol.Activate()

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
            doors = [e for e in elements if e.get('type') == 'door']

            if len(doors) == 0:
                error_log.append("INFO: No doors found in JSON file.")
            elif door_symbol is None:
                error_log.append("WARNING: {} doors found but no door family available. Skipping.".format(len(doors)))
            else:
                # Start transaction
                TransactionManager.Instance.EnsureInTransaction(doc)

                # Conversion factor
                MM_TO_FEET = 1.0 / 304.8

                # Get existing walls from project for hosting
                existing_walls = FilteredElementCollector(doc)\
                    .OfClass(Wall)\
                    .ToElements()

                wall_list = list(existing_walls)
                error_log.insert(0, "Found {} existing walls in project for door hosting".format(len(wall_list)))

                # Create doors
                for door in doors:
                    try:
                        geometry = door.get('geometry', {})
                        coords_mm = geometry.get('coordinates_mm', [])

                        if len(coords_mm) < 1:
                            failed_count += 1
                            continue

                        # Door is placed at center point
                        center_mm = coords_mm[0]

                        # Convert to feet
                        x_ft = center_mm['x'] * MM_TO_FEET
                        y_ft = center_mm['y'] * MM_TO_FEET

                        # Create target point
                        target_point = XYZ(x_ft, y_ft, 0)

                        # Get properties
                        properties = door.get('properties', {})
                        width_mm = properties.get('width_mm', 900)  # Default 900mm

                        # Find nearest wall for hosting
                        host_wall = find_nearest_wall(wall_list, target_point)

                        if host_wall:
                            # Wall-hosted placement
                            insertion_point, direction = get_wall_insertion_point(host_wall, target_point, 0)

                            if insertion_point and direction:
                                new_door = doc.Create.NewFamilyInstance(
                                    insertion_point,
                                    door_symbol,
                                    host_wall,
                                    level,
                                    StructuralType.NonStructural
                                )

                                # Try to set width parameter if available
                                try:
                                    width_param = new_door.LookupParameter("Width")
                                    if width_param and not width_param.IsReadOnly:
                                        width_param.Set(width_mm * MM_TO_FEET)
                                except:
                                    pass  # Width parameter may not be available

                                created_doors.append(new_door)
                                success_count += 1
                            else:
                                failed_count += 1
                                error_log.append("Failed door {}: Could not calculate wall insertion point".format(
                                    door.get('id', 'unknown')[:8]
                                ))
                        else:
                            failed_count += 1
                            error_log.append("Failed door {}: No nearby wall found".format(
                                door.get('id', 'unknown')[:8]
                            ))

                    except Exception as e:
                        failed_count += 1
                        door_id_short = door.get('id', 'unknown')[:8]
                        error_log.append("Failed door {}: {}".format(door_id_short, str(e)[:80]))

                # Commit transaction
                TransactionManager.Instance.TransactionTaskDone()

                # Add success message
                if door_symbol:
                    error_log.insert(0, "Using door family: {} | Level: {}".format(door_symbol.FamilyName, level.Name))
                error_log.insert(0, "NOTE: Doors are wall-hosted (attached to nearest walls).")

    except FileNotFoundError:
        error_log.append("ERROR: JSON file not found at: {}".format(json_file_path))
    except json.JSONDecodeError as e:
        error_log.append("ERROR: Invalid JSON format: {}".format(str(e)))
    except Exception as e:
        error_log.append("ERROR: {}".format(str(e)))

# OUTPUT
OUT = [created_doors, success_count, failed_count, error_log]
