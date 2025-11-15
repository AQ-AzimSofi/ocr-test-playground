#!/bin/bash

# OCR Test Playground - Stop Script
# Stops all services

set -e

echo "========================================="
echo "OCR Test Playground - Stopping Services"
echo "========================================="
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "Warning: Docker is not running - services may already be stopped"
    exit 0
fi

echo "Stopping all services..."
echo ""

# Stop all services
docker compose -f docker-compose.production.yml down

echo ""
echo "All services stopped"
echo ""
echo "Data is preserved in Docker volumes."
echo "To completely remove all data, run:"
echo "  docker compose -f docker-compose.production.yml down -v"
echo ""
echo "To start services again, run: ./start.sh"
echo ""
