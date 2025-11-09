# Gemini Coordinate Accuracy Experiments

## Overview

These experimental processors test different approaches to get accurate bounding boxes for Gemini-detected text.

**Problem:** Gemini excels at detecting text (especially challenging text) but provides inaccurate bounding box coordinates.

**Goal:** Find methods to combine Gemini's superior text detection with precise pixel coordinates.

## Quick Start

```bash
# Run all experiments on your test drawings
npm run test:experiments

# Run specific experiment
npm run test:exp:template-matching
npm run test:exp:multi-ocr
npm run test:exp:grid-overlay
npm run test:exp:region-detection

# Run baseline for comparison
npm run test:exp:baseline
```

## Experimental Processors

### 1. Template Matching (`template-matching`)

**File:** `src/experiments/gemini-coords/gemini-template-matching-processor.ts`

**Strategy:**

1. Gemini extracts text (superior detection)
2. Cloud Vision provides baseline bboxes
3. Fuzzy match Gemini text to Cloud Vision bboxes
4. For unmatched text: Use spatial interpolation based on neighbors

**Advantages:**

- PASS: Leverages Gemini's text detection
- PASS: Uses Cloud Vision's precise bboxes where possible
- PASS: Spatial heuristics for unmatched text

**Cost:** Gemini + Cloud Vision (~¥0.20 per image)

**Note:** Full template matching would require OpenCV for pixel-level matching. Current implementation uses text fuzzy matching + spatial estimation.

---

### 2. Multi-OCR Fusion (`multi-ocr-fusion`)

**File:** `src/experiments/gemini-coords/gemini-multi-ocr-fusion-processor.ts`

**Strategy:**

1. Run ALL OCR tools in parallel:
   - Gemini (text detection)
   - Cloud Vision (paragraph bboxes)
   - Azure Read (word bboxes)
   - Azure Layout (line bboxes)
2. For each Gemini text segment:
   - Try to match with Cloud Vision bbox
   - If no match, try Azure Read bbox
   - If no match, try Azure Layout bbox
   - If still no match, synthesize bbox
3. Result: Gemini text + best available bbox from any source

**Advantages:**

- PASS: Highest match rate (3 OCR sources)
- PASS: Different granularities: paragraph, word, line
- PASS: Gemini's completeness + best bbox precision

**Cost:** Gemini + Cloud Vision + Azure Read + Azure Layout (~¥2.00 per image)

**Best for:** Maximum accuracy, willing to pay for multiple OCR sources

---

### 3. Grid Overlay (`grid-overlay`)

**File:** `src/experiments/gemini-coords/gemini-grid-overlay-processor.ts`

**Strategy:**

1. Draw transparent 20x20 coordinate grid on image
2. Label grid axes: A-T (columns), 1-20 (rows)
3. Ask Gemini to provide text + grid cell reference (e.g., "配筋図|E5")
4. Convert grid cell to pixel coordinates

**Advantages:**

- PASS: More intuitive than percentages
- PASS: Visual coordinate reference for Gemini
- PASS: Cell-level precision (~5% of image)

**Concerns:**

- WARNING: Grid overlay might interfere with text detection
- WARNING: Still approximate (cell-level, not pixel-perfect)

**Cost:** Gemini only (~¥0.05 per image)

**Note:** Experiment also tests impact of grid on detection quality

---

### 4. Region Detection (`region-detection`)

**File:** `src/experiments/gemini-coords/gemini-region-detection-processor.ts`

**Strategy:**

1. Azure Layout detects text regions (lines/paragraphs)
2. Crop each detected region
3. Gemini extracts text from each region
4. Combine: Region bbox (from Azure) + Text (from Gemini)
5. Also run Gemini on full image to detect anything Azure missed

**Advantages:**

- PASS: Precise region bboxes (from Azure Layout)
- PASS: Accurate text extraction (from Gemini)
- PASS: Detects if Azure misses any text

**Concerns:**

- WARNING: If Azure doesn't detect a region, Gemini won't process it
- WARNING: Full image Gemini catches missed text but without regions

**Cost:** Azure Layout + Gemini (regions) + Gemini (full) (~¥1.70 per image)

**Future Enhancement:** Could use CRAFT or PaddleOCR's detection module for better region detection

---

### 5. Baseline (`baseline`)

**File:** `src/processors/gemini-bbox-synthesis-processor.ts`

Runs the existing gemini-bbox-synthesis processor for comparison.

---

## Running Experiments

### On All Test Drawings

```bash
npm run test:experiments
```

This will:

1. Find all images in `test-drawings/`
2. Run all 5 processors (4 experiments + baseline)
3. Calculate accuracy metrics if ground truth available
4. Generate comparison report

### On Specific Drawing

```bash
npm run test:experiments -- --drawing your-drawing-name
```

### Single Experiment

```bash
# Just template matching
npm run test:exp:template-matching

# Just multi-OCR fusion
npm run test:exp:multi-ocr

# Just grid overlay
npm run test:exp:grid-overlay

# Just region detection
npm run test:exp:region-detection
```

## Understanding Results

### Accuracy Metrics

