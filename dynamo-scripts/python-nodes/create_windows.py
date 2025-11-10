"""
WINDOW CREATOR - Paste this into a Dynamo Python node

Required: ONLY the JSON file path (IN[0])
Auto-selects: First available window family and level

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
from RevitServices.Persistence import DocumentManager
from RevitServices.Transactions import TransactionManager

import json

# Get current Revit document
doc = DocumentManager.Instance.CurrentDBDocument

# INPUT
json_file_path = IN[0] if IN[0] else ""

# OUTPUT variables
created_windows = []
error_log = []
success_count = 0
failed_count = 0

# Validation
if not json_file_path:
    error_log.append("ERROR: No JSON file path provided. Connect a File Path node to IN[0].")
else:
    try:
        # AUTO-SELECT WINDOW FAMILY
        # Get all window family symbols in the project
        window_symbols = FilteredElementCollector(doc)\
            .OfCategory(BuiltInCategory.OST_Windows)\
            .OfClass(FamilySymbol)\
            .ToElements()

        if len(window_symbols) == 0:
            error_log.append("WARNING: No window families found in project. Load window families first.")
            error_log.append("INFO: Windows will be skipped. Load a window family (e.g., 'Fixed') and re-run.")
            window_symbol = None
        else:
            # Use the first window family found
            window_symbol = window_symbols[0]

            # Ensure the symbol is activated (required for placement)
            if not window_symbol.IsActive:
                window_symbol.Activate()

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
            windows = [e for e in elements if e.get('type') == 'window']

            if len(windows) == 0:
                error_log.append("INFO: No windows found in JSON file.")
            elif window_symbol is None:
                error_log.append("WARNING: {} windows found but no window family available. Skipping.".format(len(windows)))
            else:
                # Start transaction
                TransactionManager.Instance.EnsureInTransaction(doc)

                # Conversion factor
                MM_TO_FEET = 1.0 / 304.8

                # Create windows
                for window in windows:
                    try:
                        geometry = window.get('geometry', {})
                        coords_mm = geometry.get('coordinates_mm', [])

                        if len(coords_mm) < 1:
                            failed_count += 1
                            continue

                        # Window is placed at center point
                        center_mm = coords_mm[0]

                        # Convert to feet
                        x_ft = center_mm['x'] * MM_TO_FEET
                        y_ft = center_mm['y'] * MM_TO_FEET

                        # Get properties
                        properties = window.get('properties', {})
                        sill_height_mm = properties.get('sill_height_mm', 900)  # Default 900mm from floor
                        width_mm = properties.get('width_mm', 1200)  # Default 1200mm
                        height_mm = properties.get('height_mm', 1200)  # Default 1200mm

                        # Create location point (at sill height)
                        sill_height_ft = sill_height_mm * MM_TO_FEET
                        location_point = XYZ(x_ft, y_ft, sill_height_ft)

                        # Create window instance
                        # Note: This creates an unhosted window (not attached to wall)
                        # User may need to manually associate with wall
                        new_window = doc.Create.NewFamilyInstance(
                            location_point,
                            window_symbol,
                            level,
                            StructuralType.NonStructural
                        )

                        # Try to set width and height parameters if available
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

                        try:
                            sill_param = new_window.LookupParameter("Sill Height")
                            if sill_param and not sill_param.IsReadOnly:
                                sill_param.Set(sill_height_ft)
                        except:
                            pass

                        created_windows.append(new_window)
                        success_count += 1

                    except Exception as e:
                        failed_count += 1
                        window_id_short = window.get('id', 'unknown')[:8]
                        error_log.append("Failed window {}: {}".format(window_id_short, str(e)[:50]))

                # Commit transaction
                TransactionManager.Instance.TransactionTaskDone()

                # Add success message
                if window_symbol:
                    error_log.insert(0, "Using window family: {} | Level: {}".format(window_symbol.FamilyName, level.Name))
                error_log.insert(0, "NOTE: Windows created unhosted. Use 'Pick New Host' to attach to walls if needed.")

    except FileNotFoundError:
        error_log.append("ERROR: JSON file not found at: {}".format(json_file_path))
    except json.JSONDecodeError as e:
        error_log.append("ERROR: Invalid JSON format: {}".format(str(e)))
    except Exception as e:
        error_log.append("ERROR: {}".format(str(e)))

# OUTPUT
OUT = [created_windows, success_count, failed_count, error_log]
