# Experimental OCR Processors

This directory contains experimental processors that are being tested and evaluated. Unlike production processors in `src/processors/`, these are research prototypes exploring new approaches to OCR accuracy.

## Purpose

Experimental processors are used to:

- Test new OCR strategies and techniques
- Evaluate accuracy improvements
- Compare different approaches
- Identify candidates for production use

## Current Experiments

### Gemini Coordinate Accuracy (`gemini-coords/`)

**Problem**: Google Gemini excels at detecting text (especially challenging text with overlays, noise, or complex backgrounds) but doesn't provide precise bounding box coordinates.

**Goal**: Find methods to get accurate bounding boxes for Gemini-detected text.

**Experiments**:

1. **Template Matching Processor** (`gemini-template-matching-processor.ts`)
   - Gemini detects text content
   - OpenCV template matching finds exact pixel locations
   - Uses computer vision to locate text precisely

2. **Multi-OCR Fusion Processor** (`gemini-multi-ocr-fusion-processor.ts`)
   - Runs multiple OCR tools in parallel (Cloud Vision, Azure Read, Azure Layout)
   - Gemini provides superior text detection
   - Fuzzy matching combines Gemini text with best available bboxes
   - Template matching fallback for unmatched text

3. **Grid Overlay Processor** (`gemini-grid-overlay-processor.ts`)
   - Adds transparent coordinate grid to image
   - Gemini references grid cells for text location
   - Converts grid references to pixel coordinates
   - Tests whether visual grid helps or hinders Gemini

4. **Region Detection Processor** (`gemini-region-detection-processor.ts`)
   - Uses CRAFT text detector to find text regions
   - Gemini extracts text from each detected region
   - Combines precise region detection with accurate text extraction

## Running Experiments

```bash
# Run all experiments
npm run test:experiments

# Run specific experiment
npm run test:exp:template-matching
npm run test:exp:multi-ocr
npm run test:exp:grid-overlay
npm run test:exp:region-detection
```

## Evaluation Criteria

Each experiment is evaluated on:

### Primary Metrics

- **Text Completeness**: Did we detect all text? (compare to ground truth)
- **Bbox Accuracy**: Are bounding boxes accurate? (visual inspection + IoU if available)
- **Character Error Rate (CER)**: OCR accuracy of extracted text

### Secondary Metrics

- **Processing Time**: How fast is the approach?
- **API Cost**: How much does it cost per image?
- **Bbox Source Distribution**: Where do bboxes come from? (OCR match, template, estimated)

### Success Criteria

An experiment is considered successful if:

- PASS: Text completeness ≥ Gemini standalone
- PASS: Bbox accuracy > gemini-coordinates baseline
- PASS: Cost remains reasonable (< 2 yen per image)
- PASS: Visual inspection shows properly bounded text

## Promotion to Production

If an experimental processor proves successful:

1. **Document findings** in experiment results
2. **Refine implementation** based on learnings
3. **Add comprehensive tests**
4. **Move to production processors** (`src/processors/`)
5. **Update main test runner** to include the new processor
6. **Document in main README**

## Experiment Lifecycle

```
Idea → Experiment → Evaluation → Decision
                        ↓
                ┌───────┴────────┐
                ↓                ↓
         Promote to Prod    Archive/Discard
```

## Current Status

| Experiment        | Status         | Findings | Next Steps       |
| ----------------- | -------------- | -------- | ---------------- |
| Template Matching | 🚧 In Progress | TBD      | Implement & test |
| Multi-OCR Fusion  | 🚧 In Progress | TBD      | Implement & test |
| Grid Overlay      | 🚧 In Progress | TBD      | Implement & test |
| Region Detection  | 🚧 In Progress | TBD      | Implement & test |

## Notes

- Experiments may have dependencies not used in production
- Code quality may be lower than production (prioritizing speed of iteration)
- Breaking changes are acceptable in this directory
- Documentation may be minimal for early-stage experiments

## Questions or Ideas?

If you have ideas for new experiments, document them in this README or create a proposal in the issues tracker.
