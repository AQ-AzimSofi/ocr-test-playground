"""
COMPLETE BUILDING CREATOR - Paste this into a Dynamo Python node

Creates ALL elements from AI pipeline JSON: Walls, Doors, Windows, and Rooms
Recommended for complete floor plan to Revit workflow!

Required: ONLY the JSON file path (IN[0])
Auto-selects: First available families and level

SINGLE-NODE WORKFLOW:
  [File Path] → [Python Script with this code] → Complete Building!

Example:
  IN[0] = "C:\\Users\\azimsofi\\Desktop\\clean-sample01-revit.json"
  or
  IN[0] = "\\\\wsl$\\Ubuntu\\home\\azimsofi\\kjm\\ocr-test-playground\\revit-outputs\\clean-sample01-revit.json"

Processing Order:
  1. Walls (structural support)
  2. Doors (require walls)
  3. Windows (require walls)
  4. Rooms (require walls to define boundaries)
"""

import clr
clr.AddReference('RevitAPI')
clr.AddReference('RevitServices')
from Autodesk.Revit.DB import *
from Autodesk.Revit.DB.Architecture import Room
from RevitServices.Persistence import DocumentManager
from RevitServices.Transactions import TransactionManager

import json

# Get current Revit document
doc = DocumentManager.Instance.CurrentDBDocument

# INPUT
json_file_path = IN[0] if IN[0] else ""

# OUTPUT variables
created_walls = []
created_doors = []
created_windows = []
created_rooms = []
error_log = []
stats = {
    'walls': {'success': 0, 'failed': 0},
    'doors': {'success': 0, 'failed': 0},
    'windows': {'success': 0, 'failed': 0},
    'rooms': {'success': 0, 'failed': 0}
}

# Conversion factor
MM_TO_FEET = 1.0 / 304.8

# Validation
if not json_file_path:
    error_log.append("ERROR: No JSON file path provided. Connect a File Path node to IN[0].")
