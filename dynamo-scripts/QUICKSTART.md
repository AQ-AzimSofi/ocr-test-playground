# Quick Start Guide: Simple Wall Creator

Get walls from JSON into Revit in **under 5 minutes**.

---

## Prerequisites

- **Revit** is open with a project loaded
- **Dynamo** is installed (included with Revit or download from dynamobim.org)
- **JSON file** generated from the OCR pipeline (e.g., `zumen_04b-revit.json`)

---

## Option 1: Use the Pre-Built Dynamo File (FASTEST)

### Step 1: Open the Dynamo Script

1. In Revit, go to **Manage** → **Dynamo**
2. Click **Open**
3. Navigate to: `dynamo-scripts/simple-wall-creator.dyn`
4. The graph will load with 7 nodes already connected

### Step 2: Configure Your Settings

You'll see 3 input nodes in the green "INPUTS" section:

1. **File Path** (top left)
   - Click the **"..."** button
   - Browse to: `revit-outputs/zumen_04b-revit.json`
   - Click **Open**

2. **Wall Types** (middle left)
   - Click the dropdown
   - Select a wall type (e.g., "Basic Wall - 200mm" or "一般 - 200mm")

3. **Levels** (bottom left)
   - Click the dropdown
   - Select "Level 1" (or your desired level)

### Step 3: Run the Script

1. At the bottom-left of Dynamo, find the execution mode
2. If it says **"自動" (Automatic)**, click it and change to **"手動" (Manual)**
3. Click the **"実行" (Run)** button

### Step 4: View Results

- **Watch - Summary** (top right): Shows "Created 38 walls. Failed: 0"
- **Watch - Errors** (bottom right): Shows any error messages (should be empty)
- **Revit viewport**: Walls should now appear in your 3D view!

---

## Option 2: Use the Python Script Standalone

If you prefer to build your own Dynamo graph or integrate the script into an existing workflow, use the combined Python script.

### What You'll Need

Create these 5 nodes in Dynamo:

1. **File Path** → Select JSON file
2. **Wall Types** → Select wall type
3. **Levels** → Select level
4. **Python Script** → Paste `04_create_walls_direct.py`
5. **Watch** → View results

### Connection Diagram

```
[File Path] ──┐
              │
[Wall Types] ─┼──→ [Python Script] ──→ [Watch]
              │
[Levels] ─────┘
```

### Python Script Setup

1. Add a **Python Script** node
2. Open the file: `dynamo-scripts/python-nodes/04_create_walls_direct.py`
3. Copy the entire contents
4. Paste into the Python Script node
5. Connect the nodes as shown above

### Run It

1. Set execution mode to **Manual**
2. Click **Run**
3. Check the Watch node for results

---

## Understanding the Output

The Python script returns a list with 4 elements:

```python
OUT = [
    created_walls,     # [0] List of Wall elements (Revit objects)
    success_count,     # [1] Number like: 38
    failed_count,      # [2] Number like: 0
    error_log          # [3] List of error messages (if any)
]
```

### Expected Results for zumen_04b.png

- **Total walls in JSON**: 38
- **Successfully created**: 38
- **Failed**: 0
- **Wall height**: 3000mm (9.84 feet) - default from properties
- **Coordinate system**: Automatically converted from mm to feet

---

## Troubleshooting

### Problem: "ERROR: No Wall Type selected"

**Cause**: Wall Types dropdown is empty or not connected

**Solution**:

1. Make sure you have wall types in your Revit project
2. Go to **Architecture** → **Wall** → **Edit Type** to create a basic wall type
3. Reopen Dynamo and refresh the Wall Types dropdown

---

### Problem: "ERROR: JSON file not found"

**Cause**: File path is incorrect or file doesn't exist

**Solution**:

1. Check the file path in the File Path node
2. Use the **"..."** button to browse and select the file
3. Make sure you're using the **absolute path**, not a relative path

Example correct paths:

- Linux/WSL: `/home/azimsofi/kjm/ocr-test-playground/revit-outputs/zumen_04b-revit.json`
- Windows: `C:\Users\username\kjm\ocr-test-playground\revit-outputs\zumen_04b-revit.json`

---

### Problem: "WARNING: No walls found in JSON file"

**Cause**: The JSON file has no wall elements

**Solution**:

1. Open the JSON file in a text editor
2. Search for `"type": "wall"`
3. If not found, your OCR pipeline didn't detect any walls
4. Check the `elements` array - it might be empty or contain only other types

---

### Problem: Walls appear but are in the wrong location

