# Dynamo Scripts Usage Guide

## Overview

These Python scripts work with Dynamo for Revit to import floor plan elements extracted by the AI pipeline into Revit BIM models. They transform JSON data into actual Revit geometry.

## Available Scripts

### Recommended: Master Script

**`create_all_elements.py`** - **USE THIS ONE!**
- Creates ALL element types in one go
- Processes elements in optimal order
- Most convenient for complete floor plan import
- Returns comprehensive statistics

### Individual Scripts

For finer control or debugging specific element types:

- **`create_walls_simple.py`** - Walls only
- **`create_doors.py`** - Doors only
- **`create_windows.py`** - Windows only
- **`create_rooms.py`** - Rooms only

## Prerequisites

### 1. Revit Project Setup

Before running scripts, ensure your Revit project has:

**At least one Level** (e.g., "Level 1")
- Default levels are created with new projects
- Check in Elevation view or Project Browser

**At least one Wall Type** (e.g., "Basic Wall")
- Default wall types are included in most templates
- Load from "Architecture" → "Wall" if missing

**Door Family** (for doors)
- Default door families may not be loaded
- Load from Revit Library: `Doors` → `Single-Flush.rfa` (or similar)
- File → Load Family → Browse to Revit Library

**Window Family** (for windows)
- Load from Revit Library: `Windows` → `Fixed.rfa` (or similar)
- File → Load Family → Browse to Revit Library

### 2. AI Pipeline JSON Output

Run the AI pipeline to generate the JSON file:

```bash
npm run test:ai-pipeline -- --drawing clean-sample01
```

Output location: `revit-outputs/clean-sample01-revit.json`

## Usage Instructions

### Method 1: Complete Workflow (Recommended)

**Step 1:** Open Dynamo
- In Revit: Manage → Dynamo

**Step 2:** Create Simple Workflow
- Add `File Path` node
- Select your JSON file (e.g., `revit-outputs/clean-sample01-revit.json`)

**Step 3:** Add Python Script node
- Add `Python Script` node
- Open `create_all_elements.py` in a text editor
- Copy the entire contents
- Paste into the Python Script node

**Step 4:** Connect nodes
```
[File Path] → [Python Script]
```

**Step 5:** Run
- Click "Run" in Dynamo

**Step 6:** Check output
- Python Script node outputs:
  - OUT[0]: List of created walls
  - OUT[1]: List of created doors
  - OUT[2]: List of created windows
  - OUT[3]: List of created rooms
  - OUT[4]: Statistics dictionary
  - OUT[5]: Error log (connect to `Watch` node to see)

### Method 2: Step-by-Step (Individual Scripts)

If you want more control, run scripts sequentially:

**1. Create Walls First:**
```
[File Path] → [Python Script: create_walls_simple.py] → [Watch]
```

**2. Create Doors:**
```
[File Path] → [Python Script: create_doors.py] → [Watch]
```

**3. Create Windows:**
```
[File Path] → [Python Script: create_windows.py] → [Watch]
```

**4. Create Rooms Last:**
```
[File Path] → [Python Script: create_rooms.py] → [Watch]
```

> **Note:** Run walls first, then doors/windows, then rooms. Rooms need walls to define boundaries!

## File Path Formats

### Windows File Paths

```
C:\Users\YourName\Desktop\clean-sample01-revit.json
```

### WSL File Paths (from Windows)

```
\\wsl$\Ubuntu\home\azimsofi\kjm\ocr-test-playground\revit-outputs\clean-sample01-revit.json
```

## Expected Output

### Success Messages

```
NOTE: Doors/windows created unhosted. Use 'Pick New Host' to attach to walls.

Level: Level 1
Wall type: Generic - 200mm
Door family: Single-Flush
Window family: Fixed

=== SUMMARY ===
Total elements created: 127
Total failed: 3

=== CREATING WALLS ===
Walls: 89 created, 0 failed

=== CREATING DOORS ===
Doors: 12 created, 1 failed (unhosted)

=== CREATING WINDOWS ===
Windows: 26 created, 2 failed (unhosted)

=== CREATING ROOMS ===
Rooms: 8 created, 1 failed
  Failed room elem_125: Not enclosed by walls
```

### Common Issues

**"No door families found"**
- Load a door family before running script
- File → Load Family → Browse to Revit Library → Doors

**"No window families found"**
- Load a window family before running script
- File → Load Family → Browse to Revit Library → Windows

**"Failed room: Not enclosed by walls"**
- Some rooms may not have complete wall boundaries
- Either adjust walls to enclose the room, or manually place room later

**"Doors/windows created unhosted"**
- This is expected! Doors and windows are placed at coordinates but not automatically attached to walls
- To fix: Select door/window → "Pick New Host" → Click on wall

## Post-Processing (Manual Cleanup)

### 1. Host Doors and Windows to Walls

**Option A: Individual**
- Select door/window
- Properties panel → "Pick New Host"
- Click on the wall it should be hosted in

