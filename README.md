# OCR Test Playground

R&D testing system for evaluating OCR and AI tools on construction layout drawings (配置図).

This project compares **Google Cloud Vision API** and **Google Gemini 2.0 Flash** for extracting structured data from construction drawings, helping determine the best approach for automated data extraction.

## 🎯 Purpose

Evaluate and compare OCR/AI tools for extracting:
- **Dimensions** (3500mm, 1255×960, R=450)
- **Equipment labels** (タワークレーン, 仮囲い, 資材置場)
- **Specifications** (13t, 25t)
- **Area information** (資材置場 3500mm × 4200mm)
- **Distance measurements**

## 📦 Tech Stack

- **Mastra** - Workflow orchestration
- **Google Cloud Vision API** - OCR specialist
- **Google Gemini 2.0 Flash** - Multimodal AI
- **Drizzle ORM** - Database access
- **PostgreSQL** - Results storage
- **TypeScript** - Type safety

## 🚀 Quick Start

### 1. Prerequisites

- Node.js 18+
- Docker (for PostgreSQL)
- Google Cloud account with Vision API enabled
- Google Gemini API key

### 2. Installation

```bash
# Clone or navigate to the project
cd ocr-test-playground

# Install dependencies
npm install

# Copy environment file
cp .env.development.example .env.development

# Edit .env.development with your credentials
# - GOOGLE_APPLICATION_CREDENTIALS (path to service account JSON)
# - GOOGLE_GEMINI_API_KEY
# - DATABASE_URL (default is fine for Docker)
```

### 3. Setup Google Cloud Credentials

**For Google Cloud Vision API:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project or select existing
3. Enable Cloud Vision API
4. Create a service account
5. Download JSON key file
6. Set path in `.env.development`:
   ```
   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
   ```

**For Google Gemini API:**
1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create API key
3. Add to `.env.development`:
   ```
   GOOGLE_GEMINI_API_KEY=your-key-here
   ```

### 4. Start Database

```bash
# Start PostgreSQL with Docker
docker compose up -d

# Verify it's running
docker compose ps

# Access PgAdmin (optional)
# http://localhost:5050
# Email: admin@ocr-test.local
# Password: admin
```

### 5. Run Database Migrations

```bash
# Generate migration files
npm run db:generate

# Run migrations
npm run db:migrate

# Optional: Open Drizzle Studio to explore database
npm run db:studio
```

### 6. Add Test Drawings

Create sample drawings in `test-drawings/` directory:

```bash
# Create a test drawing directory
mkdir -p test-drawings

# Add your drawings (PNG, JPG, PDF)
# Example: drawing-001.png

# Create metadata file: drawing-001-metadata.json
```

**Example metadata file:**
```json
{
  "id": "drawing-001",
  "type": "site-layout",
  "quality": "high",
  "source": "synthetic",
  "groundTruth": {
    "dimensions": [
      { "value": "3500mm", "element": "storage-area" },
      { "value": "1255", "element": "crane-width" }
    ],
    "equipment": [
      { "name": "タワークレーン", "spec": "13t" },
      { "name": "仮囲い", "length": "50m" }
    ],
    "areas": [
      { "name": "資材置場", "size": "3500mm × 4200mm" }
    ]
  }
}
```

### 7. Run Tests

```bash
# Run all workflows on all drawings
npm run test:all

# Run specific workflow
npm run test:cloud-vision
npm run test:gemini
npm run test:hybrid

# Custom options
npm run test -- --workflow cloud-vision --drawing drawing-001
```

### 8. View Results

Results are saved in `results/` directory:
- `test-run-{id}.html` - Visual comparison report
- `test-run-{id}.json` - Raw data

Open the HTML file in a browser to see the comparison.

## 📁 Project Structure

```
ocr-test-playground/
├── src/
│   ├── mastra/
│   │   ├── workflows/        # OCR workflows
│   │   │   ├── cloud-vision-workflow.ts
│   │   │   ├── gemini-workflow.ts
│   │   │   └── hybrid-workflow.ts
│   │   └── tools/            # Processing tools
│   │       ├── dimension-extractor.ts
│   │       ├── accuracy-calculator.ts
│   │       └── report-generator.ts
│   ├── lib/                  # Helper libraries
│   │   ├── cloud-vision-client.ts
│   │   ├── gemini-client.ts
│   │   └── utils.ts
│   ├── db/                   # Database
│   │   ├── schema.ts
│   │   └── index.ts
│   ├── test-runner.ts        # CLI test runner
│   └── index.ts              # Main entry point
├── test-drawings/            # Your test images + metadata
├── results/                  # Generated reports
└── package.json
```

