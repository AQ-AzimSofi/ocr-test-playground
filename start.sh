#!/bin/bash

# OCR Test Playground - Start Script
# Starts all services in production mode

set -e

echo "========================================="
echo "OCR Test Playground - Starting Services"
echo "========================================="
echo ""

# Check if .env.production exists
if [ ! -f .env.production ]; then
    echo "❌ Error: .env.production not found"
    echo "Please run ./setup.sh first to set up the application"
    exit 1
fi

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Error: Docker is not running"
    echo "Please start Docker Desktop and try again"
    exit 1
fi

echo "🚀 Starting all services..."
echo ""

# Start all services
docker compose -f docker-compose.production.yml up -d

echo ""
echo "⏳ Waiting for services to be ready..."
sleep 10

# Check service health
echo ""
echo "📊 Service Status:"
echo ""
docker compose -f docker-compose.production.yml ps

echo ""
echo "✅ All services started!"
echo ""
echo "========================================="
echo "Application URLs:"
echo "========================================="
echo ""
echo "🌐 Frontend:  http://localhost"
echo "🔌 Backend API: http://localhost:3001"
echo "🗄️  Database:  localhost:5434"
echo ""
echo "========================================="
echo ""
echo "📝 Useful Commands:"
echo ""
echo "  View logs (all):     docker compose -f docker-compose.production.yml logs -f"
echo "  View logs (backend): docker compose -f docker-compose.production.yml logs -f backend"
echo "  View logs (frontend): docker compose -f docker-compose.production.yml logs -f frontend"
echo "  Stop services:       ./stop.sh"
echo "  Restart services:    docker compose -f docker-compose.production.yml restart"
echo ""
echo "========================================="
echo ""
echo "To run OCR tests, use the web interface at http://localhost"
echo "or run tests manually:"
echo "  docker compose -f docker-compose.production.yml exec backend npm run test:azure-read"
echo ""
