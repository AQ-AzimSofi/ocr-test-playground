# AI-First Floor Plan Analysis Pipeline

## Overview

The Mastra AI Pipeline is a complete replacement for the OCR-based approach, using multi-step AI agents powered by Google Gemini 2.5 Flash to extract geometric elements and dimensions from architectural floor plans with superior accuracy and contextual understanding.

## Architecture

### Multi-Agent Workflow

```
Floor Plan Image
       ↓
┌──────────────────────────────────────────────┐
│  STEP 1: Global Analyzer Agent               │
│  - Identifies regions of interest            │
│  - Separates building, dimensions, text      │
│  - Provides strategic guidance               │
└──────────────────────────────────────────────┘
       ↓
┌──────────────────────────────────────────────┐
│  STEP 2: Geometric Specialist Agent          │
│  - Detects walls, doors, windows, rooms      │
│  - Returns precise pixel coordinates         │
│  - Classifies element types                  │
└──────────────────────────────────────────────┘
       ↓
┌──────────────────────────────────────────────┐
│  STEP 3: Dimension Specialist Agent          │
│  - Extracts dimension text                   │
│  - Traces leader line endpoints              │
│  - Parses numeric values                     │
└──────────────────────────────────────────────┘
       ↓
┌──────────────────────────────────────────────┐
│  STEP 4: Association Agent                   │
│  - Links dimensions to elements              │
│  - Uses spatial + semantic understanding     │
│  - Provides confidence scores                │
└──────────────────────────────────────────────┘
       ↓
┌──────────────────────────────────────────────┐
│  STEP 5: Scaling Calculator Tool             │
│  - Calculates mm/pixel conversion            │
│  - Uses associations as anchors              │
│  - Weighted averaging for robustness         │
└──────────────────────────────────────────────┘
       ↓
┌──────────────────────────────────────────────┐
│  STEP 6: Coordinate Transformer Tool         │
│  - Converts pixels to millimeters            │
│  - Optional Y-axis flipping                  │
│  - Validates transformations                 │
└──────────────────────────────────────────────┘
       ↓
┌──────────────────────────────────────────────┐
│  STEP 7: Validation Agent                    │
│  - Checks mathematical consistency           │
│  - Validates geometric sanity                │
│  - Assesses architectural plausibility       │
│  - Generates quality report                  │
└──────────────────────────────────────────────┘
       ↓
┌──────────────────────────────────────────────┐
│  STEP 8: Revit Output Generation             │
│  - Generates JSON for Dynamo                 │
│  - Generates CSV for spreadsheet review      │
│  - Ready for Revit import                    │
└──────────────────────────────────────────────┘
       ↓
  Revit Model
```

## Components

### AI Agents

Located in `src/mastra/agents/`:

1. **Global Analyzer Agent** (`global-analyzer-agent.ts`)
   - First-pass understanding of drawing layout
   - Identifies building area, dimension zones, annotation areas
   - Provides strategic bounding boxes for focused analysis
   - Output: Regions of interest with percentage coordinates

2. **Geometric Specialist Agent** (`geometric-specialist-agent.ts`)
   - Detects all structural elements
   - Supports: walls, doors, windows, rooms, stairs, columns
   - Returns pixel coordinates for all elements
   - Classifies element subtypes (exterior/interior walls, hinged/sliding doors, etc.)
   - Output: Array of geometric elements with coordinates and properties

3. **Dimension Specialist Agent** (`dimension-specialist-agent.ts`)
   - Extracts dimension text in various formats
   - Traces leader lines to endpoints
   - Finds scale indicators and elevation markers
   - Handles Japanese notation (10,920 format)
   - Output: Array of dimensions with text, coordinates, and leader lines

4. **Association Agent** (`association-agent.ts`)
   - Links dimensions to geometric elements
   - Uses 6 association methods:
     1. Leader line alignment (strongest)
     2. Spatial proximity
     3. Semantic understanding
     4. Orientation matching
     5. Cumulative calculation
     6. Contextual inference
   - Provides confidence scores and reasoning
   - Output: Associations with confidence and alternative candidates

5. **Validation Agent** (`validation-agent.ts`)
   - Performs 7 validation checks:
     1. Mathematical consistency
     2. Geometric sanity
     3. Architectural plausibility
     4. Scaling validation
     5. Data completeness
     6. Association quality
     7. Confidence analysis
   - Flags errors, warnings, and info
   - Suggests corrections
   - Output: Quality score, grade, issues, and recommendations