## 🔄 Workflows

### 1. Cloud Vision OCR Workflow

Uses Google Cloud Vision Document Text Detection:
- Extracts all text with bounding boxes
- High accuracy for printed text
- Processes dimensions with regex
- Extracts equipment labels

**Best for:** High-quality scanned drawings with clear text

### 2. Gemini Multimodal Workflow

Uses Gemini 2.0 Flash with vision capabilities:
- Understands context and relationships
- Structured JSON output
- Recognizes Japanese construction terms
- Extracts equipment with specifications

**Best for:** Complex layouts requiring understanding

### 3. Hybrid Workflow

Combines both approaches:
- Runs Cloud Vision + Gemini in parallel
- Merges results with deduplication
- Boosts confidence for items found by both
- Calculates agreement metrics

**Best for:** Maximum accuracy and confidence

## 📊 Accuracy Metrics

Each test calculates:

- **Precision** = correct_items / items_found
- **Recall** = items_found / total_items
- **F1 Score** = 2 × (precision × recall) / (precision + recall)
- **Confidence** = average confidence scores
- **Processing Time** = milliseconds per drawing
- **API Cost** = estimated cost per drawing (¥)

## 💡 Tips for Best Results

### Creating Test Drawings

1. **Use diverse samples:**
   - High-quality digital PDFs
   - Scanned drawings (medium quality)
   - Old/low-quality scans
   - Hand-annotated drawings

2. **Create accurate ground truth:**
   - Manually verify all dimensions
   - Use exact text from drawings
   - Include position data if possible

3. **Start small:**
   - Test with 5-10 drawings first
   - Expand after validating accuracy

### Optimizing Extraction

**For Cloud Vision:**
- Pre-process images (contrast, noise removal)
- Use high-resolution scans (300+ DPI)
- Ensure text is horizontal

**For Gemini:**
- Craft detailed prompts
- Specify exact JSON format needed
- Test different prompt variations

**For Hybrid:**
- Use when accuracy is critical
- Accept higher cost for better results
- Review agreement metrics

## 🔧 Development

```bash
# Watch mode for development
npm run dev

# Generate database types after schema changes
npm run db:generate
npm run db:migrate

# Explore database
npm run db:studio
```

## 📈 Sample Output

After running tests, you'll get:

```
🧪 OCR Test Runner

📁 Loading test drawings...
✅ Found 5 test drawing(s)

============================================================
📄 Processing: drawing-001.png
============================================================

▶️  Running cloud-vision on drawing-001...
✅ Completed in 2.34s
📊 Calculating accuracy...

📈 Accuracy Metrics for cloud-vision:
  Dimension F1: 87.5%
  Equipment F1: 92.3%
  Confidence: 85.0%

============================================================
📊 Generating Comparison Report...
============================================================

✅ Report generated: ./results/test-run-abc123.html

🏆 Summary:
  Best Overall: gemini-2.0-flash
  Best Accuracy: hybrid
  Fastest: cloud-vision
  Cheapest: gemini-2.0-flash

✨ All tests completed!
```

## 🎓 Next Steps

After completing R&D:

1. **Analyze Results:**
   - Review HTML reports
   - Compare accuracy vs. cost
   - Identify failure patterns

2. **Document Findings:**
   - Which tool works best for your drawings?
   - What accuracy level is acceptable?
   - Cost projections for production use

3. **Make Recommendation:**
   - Primary tool choice
   - Backup options
   - Integration plan

4. **Production Integration:**
   - Integrate chosen workflow into main 3D K-Field system
   - Connect to AI API or Laravel API
   - Add to plan-layout-generator pipeline

## 🚨 Troubleshooting

**Database connection errors:**
```bash
# Restart PostgreSQL
docker compose down
docker compose up -d
```

**Google Cloud Vision errors:**
- Check service account permissions
- Verify API is enabled
- Check credentials file path

**Gemini API errors:**
- Verify API key is correct
- Check API quota limits
- Ensure model name is correct

**No test drawings found:**
- Create `test-drawings/` directory
- Add image files
- Add corresponding `-metadata.json` files
