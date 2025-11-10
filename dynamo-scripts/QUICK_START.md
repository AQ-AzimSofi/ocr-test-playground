# Dynamo Quick Start - Floor Plan to Revit

## 5-Minute Workflow

### 1. Run AI Pipeline (Terminal)
```bash
cd ocr-test-playground
npm run test:ai-pipeline -- --drawing clean-sample01
```
Output: `revit-outputs/clean-sample01-revit.json`

### 2. Prepare Revit Project
- Open or create a Revit project
- Load door family (File → Load Family → `Doors/Single-Flush.rfa`)
- Load window family (File → Load Family → `Windows/Fixed.rfa`)
- Save project

### 3. Open Dynamo
- Manage tab → Dynamo

### 4. Create Workflow
```
[File Path Node] → [Python Script Node]
```
- File Path: Point to `revit-outputs/clean-sample01-revit.json`
- Python Script: Copy-paste contents of `create_all_elements.py`

### 5. Run!
- Click "Run" button
- Wait 5-10 seconds
- Building is created

### 6. Quick Cleanup (5 minutes)
- Select doors → "Pick New Host" → Click walls
- Select windows → "Pick New Host" → Click walls
- Fix any "Not Enclosed" rooms

---

## Script Locations

```
dynamo-scripts/python-nodes/
├── create_all_elements.py     (USE THIS ONE!)
├── create_walls_simple.py     (walls only)
├── create_doors.py            (doors only)
├── create_windows.py          (windows only)
└── create_rooms.py            (rooms only)
```

## Expected Results

**Typical residential floor plan:**
- 50-100 walls
- 10-20 doors
- 20-30 windows
- 5-15 rooms
- Total time: ~30 seconds (AI pipeline + Dynamo)

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "No door families found" | Load door family first |
| "No window families found" | Load window family first |
| "Room not enclosed" | Walls don't form closed boundary - adjust manually |
| "Script error" | Check you're using Dynamo Python node, not standalone Python |

## Output Nodes

Connect to `Watch` nodes to see:
- **OUT[0]:** Created walls
- **OUT[1]:** Created doors
- **OUT[2]:** Created windows
- **OUT[3]:** Created rooms
- **OUT[4]:** Statistics (success/failed counts)
- **OUT[5]:** Error log (important!)

## Post-Processing Checklist

- [ ] Host doors to walls
- [ ] Host windows to walls
- [ ] Fix "Not Enclosed" rooms
- [ ] Join wall corners
- [ ] Verify dimensions
- [ ] Apply materials (optional)
- [ ] Add furniture (manual)
- [ ] Create views/sheets

---

**Full documentation:** See `DYNAMO_USAGE_GUIDE.md`

**AI Pipeline docs:** See `../docs/AI_PIPELINE_GUIDE.md`