### Mastra Tools

Located in `src/mastra/tools/`:

1. **Coordinate Transformation Tool** (`coordinate-transformation-tool.ts`)
   - Transforms pixel coordinates to millimeters
   - Supports Y-axis flipping
   - Handles multiple coordinate systems

2. **Scaling Calculator Tool** (`scaling-calculator-tool.ts`)
   - Calculates mm/pixel conversion from associations
   - Uses weighted averaging
   - Handles outliers with median fallback
   - Provides confidence scores

3. **Spatial Association Tool** (`spatial-association-tool.ts`)
   - Calculates distances between dimensions and elements
   - Finds nearest matches within threshold
   - Supports orientation filtering
   - Returns sorted candidates by confidence

### Main Pipeline Processor

Located in `src/processors/mastra-ai-pipeline-processor.ts`:

- Orchestrates all agents in sequence
- Handles data flow between agents
- Generates Revit JSON and CSV outputs
- Provides comprehensive logging
- Error handling and warnings

## Usage

### Running the Pipeline

```bash
# Run on default test drawing
npm run test:ai-pipeline

# Run on specific drawing
npm run test:ai-pipeline -- --drawing clean-sample01

# Run without validation (faster)
npm run test:ai-pipeline -- --drawing clean-sample01 --no-validation
```

### Pipeline Options

```typescript
processMastraAIPipeline({
  drawing_id: 'my-drawing',
  file_path: '/path/to/image.png',
  output_dir: './revit-outputs',
  flip_y_axis: false,
  default_scaling_factor: 15.0,
  enable_validation: true,
  min_validation_score: 50,
});
```

### Output Files

The pipeline generates two files in `revit-outputs/`:

1. **`{drawing_id}-revit.json`**
   - Complete structured data
   - Metadata with quality metrics
   - All elements with dual coordinates (px and mm)
   - Properties with defaults applied
   - Statistics and validation results

2. **`{drawing_id}-revit.csv`**
   - Tabular format for spreadsheet review
   - One element per row
   - Millimeter coordinates ready for Dynamo
   - Can be imported to Excel for manual verification

## Output Format

### JSON Structure

```json
{
  "metadata": {
    "drawing_id": "clean-sample01",
    "file_name": "clean-heimenzu.png",
    "scale": "1:100",
    "units": "mm",
    "tool": "mastra-ai-pipeline",
    "coordinate_transformation": {
      "scaling_factor": 51.776,
      "pixels_per_mm": 0.0193,
      "scaling_confidence": 0.85,
      "anchor_count": 23,
      "coordinate_system": "top-left origin"
    },
    "data_quality": {
      "overall_completeness": 87.5,
      "quality_score": 82,
      "quality_grade": "good",
      "total_issues": 3,
      "errors": 0,
      "warnings": 3
    }
  },
  "elements": [
    {
      "id": "elem_0",
      "type": "wall",
      "subType": "exterior",
      "geometry": {
        "type": "line",
        "coordinates_px": [
          { "x": 85, "y": 147 },
          { "x": 100, "y": 147 }
        ],
        "coordinates_mm": [
          { "x": 4400.97, "y": 7611.09 },
          { "x": 5177.61, "y": 7611.09 }
        ]
      },
      "properties": {
        "dimension_texts": ["10,920"],
        "length_mm": 776.64,
        "thickness_mm": 200,
        "height_mm": 3000,
        "confidence": 0.92
      },
      "level": "Level 1"
    }
  ],
  "statistics": {
    "total_elements": 127,
    "elements_by_type": {
      "wall": 89,
      "door": 12,
      "window": 26
    },
    "elements_with_dimensions": 104,
    "total_dimensions": 156,
    "association_rate": 85.3
  }
}
```

## Key Advantages Over OCR

### 1. Contextual Understanding
- AI understands architectural conventions
- Distinguishes wall lines from dimension lines
- Recognizes element symbols (doors, windows, etc.)
- Interprets spatial relationships

### 2. Intelligent Association
- Semantic understanding of which dimension belongs to which element
- Handles distant dimensions with leader lines
- Resolves ambiguous cases using multiple methods
- Provides confidence scores and reasoning

### 3. Self-Correction
- Validation agent checks for inconsistencies
- Suggests corrections for obvious errors
- Flags low-confidence items for review
- Can trigger re-processing if needed

