"""
ROOM CREATOR - Paste this into a Dynamo Python node

Required: ONLY the JSON file path (IN[0])
Creates rooms at detected locations with labels

2-Node Workflow:
  [File Path] → [Python Script with this code] → Done!

IMPORTANT: Run this AFTER creating walls, so Revit can auto-detect room boundaries!

Example:
  IN[0] = "C:\\Users\\azimsofi\\Desktop\\clean-sample01-revit.json"
  or
  IN[0] = "\\\\wsl$\\Ubuntu\\home\\azimsofi\\kjm\\ocr-test-playground\\revit-outputs\\clean-sample01-revit.json"
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
created_rooms = []
error_log = []
success_count = 0
failed_count = 0

# Validation
if not json_file_path:
    error_log.append("ERROR: No JSON file path provided. Connect a File Path node to IN[0].")
else:
    try:
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
            rooms = [e for e in elements if e.get('type') == 'room']

            if len(rooms) == 0:
                error_log.append("INFO: No rooms found in JSON file.")
            else:
                # Start transaction
                TransactionManager.Instance.EnsureInTransaction(doc)

                # Conversion factor
                MM_TO_FEET = 1.0 / 304.8

                # Create rooms
                for room in rooms:
                    try:
                        geometry = room.get('geometry', {})
                        coords_mm = geometry.get('coordinates_mm', [])

                        # Use approximate_center from room detection
                        # If boundary_polygon is available, calculate center
                        if len(coords_mm) == 0:
                            failed_count += 1
                            continue

                        # Calculate center point from polygon or use first coordinate
                        if len(coords_mm) == 1:
                            center_mm = coords_mm[0]
                        else:
                            # Calculate centroid of polygon
                            sum_x = sum(p['x'] for p in coords_mm)
                            sum_y = sum(p['y'] for p in coords_mm)
                            center_mm = {
                                'x': sum_x / len(coords_mm),
                                'y': sum_y / len(coords_mm)
                            }

                        # Convert to feet
                        x_ft = center_mm['x'] * MM_TO_FEET
                        y_ft = center_mm['y'] * MM_TO_FEET

                        # Create UV point (2D point for room placement)
                        location_uv = UV(x_ft, y_ft)

                        # Get room properties
                        properties = room.get('properties', {})
                        room_label = properties.get('room_label', '')
                        room_type = properties.get('room_type', '')

                        # Create room
                        # Revit will automatically detect boundaries if walls form an enclosed space
                        new_room = doc.Create.NewRoom(level, location_uv)

                        # Set room name if available
                        if room_label:
                            try:
                                new_room.Name = room_label
                            except:
                                # If name is invalid or duplicate, append element ID
                                new_room.Name = "{}_{}".format(room_label, room.get('id', 'room')[:8])

                        # Set room number (optional, auto-generated if not set)
                        # You can customize numbering logic here

                        created_rooms.append(new_room)
                        success_count += 1

                    except Exception as e:
                        failed_count += 1
                        room_id_short = room.get('id', 'unknown')[:8]
                        error_msg = str(e)

                        # Provide helpful error messages
                        if "not in a properly enclosed region" in error_msg:
                            error_log.append("Failed room {}: Not enclosed by walls. Create walls first or adjust room placement.".format(room_id_short))
                        else:
                            error_log.append("Failed room {}: {}".format(room_id_short, error_msg[:80]))

                # Commit transaction
                TransactionManager.Instance.TransactionTaskDone()

                # Add info messages
                error_log.insert(0, "Level: {}".format(level.Name))
                error_log.insert(0, "NOTE: Rooms require enclosed walls. If rooms show as 'Not Enclosed', adjust walls or room position.")

    except FileNotFoundError:
        error_log.append("ERROR: JSON file not found at: {}".format(json_file_path))
    except json.JSONDecodeError as e:
        error_log.append("ERROR: Invalid JSON format: {}".format(str(e)))
    except Exception as e:
        error_log.append("ERROR: {}".format(str(e)))

# OUTPUT
OUT = [created_rooms, success_count, failed_count, error_log]
