# Deployment Guide - OCR Test Playground

This guide will help you deploy and run the OCR Test Playground application using Docker.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Detailed Setup](#detailed-setup)
- [Configuration](#configuration)
- [Running Tests](#running-tests)
- [Troubleshooting](#troubleshooting)
- [Advanced Usage](#advanced-usage)

---

## Prerequisites

### Required Software

1. **Docker Desktop** (Required)
   - Download from: https://www.docker.com/products/docker-desktop
   - Minimum version: Docker 20.10+, Docker Compose V2
   - Verify installation:
     ```bash
     docker --version
     docker compose version
     ```

2. **API Keys** (Required for OCR processors)
   You'll need at least one of the following:

   - **Google Gemini API** (Recommended for AI-enhanced processing)
     - Get from: https://makersuite.google.com/app/apikey
     - Free tier available

   - **Azure Document Intelligence** (Recommended for pure OCR)
     - Get from: https://portal.azure.com/
     - Create a "Document Intelligence" or "Form Recognizer" resource
     - Copy endpoint URL and key

   - **Google Cloud Vision API** (Optional)
     - Set up at: https://console.cloud.google.com/apis/credentials
     - Create service account and download JSON key

   - **Google Document AI** (Optional)
     - Create processor at: https://console.cloud.google.com/ai/document-ai

---

## Quick Start

### 1. Initial Setup (One-Time)

```bash
# Run the setup script
./setup.sh
```

The setup script will:
- Check if Docker is installed
- Create `.env.production` from template
- Prompt you to add your API keys
- Build Docker images
- Set up the database

### 2. Add Your API Keys

Edit `.env.production` and add your API keys:

```bash
# Example for Gemini + Azure setup (most common)
GOOGLE_GEMINI_API_KEY=AIzaSy...your-key-here
AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT=https://your-resource.cognitiveservices.azure.com/
AZURE_DOCUMENT_INTELLIGENCE_KEY=your-azure-key-here
```

### 3. Start the Application

```bash
./start.sh
```

### 4. Access the Application

Open your web browser and go to:
- **Frontend UI**: http://localhost
- **Backend API**: http://localhost:3001

### 5. Stop the Application

```bash
./stop.sh
```

---

## Detailed Setup

### Step 1: Clone or Extract the Project

```bash
# If you received this as a ZIP file, extract it first
unzip ocr-test-playground.zip
cd ocr-test-playground

# Or if cloning from git
git clone <repository-url>
cd ocr-test-playground
```

### Step 2: Obtain API Keys

#### Google Gemini API (AI-Enhanced Processing)

1. Go to https://makersuite.google.com/app/apikey
2. Click "Create API Key"
3. Copy the key (starts with `AIzaSy...`)
4. Save it for Step 3

#### Azure Document Intelligence (Pure OCR)

1. Go to https://portal.azure.com/
2. Create a new resource → Search for "Document Intelligence"
3. Create the resource
4. Go to "Keys and Endpoint"
5. Copy:
   - `KEY 1` → This is your `AZURE_DOCUMENT_INTELLIGENCE_KEY`
   - `Endpoint` → This is your `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT`

#### Google Cloud Vision API (Optional)

1. Go to https://console.cloud.google.com/
2. Create a new project or select existing
3. Enable "Cloud Vision API"
4. Go to "Credentials" → "Create Credentials" → "Service Account"
5. Create service account and download JSON key file
6. Save the JSON file to a safe location (e.g., `~/google-cloud-keys/service-account.json`)
7. Note the full path for Step 3

### Step 3: Configure Environment Variables

Run the setup script:
```bash
./setup.sh
```

Or manually:

```bash
# Copy the example file
cp .env.production.example .env.production

# Edit with your API keys
nano .env.production  # or use your preferred editor
```

**Minimum Configuration** (Choose at least one):

**Option A: Gemini + Azure (Recommended)**
```env
GOOGLE_GEMINI_API_KEY=AIzaSy_your_key_here
AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT=https://your-resource.cognitiveservices.azure.com/
AZURE_DOCUMENT_INTELLIGENCE_KEY=your_azure_key_here
```

**Option B: Pure OCR Only (For Confidential Data)**
```env
AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT=https://your-resource.cognitiveservices.azure.com/
AZURE_DOCUMENT_INTELLIGENCE_KEY=your_azure_key_here
GOOGLE_APPLICATION_CREDENTIALS=/path/to/google-cloud-service-account.json
```

**Full Configuration** (All Processors):
```env
# Google Gemini
GOOGLE_GEMINI_API_KEY=AIzaSy_your_key_here

# Azure
AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT=https://your-resource.cognitiveservices.azure.com/
AZURE_DOCUMENT_INTELLIGENCE_KEY=your_azure_key_here

# Google Cloud Vision
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
GOOGLE_CLOUD_PROJECT_ID=your-project-id

# Google Document AI (optional)
GOOGLE_DOCUMENT_AI_PROCESSOR_ID=your-processor-id
GOOGLE_DOCUMENT_AI_PROCESSOR_LOCATION=us

# AWS Textract (optional)
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_TEXTRACT_REGION=ap-northeast-1
```

### Step 4: Add Test Drawings (Optional)

If you want to test with your own floor plans or documents:

```bash
# Create a new drawing folder
mkdir -p test-drawings/my-floor-plan

# Add your image or PDF
cp /path/to/your/floorplan.png test-drawings/my-floor-plan/

# (Optional) Add ground truth text for accuracy testing
echo "Expected text from the drawing" > test-drawings/my-floor-plan/my-floor-plan.txt
```

**For Confidential Files**:
```bash
# Put confidential files in a 'confidential' subdirectory
mkdir -p test-drawings/confidential/sensitive-drawing
cp /path/to/sensitive.pdf test-drawings/confidential/sensitive-drawing/
```

Files in `test-drawings/confidential/` will automatically be protected from Gemini AI processors.

### Step 5: Build and Start

```bash
# Run setup (includes building Docker images)
./setup.sh

# Start all services
./start.sh
```

**First-time build** may take 5-10 minutes depending on your internet speed.

---

## Configuration

### Environment Variables Reference

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `GOOGLE_GEMINI_API_KEY` | Conditional* | Gemini AI API key | `AIzaSy...` |
| `AZURE_DOCUMENT_INTELLIGENCE_KEY` | Conditional* | Azure API key | `abc123...` |
| `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT` | Conditional* | Azure endpoint URL | `https://...cognitiveservices.azure.com/` |
| `GOOGLE_APPLICATION_CREDENTIALS` | Optional | Path to Google Cloud JSON key | `/path/to/key.json` |
| `GOOGLE_CLOUD_PROJECT_ID` | Optional | Google Cloud Project ID | `my-project-123` |
| `GOOGLE_DOCUMENT_AI_PROCESSOR_ID` | Optional | Document AI processor ID | `abc123def456` |
| `DATABASE_URL` | Auto-set | PostgreSQL connection (set by Docker) | Auto-configured |
| `NODE_ENV` | Auto-set | Environment mode | `production` |

\* At least one OCR/AI API key is required

### Port Configuration

Default ports used by the application:

| Service | Port | Access |
|---------|------|--------|
| Frontend | 80 | http://localhost |
| Backend API | 3001 | http://localhost:3001 |
| PostgreSQL | 5434 | `localhost:5434` |
| PgAdmin | 5051 | http://localhost:5051 (optional) |

To change ports, edit `docker-compose.production.yml`.

---

## Running Tests

### Method 1: Using the Web Interface (Easiest)

1. Open http://localhost in your browser
2. Click "Run New Test"
3. Select processors
4. Select drawings
5. Click "Run Test"
6. **Note**: You'll need to manually run the test via CLI for now (see Method 2)

### Method 2: Using Command Line (Current Method)

**Run all processors on all drawings**:
```bash
docker compose -f docker-compose.production.yml exec backend npm run test:all
```

**Run specific processor**:
```bash
# Azure Read (pure OCR)
docker compose -f docker-compose.production.yml exec backend npm run test:azure-read

# Gemini (AI-enhanced)
docker compose -f docker-compose.production.yml exec backend npm run test:gemini

# Hybrid CV + AI (wall detection)
docker compose -f docker-compose.production.yml exec backend npm run test:hybrid-cv-ai
```

**Run on confidential files only** (Pure OCR, no AI):
```bash
docker compose -f docker-compose.production.yml exec backend npm run test:confidential
```

**Run on specific drawing**:
```bash
docker compose -f docker-compose.production.yml exec backend npm run test -- --drawing my-drawing-name
```

### Viewing Results

After running tests:
1. Open http://localhost
2. You'll see the test run in the list
3. Click on it to view detailed results
4. See extracted text, bounding boxes, and accuracy metrics

---

## Troubleshooting

### Docker Issues

**Problem**: `docker: command not found`
- **Solution**: Install Docker Desktop from https://www.docker.com/products/docker-desktop

**Problem**: `Cannot connect to the Docker daemon`
- **Solution**: Start Docker Desktop application

**Problem**: `docker compose: command not found`
- **Solution**: Update Docker Desktop to get Docker Compose V2

### Build Issues

**Problem**: Build fails with network errors
- **Solution**: Check your internet connection and try again:
  ```bash
  ./stop.sh
  docker compose -f docker-compose.production.yml build --no-cache
  ./start.sh
  ```

**Problem**: Out of disk space
- **Solution**: Clean up Docker:
  ```bash
  docker system prune -a
  ```

### API Key Issues

**Problem**: "API key not valid" errors
- **Solution**:
  1. Check `.env.production` has the correct keys
  2. Verify keys are active in their respective consoles
  3. Restart the application: `./stop.sh && ./start.sh`

**Problem**: Google Cloud credentials error
- **Solution**:
  1. Ensure JSON key file path is absolute (not relative)
  2. Make sure the file is readable
  3. Mount the file in `docker-compose.production.yml` volumes if needed

### Application Issues

**Problem**: Frontend shows blank page
- **Solution**:
  1. Check backend is running: `docker compose -f docker-compose.production.yml ps`
  2. View logs: `docker compose -f docker-compose.production.yml logs frontend`
  3. Try rebuilding: `docker compose -f docker-compose.production.yml build frontend`

**Problem**: "Failed to fetch test runs" error
- **Solution**:
  1. Check backend logs: `docker compose -f docker-compose.production.yml logs backend`
  2. Verify database is running: `docker compose -f docker-compose.production.yml ps postgres`
  3. Run migrations: `docker compose -f docker-compose.production.yml run --rm backend npx drizzle-kit migrate`

**Problem**: Tests fail with confidential file errors
- **Solution**:
  1. Make sure confidential files are in `test-drawings/confidential/` directory
  2. Use `npm run test:confidential` for confidential files
  3. Don't try to run Gemini processors on confidential data

---

## Advanced Usage

### Accessing the Database

**Using PgAdmin** (Web UI):
```bash
# Start PgAdmin
docker compose -f docker-compose.production.yml --profile tools up -d pgadmin

# Access at http://localhost:5051
# Email: admin@ocr-test.local
# Password: admin
```

**Using psql** (Command Line):
```bash
docker compose -f docker-compose.production.yml exec postgres psql -U ocr_user -d ocr_test_db
```

### Viewing Logs

```bash
# All services
docker compose -f docker-compose.production.yml logs -f

# Specific service
docker compose -f docker-compose.production.yml logs -f backend
docker compose -f docker-compose.production.yml logs -f frontend
docker compose -f docker-compose.production.yml logs -f postgres
```

### Backup and Restore

**Backup Database**:
```bash
docker compose -f docker-compose.production.yml exec postgres pg_dump -U ocr_user ocr_test_db > backup.sql
```

**Restore Database**:
```bash
docker compose -f docker-compose.production.yml exec -T postgres psql -U ocr_user ocr_test_db < backup.sql
```

### Resetting Everything

**Reset database only** (keeps images):
```bash
docker compose -f docker-compose.production.yml down
docker volume rm ocr-test-playground_postgres_data
./start.sh
```

**Complete reset** (removes all data):
```bash
docker compose -f docker-compose.production.yml down -v
./setup.sh
```

### Updating the Application

```bash
# Stop services
./stop.sh

# Pull latest code (if using git)
git pull

# Rebuild
docker compose -f docker-compose.production.yml build

# Start
./start.sh
```

---

## Performance Tips

1. **Allocate More Resources to Docker**
   - Open Docker Desktop → Settings → Resources
   - Increase CPU cores and memory for faster processing

2. **Use Appropriate Processors**
   - For speed: Azure Read, Azure Layout
   - For accuracy: Gemini, Hybrid CV+AI
   - For cost: Azure Read

3. **Batch Processing**
   - Process multiple drawings in one test run for efficiency
   - Use the web interface to select multiple drawings

---

## Security Notes

### Confidential Data Protection

1. Files in `test-drawings/confidential/` are automatically protected
2. Gemini processors cannot run on confidential files (enforced by the system)
3. Only pure OCR APIs (Azure, Google Cloud Vision, Document AI) can process confidential data

### API Key Security

1. Never commit `.env.production` to version control
2. Keep your API keys secret
3. Use environment-specific keys (don't use production keys for testing)
4. Rotate keys periodically

---

## Getting Help

If you encounter issues not covered in this guide:

1. Check the logs for error messages
2. Verify your API keys and configuration
3. Try the troubleshooting steps above
4. Contact the development team with:
   - Error messages from logs
   - Steps to reproduce
   - Your environment (OS, Docker version)

---

**Last Updated**: 2025
**Version**: 1.0.0