### 4. Element Type Support
- Walls (exterior, interior, structural, partition)
- Doors (hinged, sliding, folding, double)
- Windows (fixed, casement, sliding, bay)
- Rooms (with boundaries and labels)
- Stairs (with direction and step count)
- Columns (structural supports)

### 5. Quality Assurance
- Comprehensive validation checks
- Quality score (0-100) and grade
- Issue categorization (errors, warnings, info)
- Ready-for-Revit flag
- Detailed recommendations

## Iterative Refinement

The AI pipeline is designed for iterative refinement. If results are not satisfactory:

### 1. Check Agent Outputs
Each agent's output is saved in the pipeline result. Inspect:
```typescript
result.global_analysis
result.geometric_analysis
result.dimension_analysis
result.association_analysis
result.validation_result
```

### 2. Refine Agent Prompts
Edit agent files in `src/mastra/agents/` to:
- Add more specific instructions
- Provide examples of desired output
- Emphasize critical requirements
- Add error cases to avoid

### 3. Adjust Thresholds
Modify pipeline options:
- `default_scaling_factor`: Change if drawings have different scales
- `min_validation_score`: Lower for lenient acceptance, raise for strict quality
- `flip_y_axis`: Toggle if coordinate system is inverted

### 4. Add Custom Tools
Create new tools in `src/mastra/tools/` for:
- Specialized geometric calculations
- Custom association heuristics
- Domain-specific validation rules

## Performance Considerations

### API Costs
- Using Gemini 2.5 Flash (free tier for POC)
- ~5-8 API calls per drawing (depending on validation)
- Typical processing time: 20-40 seconds per drawing
- Can be parallelized for batch processing

### Accuracy Metrics (Target)
- Dimension Association Rate: >80% (vs ~50% with OCR)
- Data Completeness: >70% (vs ~45% with OCR)
- Element Detection: 6+ types (vs 4 with current system)
- Quality Score: >70/100 for acceptable drawings

## Next Steps

### Immediate Priorities

1. **Test and Iterate**
   - Run on multiple test drawings
   - Refine agent prompts based on output
   - Tune association confidence thresholds
   - Optimize validation rules

2. **Expand Dynamo Support**
   - Create `create_doors.py`
   - Create `create_windows.py`
   - Create `create_rooms.py`
   - Create `create_all_elements.py` (master script)

3. **Comparison Testing**
   - Run both OCR and AI pipelines on same drawings
   - Compare accuracy, completeness, and processing time
   - Generate side-by-side comparison reports

### Future Enhancements

1. **Interactive Correction UI**
   - Web interface to review and correct results
   - Manual association override
   - Confidence adjustment
   - Re-run specific agents

2. **Multi-Floor Support**
   - Detect floor level indicators
   - Separate elements by floor
   - Generate multi-level Revit models

3. **3D Element Support**
   - Stairs with landing calculations
   - Slabs and ceilings
   - Roofs with slopes
   - Structural columns with capitals

4. **Family Mapping**
   - Map detected elements to Revit families
   - Support custom family libraries
   - Handle family parameters

5. **Batch Processing**
   - Process multiple drawings in parallel
   - Generate summary reports
   - Compare drawings for consistency

## Troubleshooting

### Common Issues

**Issue: Low scaling factor confidence**
- Cause: Few dimensions associated with elements
- Fix: Improve dimension extraction prompts or manually specify scaling factor

**Issue: Many unassociated dimensions**
- Cause: Dimension text far from elements or leader lines not detected
- Fix: Adjust spatial proximity threshold or improve leader line tracing

**Issue: Low validation score**
- Cause: Missing required properties or inconsistent dimensions
- Fix: Apply more intelligent defaults or improve geometric detection

**Issue: API errors**
- Cause: Invalid API key, rate limiting, or quota exceeded
- Fix: Check .env.development, wait for rate limit reset, or upgrade API tier

### Debug Mode

Enable detailed logging:
```typescript
console.log(JSON.stringify(result.geometric_analysis, null, 2));
console.log(JSON.stringify(result.association_analysis, null, 2));
console.log(JSON.stringify(result.validation_result, null, 2));
```

## Support

For issues, questions, or contributions:
- Check agent output files for specific errors
- Review validation results for quality issues
- Inspect CSV output for data verification
- Test with different drawings to isolate problems

---

**Built with:**
- Google Gemini 2.5 Flash (AI)
- Mastra Framework (Agent orchestration)
- TypeScript (Type safety)
- Zod (Schema validation)
