# Test Drawings

## How to Add Test Drawings

1. **Add drawing image:**
   - Supported formats: .png, .jpg, .jpeg, .pdf
   - Example: `drawing-001.png`

2. **Create metadata file:**
   - Same name as drawing with `-metadata.json` suffix
   - Example: `drawing-001-metadata.json`

## Metadata Format

```json
{
  "id": "drawing-001",
  "type": "site-layout",
  "quality": "high",
  "source": "synthetic",
  "groundTruth": {
    "dimensions": [
      {
        "value": "3500mm",
        "x": 120,
        "y": 450,
        "element": "storage-area",
        "type": "length"
      },
      {
        "value": "1255",
        "x": 340,
        "y": 200,
        "element": "crane-width",
        "type": "width"
      }
    ],
    "equipment": [
      {
        "name": "タワークレーン",
        "spec": "13t",
        "x": 500,
        "y": 300
      },
      {
        "name": "仮囲い",
        "spec": "50m",
        "x": 100,
        "y": 100
      }
    ],
    "areas": [
      {
        "name": "資材置場",
        "width": "3500mm",
        "depth": "4200mm",
        "size": "3500mm × 4200mm"
      }
    ]
  }
}
```

## Field Descriptions

### Root Fields
- `id`: Unique identifier for this drawing
- `type`: Type of drawing (`site-layout`, `floor-plan`, `elevation`, etc.)
- `quality`: Quality level (`high`, `medium`, `low`)
- `source`: Source of drawing (`synthetic`, `cad-generated`, `scanned`, `manual`)

### Ground Truth Fields

**dimensions:**
- `value`: The dimension text as it appears (e.g., "3500mm")
- `x`, `y`: Optional pixel coordinates
- `element`: What this dimension measures
- `type`: Type of dimension (`length`, `width`, `height`, `radius`, etc.)

**equipment:**
- `name`: Equipment name (Japanese or English)
- `spec`: Specification (tonnage, size, etc.)
- `x`, `y`: Optional position coordinates

**areas:**
- `name`: Area name
- `width`, `depth`: Optional individual dimensions
- `size`: Complete size string

## Tips

1. **Be accurate:** Ground truth is used to calculate accuracy metrics
2. **Use exact text:** Copy dimension text exactly as it appears
3. **Add coordinates:** Optional but helps with precision metrics
4. **Test variety:** Include different drawing types and quality levels

## Example Drawings to Create

1. **High-quality digital** - Modern CAD-generated PDF
2. **Medium-quality scan** - Scanned copy with slight noise
3. **Low-quality old** - Poor resolution, yellowed paper
4. **Hand-annotated** - Digital + handwritten notes
5. **Simple layout** - 2-5 elements, easy to read
6. **Complex dense** - 20+ elements, crowded

## Getting Sample Drawings

### Option 1: Generate Synthetic Data
Use your existing plan-layout-generator from 3D K-Field AI API to create test drawings.

### Option 2: CAD Software Samples
- Download Jw_cad (Japanese CAD) sample files
- Use DraftSight demo templates
- LibreCAD construction samples

### Option 3: Public Resources
- Search: "配置図 サンプル PDF"
- Japanese government open data (MLIT)
- Construction CAD template sites

### Option 4: Create Manual Test Cases
- Use PowerPoint/Illustrator
- Draw simple layouts with text
- Export as PDF/PNG
