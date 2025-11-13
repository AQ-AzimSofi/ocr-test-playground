# User Guide - OCR Test Playground

A step-by-step guide for using the OCR Test Playground to test and compare OCR processors.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Running Your First Test](#running-your-first-test)
3. [Viewing Results](#viewing-results)
4. [Adding Your Own Drawings](#adding-your-own-drawings)
5. [Working with Confidential Files](#working-with-confidential-files)
6. [Understanding the Results](#understanding-the-results)
7. [Tips & Best Practices](#tips--best-practices)

---

## Getting Started

### Initial Setup

1. **Make sure Docker Desktop is installed and running**
   - You should see the Docker icon in your system tray
   - If not installed, download from: https://www.docker.com/products/docker-desktop

2. **Navigate to the project folder**
   ```bash
   cd ocr-test-playground
   ```

3. **Run the setup script**
   ```bash
   ./setup.sh
   ```

   The setup script will:
   - Check that Docker is installed
   - Create a configuration file
   - Ask you to add your API keys
   - Build the application
   - Set up the database

4. **Add your API keys**

   When prompted, edit the `.env.production` file and add at least one set of API keys:

   **Option A: Using Gemini (Easiest to get started)**
   - Go to https://makersuite.google.com/app/apikey
   - Click "Create API Key"
   - Copy the key and paste it in `.env.production`:
     ```
     GOOGLE_GEMINI_API_KEY=AIzaSy...your-key-here
     ```

   **Option B: Using Azure (Recommended for production)**
   - Go to https://portal.azure.com/
   - Create "Document Intelligence" resource
   - Copy endpoint and key to `.env.production`:
     ```
     AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT=https://...
     AZURE_DOCUMENT_INTELLIGENCE_KEY=your-key-here
     ```

5. **Start the application**
   ```bash
   ./start.sh
   ```

6. **Open your browser**
   - Go to: http://localhost
   - You should see the OCR Test Playground home page

---

## Running Your First Test

### Using the Web Interface

1. **Open the application**
   - Navigate to http://localhost in your web browser

2. **Click "Run New Test"** button (blue button in the top right)

3. **Select processors to test**

   You'll see two categories:

   **Pure OCR (Confidential-Safe)** - Green section:
   - Cloud Vision
   - Azure Read
   - Azure Layout
   - Document AI

   **AI-Enhanced (Not for Confidential Data)** - Gray section:
   - Gemini Geometric
   - Hybrid CV + AI Detector
   - Various hybrid approaches

   For your first test, select one or two processors. For example:
   - ✅ Azure Read (fast and reliable)
   - ✅ Gemini Geometric (AI-powered)

4. **Select drawings to test**

   Under "Select Files", you'll see a list of available test drawings.

   Check the boxes next to the drawings you want to test.

   For your first test, select 1-2 drawings to keep it quick.

5. **Review the summary**

   At the bottom, you'll see:
   - Number of processors selected
   - Number of drawings selected
   - Estimated cost

   Example: "2 processors selected, 2 drawings selected, Estimated cost: ¥0.50"

6. **Click "Run Test"**

7. **Run the test manually (Current Limitation)**

   You'll see a message: "Test run created successfully. Note: Automatic execution is not yet implemented..."

   Open a terminal and run:
   ```bash
   docker compose -f docker-compose.production.yml exec backend npm run test:azure-read
   ```

   Or for all processors:
   ```bash
   docker compose -f docker-compose.production.yml exec backend npm run test:all
   ```

8. **Wait for completion**

   You'll see progress in the terminal. Processing takes:
   - Small image (~1 page): 2-5 seconds per processor
   - Large PDF (~10 pages): 10-30 seconds per processor

9. **View results**

   Once complete, refresh your browser and click on the test run to see results!

---

## Viewing Results

### Test Runs List (Home Page)

When you open http://localhost, you'll see:

- **List of all test runs** (newest first)
- Each card shows:
  - Test run name and date
  - Processors used
  - Number of drawings tested
  - Completion status
  - 🔒 Confidential badge (if confidential files were used)

### Click on a Test Run

Clicking a test run opens the detailed results view:

**Top Section - Test Run Info**:
- Test name
- Description
- Processors tested
- Drawings included

**Main Section - Results**:
For each drawing, you'll see:
1. **Drawing preview** (left side)
2. **Processor comparison** (tabs or side-by-side)
3. **Extracted text** (right side)
4. **Bounding boxes** overlaid on the image
5. **Accuracy metrics** (if ground truth available)

### Understanding the Visualization

- **Green boxes**: Detected text regions
- **Click on text**: Highlights corresponding bounding box
- **Zoom**: Scroll to zoom in/out
- **Pan**: Click and drag to move around

### Accuracy Metrics (If Ground Truth Exists)

If you provided ground truth text, you'll see:

- **Character Accuracy**: % of characters correctly detected (higher is better)
- **Character Error Rate (CER)**: % of character errors (lower is better)
- **Missing Characters**: Characters in ground truth but not detected
- **Extra Characters**: Characters detected but not in ground truth
- **Edit Distance**: Number of edits needed to match ground truth

---

## Adding Your Own Drawings

### Step 1: Prepare Your Files

Supported formats:
- PNG images
- JPG/JPEG images
- PDF files (will be converted to images)

### Step 2: Create a Drawing Folder

```bash
cd test-drawings
mkdir my-floor-plan
```

### Step 3: Add Your Image

```bash
cp /path/to/your/floorplan.png test-drawings/my-floor-plan/
```

### Step 4: (Optional) Add Ground Truth

If you want to measure accuracy, create a text file with the expected text:

```bash
echo "All the text that should be detected from the drawing" > test-drawings/my-floor-plan/my-floor-plan.txt
```

Or for detailed metadata:

```bash
cat > test-drawings/my-floor-plan/my-floor-plan-metadata.json << 'EOF'
{
  "groundTruth": {
    "fullText": "Expected text here"
  }
}
EOF
```

### Step 5: Restart the Application

```bash
./stop.sh
./start.sh
```

Your new drawing will now appear in the list!

---

## Working with Confidential Files

### What are Confidential Files?

Files that contain sensitive or private information that should NOT be sent to AI models like Gemini.

### How to Mark Files as Confidential

Simply place them in a `confidential` subdirectory:

```bash
mkdir -p test-drawings/confidential/sensitive-plan
cp /path/to/sensitive.pdf test-drawings/confidential/sensitive-plan/
```

### What Happens to Confidential Files?

1. **Automatic Protection**: Files in `/confidential/` are flagged
2. **AI Processors Blocked**: Gemini and AI-enhanced processors cannot access them
3. **UI Warning**: You'll see a red warning banner if you select confidential files
4. **Pure OCR Only**: Only Azure, Cloud Vision, and Document AI can process them

### Testing Confidential Files

When you select confidential files in the web interface:
- ❌ Gemini processors are automatically disabled
- ✅ Only pure OCR processors remain available
- ⚠️ You'll see a red warning banner

Or use the command line:
```bash
docker compose -f docker-compose.production.yml exec backend npm run test:confidential
```

This automatically:
- Runs only pure OCR processors
- Processes only confidential files
- Skips all AI-enhanced processors

---

## Understanding the Results

### Character-Level Metrics

**Character Accuracy** (95.5%)
- What it means: 95.5% of characters were correctly detected
- Good: > 95%
- Acceptable: 90-95%
- Needs improvement: < 90%

**Character Error Rate / CER** (4.5%)
- What it means: 4.5% of characters have errors
- Good: < 5%
- Acceptable: 5-10%
- Needs improvement: > 10%

### Common Error Types

**Missing Characters**:
- Characters in ground truth but not detected
- Common causes: Faded text, complex fonts, small size

**Extra Characters**:
- Characters detected but not in ground truth
- Common causes: Image noise, watermarks, artifacts

**Substitutions**:
- Wrong character detected (e.g., "0" instead of "O")
- Common causes: Similar-looking characters, poor image quality

### Comparing Processors

Look at:
1. **Accuracy**: Which has highest character accuracy?
2. **Speed**: How long did each take?
3. **Cost**: What's the cost per page?
4. **Reliability**: Did it handle all files without errors?

---

## Tips & Best Practices

### Getting Better Results

1. **Use High-Quality Images**
   - 300 DPI or higher
   - Clear, high-contrast text
   - Minimal noise or artifacts

2. **Provide Clean Ground Truth**
   - Include ALL text from the drawing
   - Maintain exact spacing and formatting
   - Double-check for typos

3. **Choose the Right Processor**
   - Simple documents → Azure Read (fast, cheap)
   - Complex layouts → Azure Layout (structure-aware)
   - Floor plans → Hybrid CV+AI (specialized)
   - General purpose → Gemini or Cloud Vision

4. **Test Multiple Processors**
   - Different processors excel at different things
   - Compare at least 2-3 to find the best

### Working Efficiently

1. **Start Small**
   - Test with 1-2 drawings first
   - Expand to full dataset once confident

2. **Batch Similar Files**
   - Group similar drawings together
   - Run them in one test for easier comparison

3. **Use Meaningful Names**
   - Name drawings descriptively
   - Add metadata for context

4. **Track Your Tests**
   - Use the web interface to review past tests
   - Delete old/failed tests to keep it clean

### Cost Management

1. **Understand Pricing**
   - Azure Read: ~¥0.23/page (cheap)
   - Cloud Vision: ~¥0.15/page (very cheap)
   - Azure Layout: ~¥1.50/page (expensive)
   - Gemini: ~¥0.08/1K characters (very cheap for small text)

2. **Start with Cheap Processors**
   - Use Azure Read or Cloud Vision first
   - Only use expensive processors if needed

3. **Avoid Redundant Tests**
   - Review existing results before re-running
   - Delete and re-run if settings changed

### Troubleshooting Common Issues

**Problem**: No drawings appear in the list
- **Solution**: Make sure your drawing folders are in `test-drawings/` and restart

**Problem**: Test fails with "API key not valid"
- **Solution**: Check `.env.production` has correct keys, then restart

**Problem**: Accuracy is very low
- **Solution**: Check if ground truth text matches exactly what's in the image

**Problem**: Confidential warning won't go away
- **Solution**: Deselect files in `/confidential/` directory or use pure OCR only

---

## Common Workflows

### Workflow 1: Quick Comparison

Goal: Compare 2-3 processors on a single drawing

1. Click "Run New Test"
2. Select 2-3 processors (e.g., Azure Read, Gemini, Cloud Vision)
3. Select 1 drawing
4. Run test
5. Compare results side-by-side

Time: ~5 minutes

### Workflow 2: Accuracy Benchmark

Goal: Measure accuracy across multiple drawings with ground truth

1. Prepare drawings with `.txt` ground truth files
2. Click "Run New Test"
3. Select your best processors
4. Select all drawings
5. Run test
6. Review accuracy metrics

Time: ~30 minutes (for 10 drawings)

### Workflow 3: Confidential Document Processing

Goal: Process sensitive documents safely

1. Place files in `test-drawings/confidential/`
2. Use CLI: `npm run test:confidential`
3. Or web UI: Select confidential files, notice only pure OCR available
4. Review results

Time: ~10 minutes

---

## Getting Help

### Documentation

- **README.md**: Project overview and quick start
- **DEPLOYMENT.md**: Detailed deployment guide
- **USER_GUIDE.md**: This guide

### Troubleshooting

See [DEPLOYMENT.md - Troubleshooting](DEPLOYMENT.md#troubleshooting) for common issues and solutions.

### Viewing Logs

If something goes wrong, check the logs:

```bash
# All services
docker compose -f docker-compose.production.yml logs -f

# Just backend
docker compose -f docker-compose.production.yml logs -f backend
```

---

## Appendix: Command Reference

### Starting & Stopping

```bash
./setup.sh          # Initial setup (one-time)
./start.sh          # Start the application
./stop.sh           # Stop the application
```

### Running Tests (CLI)

```bash
# Common commands (run inside project directory)

# All processors
docker compose -f docker-compose.production.yml exec backend npm run test:all

# Specific processors
docker compose -f docker-compose.production.yml exec backend npm run test:azure-read
docker compose -f docker-compose.production.yml exec backend npm run test:gemini
docker compose -f docker-compose.production.yml exec backend npm run test:hybrid-cv-ai

# Confidential files only
docker compose -f docker-compose.production.yml exec backend npm run test:confidential

# Specific drawing
docker compose -f docker-compose.production.yml exec backend npm run test -- --drawing my-drawing
```

### Viewing Logs

```bash
# All logs
docker compose -f docker-compose.production.yml logs -f

# Specific service
docker compose -f docker-compose.production.yml logs -f backend
docker compose -f docker-compose.production.yml logs -f frontend
docker compose -f docker-compose.production.yml logs -f postgres
```

### Database Access

```bash
# Using psql
docker compose -f docker-compose.production.yml exec postgres psql -U ocr_user -d ocr_test_db

# Start PgAdmin (web UI)
docker compose -f docker-compose.production.yml --profile tools up -d pgadmin
# Then open: http://localhost:5051
```

---

**Last Updated**: 2025
**Version**: 1.0.0
