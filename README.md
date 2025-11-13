# OCR Test Playground

A comprehensive testing platform for evaluating OCR (Optical Character Recognition) and AI-powered text extraction from construction layout drawings and floor plans.

## Overview

This application helps you compare different OCR processors to find the best solution for extracting text from architectural drawings, floor plans, and construction documents. It supports both pure OCR APIs and AI-enhanced hybrid approaches, with built-in protection for confidential data.

### Key Features

- **Multiple OCR Processors**: Test with Google Cloud Vision, Azure Document Intelligence, Google Gemini, Document AI, and hybrid CV+AI approaches
- **Confidential Data Protection**: Automatic filtering prevents AI processors from accessing sensitive files
- **Accuracy Metrics**: Character-level accuracy, error rates, and detailed comparison reports
- **Web Interface**: User-friendly UI for running tests and viewing results
- **Bounding Box Visualization**: See exactly where text was detected on your drawings
- **Docker Deployment**: One-command setup and deployment
- **Ground Truth Comparison**: Upload reference text to measure accuracy

### Supported Processors

**Pure OCR (Safe for Confidential Data)**:
- Google Cloud Vision API
- Azure Read API (Document Intelligence)
- Azure Layout API (Document Intelligence)
- Google Document AI

**AI-Enhanced (Not for Confidential Data)**:
- Google Gemini 2.5 Flash
- Hybrid approaches (OCR + Gemini validation)
- CV + AI wall detector for floor plans

---

## Quick Start

### Prerequisites

- Docker Desktop ([Download](https://www.docker.com/products/docker-desktop))
- API keys (at least one):
  - [Google Gemini](https://makersuite.google.com/app/apikey) (Free tier available)
  - [Azure Document Intelligence](https://portal.azure.com/) (Pay-as-you-go)

### Installation

```bash
# 1. Run setup
./setup.sh

# 2. Edit .env.production with your API keys
#    (setup.sh will prompt you)

# 3. Start the application
./start.sh

# 4. Open your browser
#    http://localhost
```

That's it! The application is now running.

### Stopping

```bash
./stop.sh
```

---

## Documentation

- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Detailed deployment and setup guide
- **[USER_GUIDE.md](USER_GUIDE.md)** - Step-by-step user manual
- **[README.md](README.md)** - This file (project overview)

---

**Last Updated**: 2025
**Version**: 1.0.0
