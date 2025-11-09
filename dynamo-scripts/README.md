# Dynamo Scripts for Revit Wall Generation

This directory contains Python scripts and instructions for creating 3D Revit walls from the AI-extracted JSON data.

## Quick Start

1. **Generate the JSON file:**

   ```bash
   npm run test:revit-pipeline
   ```

   This creates: `/home/azimsofi/kjm/ocr-test-playground/revit-outputs/zumen_04b-revit.json`

2. **Open Dynamo in Revit**

3. **Create the node flow:**

   ```
   [String: file path]
     → [Python: 01_load_json.py]
     → [Python: 02_filter_walls.py]
     → [Python: 03_create_walls.py] ← [Wall Types] + [Levels]
   ```

4. **Copy-paste Python scripts** from `python-nodes/` into Dynamo Python Script nodes

5. **Set the file path** in the String node to your JSON file location

6. **Run the script** - walls will be created in Revit

**Note:** The new workflow is simplified! You NO LONGER need Code Blocks between the Python scripts. Each script outputs the exact data format the next script expects.

## Files

- **`ASSEMBLY_GUIDE.md`** - Step-by-step instructions for building the Dynamo graph
- **`python-nodes/`** - Python scripts for each Dynamo node
  - `01_load_json.py` - Read and parse the Revit JSON file (outputs elements array)
  - `02_filter_walls.py` - Extract walls and convert mm→feet (outputs wall_data directly)
  - `02_filter_walls_robust.py` - Alternative version with backward compatibility
  - `03_create_walls.py` - Create Revit wall elements (updated: uses 3000mm default height)
- **`TROUBLESHOOTING.md`** - Common issues and solutions (see Issue 11 for connection errors)

## Prerequisites

- Autodesk Revit (2020 or later)
- Dynamo (included with Revit or install separately)
- Generated Revit JSON file from the OCR pipeline

## What This Does

This Dynamo script:

1. Reads the enhanced JSON file with transformed mm coordinates
2. Filters for wall elements only
3. Converts millimeters to feet (Revit's internal unit)
4. Creates 3D wall elements at the correct positions
5. Applies thickness and height from the extracted properties

**No manual scaling factor calculations required** - all coordinates are pre-transformed!

## Expected Result

After running the script:

- Walls appear in the Revit 3D view
- Positions match the original 2D drawing (verify with overlay)
- Wall properties (thickness, height) are applied
- Success count displayed in Dynamo output

## Next Steps

After walls are working:

- Add door and window placement (more complex - requires host wall detection)
- Batch process multiple drawings
- Create custom Revit families for special elements