- **CER (Character Error Rate)**: Lower is better (0.0 = perfect)
- **Character Accuracy**: Percentage of correctly detected characters
- **Coverage**: Percentage of unique characters found
- **Bbox Sources**: Where bboxes came from
  - `ocr`: From traditional OCR (precise)
  - `gemini-percentage`: From Gemini percentages (approximate)
  - `synthesized`: Generated from spatial heuristics
  - `estimated`: Fallback estimation

### Comparison Output

The test runner generates a comparison table:

```
Experiment              | Avg CER  | Avg Accuracy | Avg Cost | Avg Time
--------------------------------------------------------------------------------
template-matching       | 0.05%    | 95.2%        | ¥0.20    | 3.2s
multi-ocr-fusion        | 0.03%    | 97.1%        | ¥2.00    | 5.8s
grid-overlay            | 0.08%    | 92.5%        | ¥0.05    | 2.1s
region-detection        | 0.04%    | 96.3%        | ¥1.70    | 4.5s
baseline                | 0.06%    | 94.8%        | ¥0.20    | 3.0s
```

### What to Look For

**Best Text Detection:**

- Which experiment has lowest CER?
- Which has highest coverage?

**Best Bbox Accuracy:**

- Visual inspection: Do bboxes properly bound the text?
- IoU metric (if ground truth bboxes available)

**Best Trade-off:**

- Consider accuracy vs cost vs speed
- Which gives good results at reasonable cost?

## Testing on Your Screenshot

```bash
# Place your screenshot in test-drawings/
mkdir -p test-drawings/my-test
cp /path/to/screenshot.png test-drawings/my-test/

# Optional: Create ground truth
cat > test-drawings/my-test/screenshot-ground-truth.txt << EOF
配筋図
3500mm
浴室
...
EOF

# Create metadata
cat > test-drawings/my-test/screenshot-metadata.json << EOF
{
  "id": "my-screenshot",
  "type": "screenshot",
  "quality": "medium",
  "source": "test",
  "groundTruth": {
    "fullTextFile": "./screenshot-ground-truth.txt"
  }
}
EOF

# Run experiments
npm run test:experiments
```

## Next Steps

### If an Experiment Works Well

1. **Document findings** in `src/experiments/README.md`
2. **Refine implementation** based on learnings
3. **Consider promoting** to production processors
4. **Update main README** with recommendations

### If No Experiment Works

1. **Analyze failures**: What went wrong?
2. **Try variations**: Adjust thresholds, grid size, etc.
3. **Combine approaches**: Mix successful elements
4. **Consider new ideas**: What else could work?

## Configuration

Most experiments have configurable parameters at the top of their files:

**Grid Overlay:**

```typescript
const DEFAULT_GRID: GridConfig = {
  rows: 20, // Try 10, 15, 20, 25
  cols: 20, // Try 10, 15, 20, 25
  opacity: 0.15, // Try 0.1 to 0.3
  color: { r: 128, g: 128, b: 128 },
};
```

**Fuzzy Matching Threshold:**

```typescript
const match = fuzzyMatchTextToBbox(text, bboxes, 0.65); // Try 0.5 to 0.8
```

## FAQ

**Q: Which experiment should I try first?**

A: Try `multi-ocr-fusion` first - it has the highest match rate and is most likely to succeed.

**Q: The grid overlay doesn't work - why?**

A: Gemini might struggle with the coordinate format or the grid might interfere with detection. Check if Gemini followed the format in the raw response.

**Q: Can I combine experiments?**

A: Yes! You can create hybrid approaches. For example: Multi-OCR fusion with grid overlay fallback for unmatched text.

**Q: How do I know if bboxes are accurate?**

A: Visual inspection is best. The frontend viewer (http://localhost:5173/) can overlay bboxes on images for visual validation.

**Q: Which is most cost-effective?**

A: `grid-overlay` (Gemini only, ~¥0.05) or `template-matching` (Gemini + Cloud Vision, ~¥0.20)

**Q: Which is most accurate?**

A: Likely `multi-ocr-fusion` (multiple sources) or `region-detection` (if Azure detects all regions)

## Troubleshooting

**Gemini doesn't follow the format:**

- Check the prompt
- Try simplifying the format
- Add more examples in the prompt

**Too many unmatched segments:**

- Lower fuzzy matching threshold
- Add more OCR sources
- Improve spatial heuristics

**Grid overlay interferes with detection:**

- Reduce grid opacity
- Try fewer grid lines
- Use different color

**Azure misses text regions:**

- Try Cloud Vision instead
- Or wait for CRAFT/PaddleOCR integration
- Use full-image Gemini as backup

## File Structure

```
src/experiments/
├── README.md                          # Experiment documentation
├── test-experiments.ts                # Experimental test runner
└── gemini-coords/                     # Gemini coordinate experiments
    ├── gemini-template-matching-processor.ts
    ├── gemini-multi-ocr-fusion-processor.ts
    ├── gemini-grid-overlay-processor.ts
    └── gemini-region-detection-processor.ts
```

## Contributing

Have an idea for a new experiment? Add it to `src/experiments/gemini-coords/` and update the test runner!
