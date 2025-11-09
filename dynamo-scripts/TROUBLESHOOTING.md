# Dynamo Script Troubleshooting Guide

## Common Issues and Solutions

---

### Issue 1: "Module 'json' not found" Error

**Symptom:** Python script fails with import error

**Cause:** Dynamo's Python environment is missing the json module (rare, but can happen)

**Solution:**

```python
# Add this at the top of 01_parse_json.py if you get import errors
import sys
sys.path.append(r'C:\Program Files\IronPython 2.7\Lib')
import json
```

---

### Issue 2: No Walls Appear in Revit

**Possible Causes:**

#### A. Walls are outside the view range

**Solution:**

1. In Revit, go to **View** → **3D View** → **Default 3D View**
2. Click **Zoom All** or press **ZA** + **Enter**
3. Walls might be far from origin - zoom out to find them

#### B. Wrong Level selected

**Solution:**

1. Check that **Level 1** exists in your Revit project
2. Try selecting a different level in the Levels node
3. Or create a new level at elevation 0

#### C. Coordinate system mismatch

**Solution:**

1. Check if Y-axis flip is needed (see docs/COORDINATE_SYSTEMS.md)
2. Walls might be upside down or mirrored
3. Try regenerating JSON with `flipYAxis: true` option

---

### Issue 3: "Unable to create wall" Errors

**Error message example:** `"Wall.Create failed: ..."`

**Possible Causes:**

#### A. Start and end points are the same

**Solution:**

- Check JSON file - look for walls with identical start/end coordinates
- Filter out these walls in Python script 2:

```python
# Add this check in 02_filter_walls.py
if start_mm == end_mm:
    continue  # Skip walls with no length
```

#### B. Wall height is zero or negative

**Solution:**

- Verify `height` property in JSON
- Add fallback default:

```python
height_mm = properties.get('height', 2700) or 2700  # Force default if 0
```

#### C. Wall type doesn't support the thickness

**Solution:**

- Try a different **Basic Wall** type
- Or use "Generic" wall type which is more flexible

---

### Issue 4: Scaling Factor Confidence is Low (<70%)

**Symptom:** JSON metadata shows `"scaling_confidence": 0.6` or lower

**Impact:** Walls may be in wrong positions or wrong size

**Solutions:**

1. **Check the anchor objects** in console output
   - Look for obviously wrong scaling factors (like 1007.64 mm/px)
   - These are likely OCR errors

2. **Enable outlier filtering:**
   - Update `revit-output-generator.ts` to filter bad anchors
   - Re-run the pipeline

3. **Manual override:** If you know the scale:
   - Measure a known dimension in the drawing (e.g., 10,920mm wall)
   - Measure its pixel length (e.g., 728 pixels)
   - Calculate: `scaling_factor = 10920 / 728 = 15.0`
   - Hardcode in coordinate transformer:
   ```typescript
   scalingFactor: 15.0; // Override instead of auto-calculate
   ```

---

### Issue 5: "Index out of range" Error in Python

**Symptom:** Python script crashes with index error

**Cause:** Output from previous node isn't structured as expected

**Solution:**

1. **Add debug Watch nodes:**
   - Connect Watch node to Python Script 1 output
   - Verify it's outputting a list with 5 elements: `[metadata, elements, ...`]

