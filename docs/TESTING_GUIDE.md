# Testing Guide - AI Pipeline & Dynamo Integration

## Complete Workflow Test

### Step 1: Run AI Pipeline

```bash
cd ocr-test-playground
npm run test:ai-pipeline -- --drawing clean-sample01
```

**Expected output location:**
- `revit-outputs/clean-sample01-revit.json`
- `revit-outputs/clean-sample01-revit.csv`

**Processing time:** 30-60 seconds (5-8 AI API calls)

**Watch for:**
- Global Analyzer: Should detect 4-5 dimension zones
- Geometric Specialist: Should detect walls, doors, windows
- Dimension Specialist: Should extract dimension text
- Association: Should link dimensions to elements
- Validation: Should provide quality score

### Step 2: Verify JSON Output

```bash
cat revit-outputs/clean-sample01-revit.json | head -50
```

**Check for:**
- `metadata` section with drawing info
- `elements` array with walls, doors, windows, rooms
- `coordinates_mm` for each element (transformed from pixels)
- `properties` with dimensions (length, width, height)
- `statistics` summary

### Step 3: Test in Revit/Dynamo

1. **Open Revit** (any version with Dynamo)
2. **Manage → Dynamo**
3. **Create workflow:**
   ```
   [File Path Node] → [Python Script Node]
   ```
4. **Set File Path:**
   - Windows: `C:\path\to\revit-outputs\clean-sample01-revit.json`
   - WSL: `\\wsl$\Ubuntu\home\azimsofi\kjm\ocr-test-playground\revit-outputs\clean-sample01-revit.json`
5. **Python Script Node:**
   - Copy entire contents of `dynamo-scripts/python-nodes/create_all_elements.py`
   - Paste into Python Script node
6. **Run Dynamo**
7. **Check Revit:**
   - Walls should appear at correct positions
   - Doors and windows placed (unhosted)
   - Rooms created with labels

### Step 4: Post-Processing in Revit

**Manual cleanup (5-10 minutes):**

1. **Host doors to walls:**
   - Select door → "Pick New Host" → Click wall
   - Repeat for all doors

2. **Host windows to walls:**
   - Select window → "Pick New Host" → Click wall
   - Repeat for all windows

3. **Fix "Not Enclosed" rooms:**
   - Add room separation lines if needed
   - Adjust wall endpoints to close gaps

4. **Join wall corners:**
   - Use "Edit Joins" to connect walls properly

## Troubleshooting

### AI Pipeline Issues

**Error: "Invalid output from Global Analyzer Agent"**
- Check that Gemini API key is set in `.env.development`
- Verify API quota is not exceeded
- Try running again (AI responses can vary)

**Error: "No elements detected"**
- Check that test drawing exists: `test-drawings/clean-sample01/clean-heimenzu.png`
- Try with a different, simpler floor plan
- Check that image is clear and high resolution

**Low quality score (<50)**
- Normal for first run with complex drawings
- Review validation agent output for specific issues
- Check dimension association rate
- May need prompt tuning for your specific drawing style

### Dynamo Issues

**"No door families found"**
- File → Load Family → `Doors/Single-Flush.rfa`
- Reload and re-run script

**"No window families found"**
- File → Load Family → `Windows/Fixed.rfa`
- Reload and re-run script

**"Module 'clr' not found"**
- You're running Python outside of Dynamo
- This script ONLY works inside Dynamo's Python Script node

**"Transaction not started"**
- Should not happen - script manages transactions
- Check error log output (OUT[5])

### Output Verification

**Check JSON structure:**
```bash
# Count elements by type
cat revit-outputs/clean-sample01-revit.json | grep '"type":' | sort | uniq -c

# Check metadata
cat revit-outputs/clean-sample01-revit.json | grep -A 10 '"metadata"'

# View statistics
cat revit-outputs/clean-sample01-revit.json | grep -A 15 '"statistics"'
```

**Check CSV:**
```bash
# View first 10 elements
head -n 11 revit-outputs/clean-sample01-revit.csv

# Count by type
tail -n +2 revit-outputs/clean-sample01-revit.csv | cut -d',' -f2 | sort | uniq -c
```

## Expected Results (clean-sample01)

### AI Pipeline Output
- **Processing time:** ~40 seconds
- **Walls:** 50-100
- **Doors:** 10-20
- **Windows:** 20-30
- **Rooms:** 5-15
- **Quality score:** 60-85 (acceptable to good)
- **Association rate:** 70-90%

### Dynamo Import
- **Created walls:** Most walls (90-100%)
- **Created doors:** Most doors (80-95%, unhosted)
- **Created windows:** Most windows (80-95%, unhosted)
- **Created rooms:** Some rooms (50-70%, depends on wall closure)
- **Failed elements:** 5-15% (usually rooms not enclosed)

### Manual Cleanup Time
- **Hosting doors/windows:** 5 minutes
- **Fixing rooms:** 2-5 minutes
- **Wall joins:** 2-3 minutes
- **Total:** 10-15 minutes for complete cleanup

## Performance Benchmarks

### AI Pipeline (per drawing)
- Global Analyzer: 3-5 seconds
- Geometric Specialist: 8-12 seconds
- Dimension Specialist: 5-8 seconds
- Association Agent: 4-6 seconds
- Validation Agent: 3-5 seconds
- **Total:** 25-40 seconds

### Gemini API Usage (per drawing)
- **Free tier:** Sufficient for testing (up to 60 requests/minute)
- **Cost:** $0 (using Gemini 2.5 Flash free tier for POC)
- **Tokens:** ~2000-5000 per agent call
- **Daily limit:** Should handle 50-100 drawings/day on free tier

### Dynamo Processing
- **Simple floor plan (20-30 elements):** 2-5 seconds
- **Medium floor plan (50-80 elements):** 5-10 seconds
- **Complex floor plan (100-150 elements):** 10-15 seconds

## Test Checklist

- [ ] AI pipeline completes without errors
- [ ] JSON output generated in `revit-outputs/`
- [ ] JSON structure is valid (validate with `jq` or JSON viewer)
- [ ] Coordinates are in millimeters
- [ ] Elements have required properties
- [ ] Dynamo script runs without errors in Revit
- [ ] Walls created at expected positions
- [ ] Doors placed (unhosted but correct location)
- [ ] Windows placed (unhosted but correct location)
- [ ] Rooms created with Japanese labels
- [ ] Manual cleanup completed
- [ ] Final Revit model is usable

## Success Criteria

**Minimum Viable:**
- 70%+ walls created correctly
- 60%+ doors/windows placed (even if unhosted)
- 40%+ rooms created
- Manual cleanup time < 20 minutes

**Good:**
- 85%+ walls created correctly
- 75%+ doors/windows placed
- 60%+ rooms created
- Manual cleanup time < 15 minutes

**Excellent:**
- 95%+ walls created correctly
- 85%+ doors/windows placed
- 75%+ rooms created
- Manual cleanup time < 10 minutes

## Known Limitations

1. **Doors/windows always unhosted** - By design, requires manual "Pick New Host"
2. **Some rooms may not close** - Depends on wall geometry accuracy
3. **No materials/finishes** - Not yet extracted by AI
4. **No furniture** - AI focuses on structural elements only
5. **Single floor only** - Multi-floor support planned
6. **Japanese text may have errors** - OCR challenges with handwritten labels

## Next Steps After Successful Test

1. Test with more drawings (different styles, scales)
2. Tune agent prompts based on common errors
3. Add automatic door/window wall hosting (future enhancement)
4. Expand to multi-floor buildings
5. Add material detection and assignment
6. Create comparison report generator (OCR vs AI)
