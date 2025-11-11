# Dynamo Script Assembly Guide

## Step-by-Step Instructions for Building the Wall Creation Script

### Prerequisites

1. **Revit** is open with a project loaded
2. **Dynamo** is installed (comes with Revit or install from dynamobim.org)
3. **Generated JSON file** from the OCR pipeline (e.g., `zumen_04b-revit.json`)

---

## Node Graph Overview

```
[File Path] → [Python: Parse JSON] → [Code Block: x[1]] → [Python: Filter Walls] → [Wall Types] → [Python: Create Walls] → [Output]
                                                                                      [Levels] →
```

Total nodes needed: **9**

- 1 File Path node
- 1 Code Block node (to extract elements array)
- 3 Python Script nodes
- 1 Wall Types selector
- 1 Levels selector
- 2 Watch nodes (for output display)

---

## Step 1: Create a New Dynamo Script

1. In Revit, go to **Manage** → **Dynamo**
2. Click **New** to create a new script
3. Save as `01-simple-walls.dyn` in your workspace

**Note:** This workflow uses 9 nodes total (including the Code Block for data extraction)

---

## Step 2: Add Input Node

### File Path Node

1. In Dynamo, go to **Core** → **File** → **File Path**
2. Drag it onto the canvas
3. Click the **"..."** button to select your JSON file
4. Navigate to: `revit-outputs/zumen_04b-revit.json`

**What this does:** Provides the path to the JSON file

---

## Step 3: Add Python Script Node 1 - Parse JSON

1. Go to **Core** → **Scripting** → **Python Script**
2. Drag it onto the canvas (to the right of File Path)
3. Double-click the node to open the Python editor
4. **Delete all default code**
5. **Copy-paste** the entire contents of `python-nodes/01_parse_json.py`
6. Click **OK**
7. Connect the **File Path** output to the **Python Script** input (drag from dot to dot)

**What this does:** Reads and parses the JSON file

---

## Step 4: Add Python Script Node 2 - Filter Walls

1. Add another **Python Script** node to the right
2. Open the editor and **copy-paste** contents of `python-nodes/02_filter_walls.py`
3. **CRITICAL:** You MUST extract index `[1]` from Python Script 1's output before connecting it

### Method A: Using Code Block (Recommended)

1. Add a **Code Block** node between Python Script 1 and Python Script 2
2. Double-click the Code Block and enter: `x[1];`
3. Connect:
   - Python Script 1 output → Code Block input
   - Code Block output → Python Script 2 input

### Method B: Using List.GetItemAtIndex

1. Search for "List.GetItemAtIndex" and add it between the two scripts
2. Set `index` to `1`
3. Connect:
   - Python Script 1 output → List.GetItemAtIndex `list` input
   - List.GetItemAtIndex output → Python Script 2 input

**Why this step is necessary:** Python Script 1 outputs a list `[metadata, elements, scaling_factor, confidence, count]`. We only want the `elements` array (index 1), not the entire list.

**Common Error:** If you connect directly without extracting the index, you'll get `TypeError: 'NoneType' object is not iterable` in Script 2.

**What this does:** Filters walls and converts coordinates mm → feet

---

## Step 5: Add Wall Type Selector

**IMPORTANT:** Add this node BEFORE Step 7 (Python Script 3) - it will be one of Script 3's required inputs.

1. Go to **Revit** → **Selection** → **All Elements of Type**
2. Drag to canvas
3. Click the dropdown in the node
4. Select **Wall Types** → choose any wall type (e.g., "Generic - 150mm" or "Basic Wall")

**Alternative:** Use **Categories** → **Wall Types** node if available

**What this does:** Lets you pick which Revit wall type to create

---

## Step 6: Add Level Selector

**IMPORTANT:** Add this node BEFORE Step 7 (Python Script 3) - it will be one of Script 3's required inputs.

1. Go to **Revit** → **Selection** → **Levels**
2. Drag to canvas
3. Click dropdown and select **Level 1** (or your desired level)

**What this does:** Specifies which floor level to place walls on

---

## Step 7: Add Python Script Node 3 - Create Walls

**IMPORTANT:** This node requires **3 inputs**. Make sure Wall Types and Levels nodes are already on your canvas before proceeding.

1. Add a third **Python Script** node
2. Copy-paste contents of `python-nodes/03_create_walls.py`
3. **Make ALL 3 connections** (input ports appear as you hover to connect):
   - **Python Script 2** output [0] (wall_data) → **Python Script 3** input [0] (left-most dot)
   - **Wall Types** node output → **Python Script 3** input [1] (middle dot)
   - **Levels** node output → **Python Script 3** input [2] (right-most dot)

**How Dynamo input ports work:**

- Python Script nodes start with 1 input port
- Additional ports appear automatically when you drag wires near the node
- You should see 3 input dots on the left side of Python Script 3 when all connections are made

**Common Error:** If you run the script before connecting all 3 inputs, you'll get `IndexError: list index out of range`. This means Wall Types or Levels isn't connected yet.