**Option B: Batch** (if many doors/windows)
- Use "Host Finder" add-in (if available)
- Or manually host one by one

### 2. Adjust Room Boundaries

If rooms show as "Not Enclosed":
- Check if walls form a complete enclosure
- Add room separation lines if needed
- Use "Room" tool to manually place missing rooms

### 3. Check Wall Connections

- Walls may need to be joined at corners
- Use "Edit Joins" tool to fix corner connections
- Or "Wall Joins" → "Join Geometry"

### 4. Verify Dimensions

- Check that wall lengths match expected dimensions
- Use Measure tool to verify accuracy
- Compare with dimension text from floor plan

### 5. Apply Materials (Optional)

Scripts don't set materials. To add:
- Select elements by type
- Properties → Material
- Assign appropriate materials

## Workflow Diagram

```
Floor Plan Image (PNG/JPG)
         ↓
   AI Pipeline Processing
   (npm run test:ai-pipeline)
         ↓
   JSON Output Generated
   (revit-outputs/xxx-revit.json)
         ↓
   Copy JSON file path
         ↓
   Open Dynamo in Revit
         ↓
   Create [File Path] → [Python Script] workflow
         ↓
   Paste create_all_elements.py into Python node
         ↓
   Run Dynamo
         ↓
   Building elements created!
         ↓
   Manual cleanup (host doors/windows, adjust rooms)
         ↓
   Complete Revit Model!
```

## JSON Input Structure

The scripts expect JSON in this format (generated by AI pipeline):

```json
{
  "metadata": {
    "drawing_id": "clean-sample01",
    "scale": "1:100",
    "units": "mm"
  },
  "elements": [
    {
      "id": "elem_0",
      "type": "wall",
      "geometry": {
        "type": "line",
        "coordinates_mm": [
          { "x": 4400.97, "y": 7611.09 },
          { "x": 5177.61, "y": 7611.09 }
        ]
      },
      "properties": {
        "length_mm": 776.64,
        "thickness_mm": 200,
        "height_mm": 3000
      },
      "level": "Level 1"
    },
    {
      "id": "elem_1",
      "type": "door",
      "geometry": {
        "type": "point",
        "coordinates_mm": [
          { "x": 5000.0, "y": 8000.0 }
        ]
      },
      "properties": {
        "width_mm": 900,
        "swing_direction": "left"
      },
      "level": "Level 1"
    }
  ]
}
```

## Coordinate System

- **Units:** Millimeters (mm) in JSON → Feet in Revit (auto-converted)
- **Origin:** Top-left (0, 0) in image → Revit project origin
- **Z-axis:** Elements placed at level elevation (typically 0)
- **Conversion:** 1 foot = 304.8 mm

## Performance

- **Processing time:** ~2-10 seconds for typical residential floor plans
- **Element count:** Tested with up to 200+ elements
- **File size:** JSON files typically 50-500 KB

## Troubleshooting

### Script Errors

**"No module named 'clr'"**
- You're not running inside Dynamo
- This script ONLY works in Dynamo Python node, not standalone Python

**"Transaction not started"**
- Should not happen with these scripts
- Scripts handle transactions automatically

**"Cannot create element"**
- Check that families are loaded
- Verify JSON file is not corrupted
- Check error log output for specific element IDs

### Geometry Issues

**Walls not connecting**
- Use "Edit Joins" to fix corners
- Check that endpoints are close enough (< 1mm)

**Doors/windows floating in space**
- Expected behavior! They're unhosted
- Use "Pick New Host" to attach to walls

**Rooms empty or "Not Enclosed"**
- Walls must form a closed boundary
- Add room separation lines if needed
- Manually place room if automatic detection fails

## Tips & Best Practices

1. **Start with walls:** Always create walls first, then doors/windows, then rooms

2. **Check families:** Load all required families before running scripts

3. **Use master script:** `create_all_elements.py` is most convenient for complete import

4. **Review error log:** Connect OUT[5] to a `Watch` node to see detailed errors

5. **Save before running:** Always save your Revit project before running Dynamo scripts

6. **Test with small dataset:** Try with a simple floor plan first to verify workflow

7. **Iterate:** It's okay if not everything is perfect on first run. Manual cleanup is expected!

## Next Steps

After successfully importing elements:

1. Host doors and windows to walls
2. Adjust room boundaries
3. Fix wall connections
4. Add materials and finishes
5. Add furniture (not yet supported by AI pipeline)
6. Add annotations (dimensions, tags)
7. Create sheets and views

## Future Enhancements

Planned improvements:

- Automatic wall hosting for doors/windows
- Stair creation support
- Column placement
- Material assignment from AI detection
- Family parameter mapping
- Multi-floor support

## Support

If you encounter issues:

1. Check error log output (OUT[5] of Python node)
2. Verify JSON file structure
3. Ensure all families are loaded
4. Review this guide
5. Check AI_PIPELINE_GUIDE.md for AI pipeline issues

---

Run the AI pipeline, open Dynamo, paste the script, and create your Revit model.