**Cause**: Coordinate system or scaling issue

**Solution**:

1. Check `metadata.coordinate_transformation.scaling_factor` in the JSON
2. Verify `scaling_confidence` is > 0.5
3. If confidence is low, the automatic scaling might be incorrect
4. Manually verify by measuring a wall in Revit vs. the dimension text

---

### Problem: Script runs but creates 0 walls (success_count = 0)

**Cause**: Wall geometry is invalid (less than 2 points)

**Solution**:

1. Check the error log in the Watch node
2. Look for messages like "Invalid geometry"
3. Open the JSON and verify `coordinates_mm` has 2 points for each wall

Example valid wall geometry:

```json
"geometry": {
  "coordinates_mm": [
    {"x": 4400.97, "y": 7611.09},
    {"x": 5177.61, "y": 7611.09}
  ]
}
```

---

### Problem: Python script shows errors about "RevitAPI" not found

**Cause**: Dynamo is running in standalone mode (not in Revit)

**Solution**:

1. Close Dynamo
2. Open Revit first
3. From inside Revit, go to **Manage** → **Dynamo**
4. The Revit API will now be available

---

## Next Steps

### Test with Your Own Drawings

1. Run the OCR pipeline on your own floor plan:

   ```bash
   npm run test:revit-pipeline
   ```

2. Find the generated JSON in `revit-outputs/`

3. Load it in Dynamo using the same workflow

### Extend the Script

Want to create doors, windows, or rooms too?

- Modify `04_create_walls_direct.py` to filter for `"type": "door"`
- Use the Revit API `FamilyInstance.Create()` instead of `Wall.Create()`
- Check the `subType` field to select different door families

Example:

```python
doors = [e for e in elements if e.get('type') == 'door']
for door in doors:
    subType = door.get('subType')  # "hinged-door", "sliding-door"
    # Create door using appropriate family
```

### Batch Process Multiple Drawings

- Create a list of JSON file paths
- Use a **Code Block** with a loop
- Process multiple drawings in one run

---

## Performance Notes

- **38 walls**: ~1-2 seconds
- **100+ walls**: ~5-10 seconds
- **Large projects** (500+ elements): Consider creating walls in batches

---

## File Locations Reference

```
ocr-test-playground/
├── revit-outputs/
│   ├── zumen_04b-revit.json       ← Your JSON data
│   └── zumen_04b-revit.csv        ← CSV version (for reference)
│
└── dynamo-scripts/
    ├── simple-wall-creator.dyn     ← Pre-built Dynamo file (USE THIS!)
    ├── QUICKSTART.md               ← This guide
    ├── ASSEMBLY_GUIDE.md           ← Detailed 9-node workflow (legacy)
    ├── TROUBLESHOOTING.md          ← Extended troubleshooting
    └── python-nodes/
        ├── 01_load_json.py          ← Legacy (3-node workflow)
        ├── 02_filter_walls.py       ← Legacy (3-node workflow)
        ├── 03_create_walls.py       ← Legacy (3-node workflow)
        └── 04_create_walls_direct.py ← NEW! All-in-one script
```

---

## Why This Approach Works

### The Problem We Solved

The original 9-node workflow had a **data structure mismatch**:

```
[Load JSON] → outputs list
       ↓
[Filter Walls] → expects elements array
       ↓
FAIL: Data doesn't match → Empty list → No walls created
```

### The Solution

Combine everything into **one Python node**:

```
[File Path + Wall Type + Level] → [Single Python Script] → PASS: Walls created!
```

### Benefits

1. **No data passing issues** - everything happens in one transaction
2. **Better error handling** - see exactly which wall failed and why
3. **Easier debugging** - all logic in one place
4. **Faster execution** - one transaction instead of three

---

## Need Help?

- **Detailed assembly guide**: See `ASSEMBLY_GUIDE.md`
- **Extended troubleshooting**: See `TROUBLESHOOTING.md`
- **JSON schema reference**: See `../docs/` folder
- **GitHub issues**: Report bugs at the repository

---

## Success Checklist

- [ ] Revit is open with a project loaded
- [ ] Dynamo is launched from inside Revit (not standalone)
- [ ] JSON file exists at the specified path
- [ ] Wall type is selected from the dropdown
- [ ] Level is selected from the dropdown
- [ ] Execution mode is set to "Manual" (手動)
- [ ] Watch nodes are connected to see output
- [ ] Click "Run" (実行) button

**If all checked, walls should appear in your Revit viewport!**

---

_Generated by OCR Test Playground - Automated 3D BIM Model Generation_
