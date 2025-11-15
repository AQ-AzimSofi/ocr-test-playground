#!/bin/bash

# OCR Test Playground - Setup Script
# This script helps you set up the application for the first time

set -e  # Exit on error

echo "========================================="
echo "OCR Test Playground - Setup"
echo "========================================="
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "\033[0;31m[ERROR]\033[0m Docker is not installed"
    echo "Please install Docker Desktop from: https://www.docker.com/products/docker-desktop"
    exit 1
fi

# Check if Docker Compose is available
if ! docker compose version &> /dev/null; then
    echo -e "\033[0;31m[ERROR]\033[0m Docker Compose is not available"
    echo "Please install Docker Compose or update Docker Desktop"
    exit 1
fi

echo -e "\033[0;32m[OK]\033[0m Docker is installed and running"
echo ""

# Check if .env.production exists
if [ ! -f .env.production ]; then
    echo -e "\033[0;34m[CREATE]\033[0m Creating .env.production from template..."
    cp .env.production.example .env.production
    echo -e "\033[0;32m[OK]\033[0m Created .env.production"
    echo ""
    echo -e "\033[0;33m[WARN]\033[0m IMPORTANT: You need to edit .env.production and add your API keys!"
    echo ""
    echo "Required API keys:"
    echo "  1. GOOGLE_GEMINI_API_KEY - Get from: https://aistudio.google.com/app/api-keys"
    echo "  2. GOOGLE_APPLICATION_CREDENTIALS - Path to Google Cloud service account JSON"
    echo "  3. AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT - Azure endpoint URL"
    echo "  4. AZURE_DOCUMENT_INTELLIGENCE_KEY - Azure API key"
    echo ""
    echo "Optional API keys (for additional processors):"
    echo "  - GOOGLE_DOCUMENT_AI_PROCESSOR_ID - For Document AI processor"
    echo "  - AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY - For AWS Textract"
    echo ""

    read -p "Press Enter to open .env.production in your default editor, or Ctrl+C to edit manually later..."

    # Try to open the file in the default editor
    if [[ "$OSTYPE" == "darwin"* ]]; then
        open -e .env.production 2>/dev/null || nano .env.production
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        xdg-open .env.production 2>/dev/null || nano .env.production
    else
        notepad .env.production 2>/dev/null || nano .env.production
    fi

    echo ""
    read -p "Have you updated .env.production with your API keys? (y/n) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "\033[0;33m[WARN]\033[0m Please edit .env.production and add your API keys before proceeding"
        echo "Then run this script again or use ./start.sh to start the application"
        exit 0
    fi
else
    echo -e "\033[0;32m[OK]\033[0m .env.production already exists"
fi

echo ""
echo -e "\033[0;36m[BUILD]\033[0m Building Docker images..."
echo "This may take a few minutes on first run..."
echo ""

docker compose -f docker-compose.production.yml build

echo ""
echo -e "\033[0;32m[OK]\033[0m Docker images built successfully"
echo ""

# Check if test-drawings directory exists and has files
if [ ! -d "test-drawings" ] || [ -z "$(ls -A test-drawings)" ]; then
    echo -e "\033[0;33m[WARN]\033[0m test-drawings directory is empty"
    echo "You can add test drawings to the test-drawings/ directory"
    echo "Example structure:"
    echo "  test-drawings/"
    echo "    ├── drawing1/"
    echo "    │   ├── drawing1.png"
    echo "    │   └── drawing1.txt (ground truth - optional)"
    echo "    └── drawing2/"
    echo "        ├── drawing2.pdf"
    echo "        └── drawing2-metadata.json (optional)"
    echo ""
fi

echo -e "\033[0;36m[START]\033[0m Starting database..."
docker compose -f docker-compose.production.yml up -d postgres

echo "Waiting for database to be ready..."
sleep 5

echo ""
echo -e "\033[0;34m[STATUS]\033[0m Running database migrations..."
docker compose -f docker-compose.production.yml run --rm backend npx drizzle-kit migrate

echo ""
echo -e "\033[0;32m[OK]\033[0m Setup complete!"
echo ""
echo "========================================="
echo "Next Steps:"
echo "========================================="
echo ""
echo "1. Start the application:"
echo "   ./start.sh"
echo ""
echo "2. Access the application:"
echo "   http://localhost"
echo ""
echo "3. Access the API:"
echo "   http://localhost:3001"
echo ""
echo "4. (Optional) Access PgAdmin for database management:"
echo "   docker compose -f docker-compose.production.yml --profile tools up -d pgadmin"
echo "   http://localhost:5051"
echo "   Email: admin@ocr-test.local"
echo "   Password: admin"
echo ""
echo "========================================="
echo ""
echo "To stop the application, run: ./stop.sh"
echo ""
