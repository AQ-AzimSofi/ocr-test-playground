# OCR Test Playground

R&D testing system for evaluating OCR and AI tools on construction and architectural drawings using character-level accuracy metrics.

This project compares **Google Cloud Vision API**, **Google Gemini 2.0 Flash**, and **Azure AI Document Intelligence** for text extraction accuracy from construction/architectural drawings, helping determine the best approach for automated OCR.

## System Architecture

The OCR Test Playground consists of four main components:

```
┌─────────────────────┐
│  Frontend Viewer    │  React + Vite (Port 5173)
│  (Results UI)       │  - Test run timeline
└──────────┬──────────┘  - Side-by-side comparison
           │             - Statistics dashboard
           │             - Bounding box visualization
           ↓
┌─────────────────────┐
│  Backend API        │  Fastify (Port 3001)
│  (REST API)         │  - Test run endpoints
└──────────┬──────────┘  - Results data API
           │             - Static file serving
           ↓
┌─────────────────────┐
│  Test Runner        │  CLI (npm run test)
│  (OCR Processing)   │  - Runs OCR processors
└──────────┬──────────┘  - Calculates accuracy
           │             - Generates reports
           ↓
┌─────────────────────┐
│  PostgreSQL DB      │  Docker (Port 5434)
│  (Results Storage)  │  - Test runs
└─────────────────────┘  - Extraction results
                         - Accuracy metrics
```

**Access Points:**

- Frontend UI: http://localhost:5173/
- Backend API: http://localhost:3001/
- Database Studio: https://local.drizzle.studio/
- PgAdmin: http://localhost:5051/
- Database: postgresql://localhost:5434/ocr_test_db

## Purpose

Evaluate and compare OCR/AI tools for extracting all text and characters from drawings:

- **Numbers and dimensions** (10,920, 1,820, 910, 3500mm, 1255×960)
- **Japanese text** (浴室, 洗面室, 押入, タワークレーン, 仮囲い)
- **Special characters** (×, ㎡)
- **All visible text** - character-by-character accuracy evaluation

Uses industry-standard **Character Error Rate (CER)** and other character-level metrics to measure OCR quality.

## Tech Stack

- **Mastra** - Workflow orchestration
- **Google Cloud Vision API** - OCR specialist
- **Google Gemini 2.0 Flash** - Multimodal AI
- **Azure AI Document Intelligence** - Layout analysis specialist
- **Drizzle ORM** - Database access
- **PostgreSQL** - Results storage
- **TypeScript** - Type safety
- **React** - Frontend UI
- **Vite** - Build tooling

## Quick Start

### 1. Prerequisites

- Node.js 18+
- Docker (for PostgreSQL)
- Google Cloud account with Vision API enabled
- Google Gemini API key
- Azure account with Document Intelligence enabled (optional)

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
# - AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT (optional)
# - AZURE_DOCUMENT_INTELLIGENCE_KEY (optional)
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

**For Azure AI Document Intelligence (Optional):**