**What this does:** Creates actual walls in Revit using the API

---

## Step 8: Add Output Display Nodes

### Watch Node 1 - Success Count

1. Go to **Core** → **View** → **Watch**
2. Connect **Python Script 3** output [1] (success_count) to Watch input
3. Rename the Watch node to "Walls Created"

### Watch Node 2 - Errors (Optional)

1. Add another Watch node
2. Connect **Python Script 3** output [3] (errors) to this Watch
3. Rename to "Errors"

**What this does:** Displays how many walls were created and any error messages

---

## Step 9: Final Node Layout

Your graph should look like this:

```
┌──────────────┐
│  File Path   │──┐
└──────────────┘  │
                  ↓
            ┌─────────────────┐
            │ Python: Parse   │──┐
            │ (01_parse_json) │  │
            └─────────────────┘  │
                                 ↓
                          ┌────────────┐
                          │ Code Block │
                          │   x[1];    │
                          └────────────┘
                                 │
                                 ↓ elements array
                          ┌─────────────────┐
                          │ Python: Filter  │──┐
                          │ (02_filter)     │  │
                          └─────────────────┘  │
                                               ↓ [0] wall_data
                                        ┌─────────────────┐     ┌─────────┐
┌──────────────┐                    ┌──│ Python: Create  │────→│  Watch  │
│  Wall Types  │────────────────────┼─→│ (03_create)     │     │(Success)│
└──────────────┘              [1]   │  │  ** 3 INPUTS ** │     └─────────┘
                                    │  └─────────────────┘
┌──────────────┐                    │            │
│   Levels     │────────────────────┘            ↓
└──────────────┘              [2]          ┌─────────┐
                                           │  Watch  │
                                           │(Errors) │
                                           └─────────┘
```

**Key:** Python Script 3 requires exactly 3 inputs - make sure all are connected!

---

## Step 10: Run the Script!

1. Make sure all connections are made (lines between nodes)
2. Click **Run** (►) button in Dynamo toolbar
3. Watch the **"✓ Walls Created"** node - it should show a number (e.g., `20` if 20 walls were created)
4. Look at your Revit **3D View** - walls should appear!

---

## Expected Results

### Success Indicators:

- ✓ "Walls Created" Watch shows: `20` (or however many walls were in the JSON)
- ✓ "Errors" Watch shows: `[]` (empty list, no errors)
- ✓ Walls visible in Revit 3D view
- ✓ Walls are positioned correctly (compare with original 2D drawing)

### If Something Goes Wrong:

**"Errors" Watch shows messages:**

- Check the error text - it will tell you what failed
- Common issue: Wrong wall type or level selected
- Fix: Select different Wall Type or Level

**No walls appear:**

- Check if walls are in the 3D view (might need to adjust view settings)
- Try: **View** → **3D View** → **Zoom All** in Revit

**Python errors:**

- Make sure you copied the ENTIRE script (including imports at top)
- Check that all 3 Python scripts are using the correct code

---

## Verification Steps

1. **Count Check:** Does the number of created walls match the JSON?
   - Open JSON file
   - Count `"type": "wall"` entries
   - Should match "Walls Created" count

2. **Position Check:** Compare with annotated overlay (if generated)
   - Visual verification tool creates `[drawing-id]-annotated.png`
   - Overlay shows where walls should be

3. **Properties Check:**
   - Select a wall in Revit
   - Check **Properties** panel
   - Height should be ~2700mm (8.86 feet)
   - Thickness should match (150mm = 0.49 feet)

---

## Next Steps

### After Walls are Working:

1. **Add Doors & Windows** (Advanced):
   - Create new Python script
   - Use `FamilyInstance.ByPointAndHost` to place on walls
   - Find host wall using spatial queries

2. **Batch Processing**:
   - Modify File Path to accept list of files
   - Loop through multiple drawings

3. **Custom Properties**:
   - Set wall parameters from JSON metadata
   - Add comments, labels, or custom fields

---

## Tips & Tricks

### Debugging in Dynamo:

- Use **Watch** nodes liberally - connect them to any output to see the data
- Python scripts can use `print()` - output shows in Dynamo console

### Performance:

- Creating 50 walls should take <5 seconds
- If it's slow, check if Revit is updating views in real-time

### Revit Won't Let You Edit:

- If walls are in a **Worksharing** project, you may need to make elements editable first
- Or create a new blank Revit project for testing

---

## Troubleshooting Guide

See `TROUBLESHOOTING.md` for detailed solutions to common issues.

---

## Success Criteria

You've successfully completed the PoC when:

- PASS: Walls appear in correct positions (verify with original drawing)
- PASS: Wall count matches JSON data
- PASS: No errors in Dynamo output
- PASS: Walls have correct properties (height, thickness)

**Congratulations! You've proven that AI-extracted 2D drawing data can automatically generate 3D Revit geometry!**