else:
    try:
        # ============================================================
        # STEP 1: AUTO-SELECT FAMILIES AND LEVEL
        # ============================================================

        # Wall Type
        wall_types = FilteredElementCollector(doc).OfClass(WallType).ToElements()
        wall_type = None
        if len(wall_types) > 0:
            for wt in wall_types:
                if wt.Kind == WallKind.Basic:
                    wall_type = wt
                    break
            if not wall_type:
                wall_type = wall_types[0]
        else:
            error_log.append("WARNING: No wall types found.")

        # Door Family
        door_symbols = FilteredElementCollector(doc)\
            .OfCategory(BuiltInCategory.OST_Doors)\
            .OfClass(FamilySymbol)\
            .ToElements()
        door_symbol = None
        if len(door_symbols) > 0:
            door_symbol = door_symbols[0]
            # Activation will happen inside transaction
        else:
            error_log.append("WARNING: No door families found. Load a door family for doors.")

        # Window Family
        window_symbols = FilteredElementCollector(doc)\
            .OfCategory(BuiltInCategory.OST_Windows)\
            .OfClass(FamilySymbol)\
            .ToElements()
        window_symbol = None
        if len(window_symbols) > 0:
            window_symbol = window_symbols[0]
            # Activation will happen inside transaction
        else:
            error_log.append("WARNING: No window families found. Load a window family for windows.")

        # Level
        levels = FilteredElementCollector(doc).OfClass(Level).ToElements()
        level = None
        if len(levels) > 0:
            for lv in levels:
                if "Level 1" in lv.Name or "レベル 1" in lv.Name:
                    level = lv
                    break
            if not level:
                level = levels[0]
        else:
            error_log.append("ERROR: No levels found in project.")

        if not level:
            raise Exception("Cannot proceed without a level.")

        # ============================================================
        # STEP 2: LOAD JSON DATA
        # ============================================================

        with open(json_file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        elements = data.get('elements', [])

        # Separate elements by type
        walls = [e for e in elements if e.get('type') == 'wall']
        doors = [e for e in elements if e.get('type') == 'door']
        windows = [e for e in elements if e.get('type') == 'window']
        rooms = [e for e in elements if e.get('type') == 'room']

        error_log.append("=== LOADING JSON ===")
        error_log.append("Found: {} walls, {} doors, {} windows, {} rooms".format(
            len(walls), len(doors), len(windows), len(rooms)
        ))
        error_log.append("")

        # ============================================================
        # STEP 3: CREATE ELEMENTS IN ORDER
        # ============================================================

        # START TRANSACTION
        TransactionManager.Instance.EnsureInTransaction(doc)

        # Activate family symbols (must be inside transaction)
        if door_symbol and not door_symbol.IsActive:
            door_symbol.Activate()
        if window_symbol and not window_symbol.IsActive:
            window_symbol.Activate()

        # -----------------------------------------------------------
        # CREATE WALLS
        # -----------------------------------------------------------
        error_log.append("=== CREATING WALLS ===")
        if wall_type and len(walls) > 0:
            for wall in walls:
                try:
                    geometry = wall.get('geometry', {})
                    coords_mm = geometry.get('coordinates_mm', [])

                    if len(coords_mm) < 2:
                        stats['walls']['failed'] += 1
                        continue

                    start_mm = coords_mm[0]
                    end_mm = coords_mm[1]

                    start_x_ft = start_mm['x'] * MM_TO_FEET
                    start_y_ft = start_mm['y'] * MM_TO_FEET
                    end_x_ft = end_mm['x'] * MM_TO_FEET
                    end_y_ft = end_mm['y'] * MM_TO_FEET

                    properties = wall.get('properties', {})
                    height_mm = properties.get('height_mm', 3000)
                    height_ft = height_mm * MM_TO_FEET

                    start_point = XYZ(start_x_ft, start_y_ft, 0)
                    end_point = XYZ(end_x_ft, end_y_ft, 0)
                    wall_curve = Line.CreateBound(start_point, end_point)

                    new_wall = Wall.Create(
                        doc, wall_curve, wall_type.Id, level.Id,
                        height_ft, 0, False, False
                    )

                    created_walls.append(new_wall)
                    stats['walls']['success'] += 1

                except Exception as e:
                    stats['walls']['failed'] += 1
                    wall_id = wall.get('id', 'unknown')[:8]
                    error_log.append("  Failed wall {}: {}".format(wall_id, str(e)[:50]))

            error_log.append("Walls: {} created, {} failed".format(
                stats['walls']['success'], stats['walls']['failed']
            ))
        else:
            error_log.append("Skipping walls (no wall type or no walls in JSON)")
        error_log.append("")

        # -----------------------------------------------------------
        # CREATE DOORS
        # -----------------------------------------------------------
        error_log.append("=== CREATING DOORS ===")
        if door_symbol and len(doors) > 0:
            for door in doors:
                try:
                    geometry = door.get('geometry', {})
                    coords_mm = geometry.get('coordinates_mm', [])

                    if len(coords_mm) < 1:
                        stats['doors']['failed'] += 1
                        continue

                    center_mm = coords_mm[0]
                    x_ft = center_mm['x'] * MM_TO_FEET
                    y_ft = center_mm['y'] * MM_TO_FEET
                    location_point = XYZ(x_ft, y_ft, 0)

                    properties = door.get('properties', {})
                    width_mm = properties.get('width_mm', 900)

                    new_door = doc.Create.NewFamilyInstance(
                        location_point,
                        door_symbol,
                        level,
                        StructuralType.NonStructural
                    )

                    # Try to set width
                    try:
                        width_param = new_door.LookupParameter("Width")
                        if width_param and not width_param.IsReadOnly:
                            width_param.Set(width_mm * MM_TO_FEET)
                    except:
                        pass

                    created_doors.append(new_door)
                    stats['doors']['success'] += 1

                except Exception as e:
                    stats['doors']['failed'] += 1
                    door_id = door.get('id', 'unknown')[:8]
                    error_log.append("  Failed door {}: {}".format(door_id, str(e)[:50]))

            error_log.append("Doors: {} created, {} failed (unhosted)".format(
                stats['doors']['success'], stats['doors']['failed']
            ))
        else:
            error_log.append("Skipping doors (no door family or no doors in JSON)")
        error_log.append("")

        # -----------------------------------------------------------
        # CREATE WINDOWS
        # -----------------------------------------------------------
        error_log.append("=== CREATING WINDOWS ===")
        if window_symbol and len(windows) > 0:
            for window in windows:
                try:
                    geometry = window.get('geometry', {})
                    coords_mm = geometry.get('coordinates_mm', [])

                    if len(coords_mm) < 1:
                        stats['windows']['failed'] += 1
                        continue

                    center_mm = coords_mm[0]
                    x_ft = center_mm['x'] * MM_TO_FEET
                    y_ft = center_mm['y'] * MM_TO_FEET

                    properties = window.get('properties', {})
                    sill_height_mm = properties.get('sill_height_mm', 900)
                    width_mm = properties.get('width_mm', 1200)
                    height_mm = properties.get('height_mm', 1200)

                    sill_height_ft = sill_height_mm * MM_TO_FEET
                    location_point = XYZ(x_ft, y_ft, sill_height_ft)

                    new_window = doc.Create.NewFamilyInstance(
                        location_point,
                        window_symbol,
                        level,
                        StructuralType.NonStructural
                    )

                    # Try to set dimensions
                    try:
                        width_param = new_window.LookupParameter("Width")
                        if width_param and not width_param.IsReadOnly:
                            width_param.Set(width_mm * MM_TO_FEET)
                    except:
                        pass

                    try:
                        height_param = new_window.LookupParameter("Height")
                        if height_param and not height_param.IsReadOnly:
                            height_param.Set(height_mm * MM_TO_FEET)
                    except:
                        pass

                    created_windows.append(new_window)
                    stats['windows']['success'] += 1

                except Exception as e:
                    stats['windows']['failed'] += 1
                    window_id = window.get('id', 'unknown')[:8]
                    error_log.append("  Failed window {}: {}".format(window_id, str(e)[:50]))

            error_log.append("Windows: {} created, {} failed (unhosted)".format(
                stats['windows']['success'], stats['windows']['failed']
            ))
        else:
            error_log.append("Skipping windows (no window family or no windows in JSON)")
        error_log.append("")

        # -----------------------------------------------------------
        # CREATE ROOMS
        # -----------------------------------------------------------
        error_log.append("=== CREATING ROOMS ===")
        if len(rooms) > 0:
            for room in rooms:
                try:
                    geometry = room.get('geometry', {})
                    coords_mm = geometry.get('coordinates_mm', [])

                    if len(coords_mm) == 0:
                        stats['rooms']['failed'] += 1
                        continue

                    # Calculate center
                    if len(coords_mm) == 1:
                        center_mm = coords_mm[0]
                    else:
                        sum_x = sum(p['x'] for p in coords_mm)
                        sum_y = sum(p['y'] for p in coords_mm)
                        center_mm = {
                            'x': sum_x / len(coords_mm),
                            'y': sum_y / len(coords_mm)
                        }

                    x_ft = center_mm['x'] * MM_TO_FEET
                    y_ft = center_mm['y'] * MM_TO_FEET
                    location_uv = UV(x_ft, y_ft)

                    properties = room.get('properties', {})
                    room_label = properties.get('room_label', '')

                    new_room = doc.Create.NewRoom(level, location_uv)

                    if room_label:
                        try:
                            new_room.Name = room_label
                        except:
                            new_room.Name = "{}_{}".format(room_label, room.get('id', 'room')[:8])

                    created_rooms.append(new_room)
                    stats['rooms']['success'] += 1

                except Exception as e:
                    stats['rooms']['failed'] += 1
                    room_id = room.get('id', 'unknown')[:8]
                    error_msg = str(e)
                    if "not in a properly enclosed region" in error_msg:
                        error_log.append("  Failed room {}: Not enclosed by walls".format(room_id))
                    else:
                        error_log.append("  Failed room {}: {}".format(room_id, error_msg[:50]))

            error_log.append("Rooms: {} created, {} failed".format(
                stats['rooms']['success'], stats['rooms']['failed']
            ))
        else:
            error_log.append("Skipping rooms (no rooms in JSON)")
        error_log.append("")

        # COMMIT TRANSACTION
        TransactionManager.Instance.TransactionTaskDone()

        # ============================================================
        # STEP 4: SUMMARY
        # ============================================================

        total_success = sum(s['success'] for s in stats.values())
        total_failed = sum(s['failed'] for s in stats.values())

        error_log.insert(0, "")
        error_log.insert(0, "=== SUMMARY ===")
        error_log.insert(0, "Total elements created: {}".format(total_success))
        error_log.insert(0, "Total failed: {}".format(total_failed))
        if wall_type:
            error_log.insert(0, "Wall type: {}".format(wall_type.Name))
        if door_symbol:
            error_log.insert(0, "Door family: {}".format(door_symbol.FamilyName))
        if window_symbol:
            error_log.insert(0, "Window family: {}".format(window_symbol.FamilyName))
        error_log.insert(0, "Level: {}".format(level.Name))
        error_log.insert(0, "")
        error_log.insert(0, "NOTE: Doors/windows created unhosted. Use 'Pick New Host' to attach to walls.")
        error_log.insert(0, "")

    except FileNotFoundError:
        error_log.append("ERROR: JSON file not found at: {}".format(json_file_path))
    except json.JSONDecodeError as e:
        error_log.append("ERROR: Invalid JSON format: {}".format(str(e)))
    except Exception as e:
        error_log.append("ERROR: {}".format(str(e)))
        import traceback
        error_log.append(traceback.format_exc()[:500])

# OUTPUT
# Returns: [walls, doors, windows, rooms, stats, error_log]
OUT = [created_walls, created_doors, created_windows, created_rooms, stats, error_log]