1. Go to [Azure Portal](https://portal.azure.com/)
2. Create a "Document Intelligence" resource
3. Get endpoint and API key from "Keys and Endpoint" section
4. Add to `.env.development`:
   ```
   AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT=https://your-resource.cognitiveservices.azure.com/
   AZURE_DOCUMENT_INTELLIGENCE_KEY=your-key-here
   ```

### 4. Start Database

```bash
# Start PostgreSQL with Docker
docker compose up -d

# Verify it's running
docker compose ps

# Access PgAdmin (optional)
# http://localhost:5051
# Email: admin@ocr-test.local
# Password: admin
```

**Note:** PostgreSQL runs on port **5434** externally (not 5432) and PgAdmin on **5051** (not 5050).

### 5. Run Database Migrations

```bash
# Generate migration files
npm run db:generate

# Run migrations
npm run db:migrate

# Optional: Open Drizzle Studio to explore database
npm run db:studio
# Opens at https://local.drizzle.studio/
```

### 6. Add Test Drawings

Create sample drawings in `test-drawings/` directory:

```bash
# Create a test drawing directory
mkdir -p test-drawings/sample01

# Add your drawings (PNG, JPG, PDF)
# Example: drawing-001.png

# Create metadata file: drawing-001-metadata.json
# Create ground truth file: drawing-001-ground-truth.txt
```

**Example metadata file:**

```json
{
  "id": "drawing-001",
  "type": "floor-plan",
  "quality": "high",
  "source": "architectural-drawing",
  "description": "Japanese architectural floor plan with room labels",
  "groundTruth": {
    "fullTextFile": "./drawing-001-ground-truth.txt"
  }
}
```

**Example ground truth file (`drawing-001-ground-truth.txt`):**

```
10,920
1,820
910
浴室
洗面室
押入
床の間
トイレ
キッチン
玄関
和室
13.24㎡
リビング
33.95㎡
```

**Benefits of using external `.txt` files:**

- Much easier to read and edit
- No need to escape line breaks with `\n`
- Can use any text editor
- Better for version control
- Easier to verify accuracy

### 7. Run Tests

```bash
# Run all processors on all drawings
npm run test:all

# Run specific processor
npm run test:cloud-vision
npm run test:gemini
npm run test:hybrid
npm run test:azure

# Custom options
npm run test -- --workflow cloud-vision --drawing drawing-001
npm run test -- --workflow azure-layout --drawing drawing-001
```

### 8. View Results

Results are saved in two places:

**1. Database (Viewable in Frontend UI):**

- All test runs are stored in PostgreSQL
- Access the frontend at http://localhost:5173/
- Browse test runs chronologically
- Compare results side-by-side
- View detailed statistics and metrics

**2. Generated Reports (`results/` directory):**

- `test-run-{uuid}.html` - Standalone visual report
- `test-run-{uuid}.json` - Raw JSON data
- Open HTML files in browser for offline viewing

## Running in Development

Complete setup for developing and viewing OCR results:

### Terminal 1: Start Database

```bash
cd /path/to/ocr-test-playground
docker compose up -d
```

**Verify database is running:**

```bash
docker compose ps
# Should show postgres and pgadmin containers running
```

### Terminal 2: Start Backend API Server

```bash
cd /path/to/ocr-test-playground
npm run api:dev
```

**Expected output:**

```
OCR Visualization API Server
================================
Server listening on: http://localhost:3001
Static files: http://localhost:3001/static/drawings/
Health check: http://localhost:3001/health
```

**API Endpoints:**

- `GET /api/test-runs` - List all test runs
- `GET /api/test-runs/:id` - Get test run details
- `GET /api/drawings` - List all drawings
- `GET /api/drawings/:id/results` - Get OCR results for drawing
- `GET /api/results/:id` - Get specific result with bounding boxes
- `GET /static/drawings/` - Static drawing images

### Terminal 3: Start Frontend Dev Server

```bash
cd /path/to/ocr-test-playground/frontend
npm run dev
```

**Expected output:**

```
VITE v7.2.1  ready in XXX ms

Local:   http://localhost:5173/
Network: use --host to expose
```

### Access the Application

1. **Frontend UI**: http://localhost:5173/
   - View test runs chronologically
   - Compare OCR results side-by-side
   - Analyze statistics and accuracy metrics
   - Interactive bounding box visualization

2. **API Server**: http://localhost:3001/
   - REST API for programmatic access
   - Health check: http://localhost:3001/health

3. **Database Admin**: http://localhost:5051/
   - PgAdmin web interface
   - Login: `admin@ocr-test.local` / `admin`
   - View tables: test_runs, extraction_results, accuracy_metrics

4. **Database Studio**: Run `npm run db:studio`
   - Drizzle Studio visual DB explorer
   - Opens at https://local.drizzle.studio/

### Development Workflow

```bash
# 1. Add new test drawing to test-drawings/
mkdir -p test-drawings/sample02
cp my-drawing.png test-drawings/sample02/
# Create metadata and ground truth files

# 2. Run OCR tests
npm run test:all

# 3. View results in frontend
# Open http://localhost:5173/ to see the new test run

# 4. Iterate and compare
# Modify processors, re-run tests, compare results
```

## Project Structure

```
ocr-test-playground/
├── src/                      # Backend source code
│   ├── api/                  # REST API server (Fastify)
│   │   ├── server.ts         # API server entry point
│   │   └── routes/           # API route handlers
│   │       ├── drawings.ts
│   │       ├── results.ts
│   │       └── test-runs.ts
│   ├── processors/           # OCR processor implementations
│   │   ├── cloud-vision-processor.ts
│   │   ├── gemini-processor.ts
│   │   ├── hybrid-processor.ts
│   │   ├── azure-layout-processor.ts
│   │   ├── azure-read-processor.ts
│   │   ├── cloud-vision-gemini-hybrid-processor.ts
│   │   ├── azure-read-gemini-hybrid-processor.ts
│   │   ├── gemini-coordinates-processor.ts
│   │   ├── gemini-bbox-synthesis-processor.ts
│   │   ├── gemini-validation-processor.ts
│   │   └── region-classifier-processor.ts
│   ├── mastra/
│   │   └── tools/            # Processing tools
│   │       ├── dimension-extractor.ts
│   │       ├── accuracy-calculator.ts
│   │       └── report-generator.ts
│   ├── lib/                  # Helper libraries
│   │   ├── cloud-vision-client.ts
│   │   ├── gemini-client.ts
│   │   ├── azure-document-client.ts
│   │   └── utils.ts
│   ├── db/                   # Database schema & migrations
│   │   ├── schema.ts         # Drizzle ORM schema
│   │   └── index.ts
│   ├── utils/                # Shared utilities
│   ├── test-runner.ts        # CLI test runner
│   └── index.ts              # Main entry point
├── frontend/                 # React results viewer
│   ├── src/
│   │   ├── api/              # API client & React Query hooks
│   │   ├── components/       # Reusable UI components
│   │   │   ├── icons/        # Icon components
│   │   │   ├── ImageCanvas.tsx
│   │   │   ├── TestRunCard.tsx
│   │   │   └── Tooltip.tsx
│   │   ├── pages/            # Page components
│   │   │   ├── Home.tsx
│   │   │   ├── TestRunViewer.tsx
│   │   │   ├── DrawingViewer.tsx
│   │   │   ├── Comparison.tsx
│   │   │   └── Statistics.tsx
│   │   ├── types/            # TypeScript type definitions
│   │   ├── utils/            # Frontend utilities
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   └── vite.config.ts
├── test-drawings/            # Your test images + metadata
│   ├── README.md
│   └── sample01/
│       ├── zumen_04b.png
│       ├── zumen_04b-metadata.json
│       └── zumen_04b-ground-truth.txt
├── results/                  # Generated HTML/JSON reports
├── drizzle/                  # Database migrations
├── docker-compose.yml        # PostgreSQL + PgAdmin
└── package.json
```

## Character-Level Accuracy Metrics

Each test evaluates OCR quality using industry-standard metrics:

### Primary Metrics

- **Character Error Rate (CER)** = edit_distance / total_characters
  - Industry standard for OCR accuracy
  - Lower is better (0.0 = perfect)
  - Formula: (insertions + deletions + substitutions) / total_characters

- **Character Accuracy** = position-based match percentage
  - Percentage of characters correctly recognized at correct positions
  - Higher is better (0-100%)

- **Character Set Coverage** = unique_chars_found / unique_chars_in_ground_truth
  - Percentage of unique characters detected
  - Higher is better (0-100%)
  - Useful for detecting missing character types

### Additional Metrics

- **Exact Character Count Match** = does extracted count equal ground truth count?
- **Edit Distance** = Levenshtein distance between extracted and ground truth
- **Processing Time** = milliseconds per drawing
- **API Cost** = estimated cost per drawing (¥)

### Understanding CER

| CER         | Quality   | Interpretation                    |
| ----------- | --------- | --------------------------------- |
| 0.00 - 0.05 | Excellent | 95%+ accuracy, production ready   |
| 0.05 - 0.10 | Good      | 90-95% accuracy, minor errors     |
| 0.10 - 0.20 | Fair      | 80-90% accuracy, needs review     |
| 0.20+       | Poor      | <80% accuracy, significant issues |

## How to Add New Test Drawings

Step-by-step guide for adding test drawings to evaluate OCR accuracy.

### Subdirectory Organization (Recommended)

**Step 1: Create directory structure**

```bash
cd test-drawings
mkdir -p sample02
cd sample02
```

**Step 2: Add your drawing image**

```bash
# Copy your drawing file (PNG, JPG, or PDF)
cp /path/to/your-drawing.png ./floor-plan-001.png
```

**Step 3: Create metadata JSON file**

Create `floor-plan-001-metadata.json`:

```json
{
  "id": "floor-plan-001",
  "type": "floor-plan",
  "quality": "high",
  "source": "architectural-drawing",
  "description": "Japanese residential floor plan with dimensions and room labels",
  "groundTruth": {
    "fullTextFile": "./floor-plan-001-ground-truth.txt"
  }
}
```

**Metadata field options:**

- **type**: `"floor-plan"` | `"site-layout"` | `"elevation"` | `"section"` | `"detail"` | `"unknown"`
- **quality**: `"high"` | `"medium"` | `"low"`
- **source**: `"architectural-drawing"` | `"cad-generated"` | `"scanned"` | `"synthetic"` | `"manual"`

**Step 4: Create ground truth text file**

Create `floor-plan-001-ground-truth.txt`:

```
10,920
1,820
910
浴室
洗面室
物入
押入
床の間
トイレ
キッチン
13.24㎡
リビング
33.95㎡
玄関
和室
1255×960 (防)
640×770 (防)
Date
Designed by
```

**Important ground truth guidelines:**

- Transcribe exactly as it appears on the drawing
- Use actual line breaks (press Enter) - not `\n`
- Include all text: numbers, dimensions, Japanese, symbols
- Maintain reading order (top-to-bottom, left-to-right)
- Save with UTF-8 encoding
- Don't skip small text elements
- Don't normalize or clean the text
- Don't add text that's not in the drawing

**Step 5: Verify file structure**

```bash
test-drawings/sample02/
├── floor-plan-001.png
├── floor-plan-001-metadata.json
└── floor-plan-001-ground-truth.txt
```

**Step 6: Run tests**

```bash
# From project root
npm run test:all

# Or test specific processor
npm run test:cloud-vision
npm run test:gemini
```

**Step 7: View results**

- Frontend UI: http://localhost:5173/
- HTML report: `results/test-run-{uuid}.html`
- Database: Check test_runs table

### File Naming Convention

**Required pattern:**

```
{base-name}.{extension}               # The drawing image
{base-name}-metadata.json             # Metadata
{base-name}-ground-truth.txt          # Ground truth text
```

**Examples:**

```bash
# Example 1: PNG in subdirectory
test-drawings/sample01/
├── zumen_04b.png
├── zumen_04b-metadata.json
└── zumen_04b-ground-truth.txt

# Example 2: PDF in root
test-drawings/
├── architectural-plan.pdf
├── architectural-plan-metadata.json
└── architectural-plan-ground-truth.txt
```

**Automatic discovery:**

- Test runner scans `test-drawings/` directory recursively
- Finds all images with matching metadata files
- Loads ground truth from external `.txt` files

## Development

```bash
# Watch mode for development
npm run dev

# Generate database types after schema changes
npm run db:generate
npm run db:migrate

# Explore database
npm run db:studio
# Opens at https://local.drizzle.studio/

# Run frontend development server
cd frontend
npm run dev
```