2. **Check array indices:**
   - Python Script 2 should connect to **output [1]** of Python Script 1
   - Not output [0] (that's the metadata object)

3. **Verify JSON format:**
   - Open the JSON file
   - Ensure it has `"elements": [...]` array
   - Ensure elements have `"type": "wall"` property

---

### Issue 6: Walls Created but at Wrong Scale

**Symptom:** Walls are tiny or gigantic compared to expected size

**Diagnosis:**

1. Check the JSON `scaling_factor`:
   - Should be in range 10-30 for typical architectural drawings
   - If it's 1007 or 2.0, that's wrong

2. Verify a known wall:
   - Find a wall with `"dimension_text": "10,920"` (10.92 meters)
   - Check its `"length_mm"` property
   - Should be close to 10,920

**Solutions:**

1. **If JSON scaling is wrong:**
   - Regenerate with outlier filtering enabled
   - Or manually override scaling factor

2. **If Dynamo conversion is wrong:**
   - Check `MM_TO_FEET` constant in script 2
   - Should be `1.0 / 304.8`
   - Verify coordinates are being multiplied correctly

---

### Issue 7: "Transaction" Errors in Revit

**Error:** `"Failed to commit transaction"`

**Cause:** Revit document is locked or read-only

**Solutions:**

1. **Close any open dialogs** in Revit (they lock the document)

2. **Check Worksharing:**
   - If project is workshared, you may need to sync first
   - Or borrow elements before editing

3. **Try a blank project:**
   - Test the script in a new, empty Revit project first
   - If that works, the issue is project-specific

---

### Issue 8: Dynamo Freezes or Hangs

**Symptom:** Dynamo stops responding during execution

**Causes:**

1. **Large dataset:** Creating 100+ walls at once
2. **View updates:** Revit is updating all views in real-time

**Solutions:**

1. **Close unnecessary views** in Revit before running Dynamo

2. **Disable automatic view updates:**
   - In Dynamo settings, turn off "Auto-run"
   - Run manually with **Run** button

3. **Process in batches:**
   - Modify script to process 20 walls at a time
   - Use list slicing in Python

---

### Issue 9: Python Script Shows No Output

**Symptom:** Watch nodes show `null` or empty

**Diagnosis:**

1. **Check for Python syntax errors:**
   - Open Python editor
   - Look for red error messages at bottom
   - Fix any indentation or syntax issues

2. **Verify inputs are connected:**
   - Make sure File Path connects to Python Script 1 input
   - Make sure all required inputs are connected

3. **Add debug prints:**

```python
# Add at end of Python script
print("Walls found:", len(wall_data))
OUT = wall_data
```

Then check Dynamo console for output

---

### Issue 10: JSON File Path Not Found

**Error:** `"ERROR: No such file or directory"`

**Solutions:**

1. **Use absolute path:**
   - Instead of `revit-outputs/file.json`
   - Use `C:\full\path\to\revit-outputs\file.json`

2. **Check file exists:**
   - Navigate to the file in File Explorer
   - Right-click → **Properties** → copy full path

3. **Escape backslashes:**
   - In Python, use: `C:\\path\\to\\file.json` (double backslashes)
   - Or: `r'C:\path\to\file.json'` (raw string)

---

### Issue 11: "'NoneType' object is not iterable" Error in Python Script 2

**Error:** `TypeError: 'NoneType' object is not iterable` on line 14 (`for wall in walls:`)

**Symptom:** Python Script 2 fails immediately when run

**Cause:** Direct connection from Python Script 1 to Python Script 2 passes the **entire output list**, not just the elements array at index [1]

**Solution:**

You MUST extract index `[1]` from Python Script 1's output before connecting to Python Script 2.

**Method 1: Use Code Block (Easiest)**

```
1. Add a Code Block node between the two Python scripts
2. Enter this code in the Code Block: x[1];
3. Connect:
   - Python Script 1 output → Code Block input
   - Code Block output → Python Script 2 input
```

**Method 2: Use List.GetItemAtIndex**

```
1. Add "List.GetItemAtIndex" node between the scripts
2. Set index parameter to 1
3. Connect Python Script 1 → List.GetItemAtIndex → Python Script 2
```

**Method 3: Use Robust Version of Script 2**

```
Use python-nodes/02_filter_walls_robust.py instead of 02_filter_walls.py
This version automatically detects the connection method and handles both cases
```

**Method 4: Modify Python Script 2**

```python
# Change line 2 from:
elements = IN[0]

# To:
elements = IN[0][1]  # Extract the elements array from the list
```

**Verification:**

- Add a Watch node to the Code Block output (if using Method 1 or 2)
- Should show a list of element dictionaries, not a file path
- After fix, Python Script 2 should output the wall count (e.g., 20)

---

### Issue 12: "IndexError: list index out of range" in Python Script 3

**Error:** `IndexError: list index out of range` on line 18 or 19

**Symptom:** Python Script 3 only shows 1 input port instead of 3

**Cause:** Wall Types and/or Levels nodes are not connected to Python Script 3

**Explanation:**
Python Script 3's code expects THREE inputs:

```python
wall_data = IN[0]   # From Python Script 2
wall_type = IN[1]   # From Wall Types selector ← MISSING
level = IN[2]       # From Levels selector     ← MISSING
```

When `IN[1]` or `IN[2]` don't exist, Python throws `IndexError`.

**Solution:**

1. **Add Wall Types Selector Node**
   - Navigate to: **Revit** → **Selection** → **All Elements of Type**
   - Select **Wall Types** category
   - Choose any wall type (e.g., "Generic - 150mm")

2. **Add Levels Selector Node**
   - Navigate to: **Revit** → **Selection** → **Levels**
   - Select **Level 1** (or your desired level)

3. **Connect ALL THREE Inputs to Python Script 3**
   - Input [0]: Python Script 2 output [0] (wall_data)
   - Input [1]: Wall Types node output
   - Input [2]: Levels node output

**How to Connect:**

- Hover your mouse near Python Script 3's left edge while dragging a wire
- Additional input ports (dots) will appear automatically
- After all 3 connections, you should see 3 dots on the left side

**Verification:**

- Count the input dots on Python Script 3 - should be exactly **3**
- All 3 should have wires connected to them
- Now run the script - IndexError should be gone

---

### Issue 13: JSON Parsing Errors - Flattened or Corrupted Structure

**Error:** `AttributeError: 'list' object has no attribute 'get'` or nested dictionaries appear flattened in Watch nodes

**Symptom:** Parse json output shows objects without proper nesting:

```
drawing_id: zumen_04b,
{                      ← Lost the parent key!
  scaling_factor: ...
}
```

**Possible Causes:**

#### A. Using Python's open() instead of .NET File API

**Solution:**
The updated `01_parse_json.py` script uses .NET's `File.ReadAllText()` which is more reliable in Dynamo/IronPython environment.

Copy the latest version of the script from `python-nodes/01_parse_json.py`

#### B. Copied JSON file has corrupted syntax

**Solution:**
If you copied the JSON to Windows, verify it has proper JSON syntax:

```bash
# In WSL, copy correctly:
cp /path/to/file.json "/mnt/c/Users/.../file.json"
```

Or use the WSL path directly in Dynamo:

```
\\wsl$\Ubuntu\home\azimsofi\kjm\ocr-test-playground\revit-outputs\zumen_04b-revit.json
```

#### C. File encoding issues

**Solution:**
The updated script explicitly uses UTF-8 encoding via `Encoding.UTF8` parameter

**Verification:**
Add a Watch node to parse json output - you should see:

```
[0]: { drawing_id: ..., coordinate_transformation: { ... }, ... }  ← Proper nested dict
[1]: [ { type: "wall", ... }, ... ]  ← Elements array
[2]: 51.776... ← Scaling factor
```

---

## Getting Help

If none of these solutions work:

1. **Check Dynamo console:**
   - View → Dynamo Console
   - Look for detailed error messages

2. **Simplify the script:**
   - Start with just Python Script 1 (parse JSON)
   - Add one node at a time until you find the problem

3. **Verify JSON file:**
   - Open in a JSON validator (jsonlint.com)
   - Make sure it's valid JSON

4. **Test in Python outside Dynamo:**
   - Run the parse JSON script in a Python REPL first
   - Verify the logic works before using in Dynamo

---

## Performance Benchmarks

**Expected performance:**

- JSON parsing: <1 second
- Filter 50 walls: <1 second
- Create 50 walls in Revit: 3-10 seconds (depends on view complexity)

If your script is significantly slower, check for:

- Multiple 3D views open (close them)
- Revit rendering shadows/materials (turn off temporarily)
- Dynamo auto-run enabled (turn off, use manual Run button)

---

## Success Indicators

PASS: Your script is working correctly if:

- Wall count matches JSON
- No errors in error Watch node
- Walls visible in 3D view within expected location
- Wall properties (height, thickness) are reasonable values

FAIL: Something is wrong if:

- Error count > 0
- Walls don't appear at all
- Scaling is obviously wrong (walls are 1mm or 1km long)
- Dynamo crashes or freezes

---

## Advanced Debugging

### Enable verbose logging:

```python
# Add to any Python script
import traceback

try:
    # ... your code ...
    pass
except Exception as e:
    error_details = traceback.format_exc()
    print(error_details)  # Shows full stack trace in Dynamo console
    OUT = [f"ERROR: {str(e)}", error_details]
```

### Validate JSON structure programmatically:

```python
# Add to 01_parse_json.py after loading JSON
required_keys = ['metadata', 'elements']
for key in required_keys:
    if key not in data:
        raise ValueError(f"JSON missing required key: {key}")

print(f"JSON valid: {len(data['elements'])} elements found")
```

---

**Still having issues?** Check the main project documentation at `docs/REVIT_INTEGRATION.md` for more detailed explanations of the coordinate system and transformation logic.
