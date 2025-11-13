# OCR Testing Tool - Electron App

Standalone desktop application for OCR testing and floor plan to Revit conversion.

## Features

### 1. PDF OCR Testing (Mode A)
- Upload multi-page PDFs (up to 60+ pages)
- Provide ground truth for each page
- Test with 14 OCR processors across 3 categories:
  - **Confidential-safe**: Cloud Vision, Azure Read, Azure Layout, Document AI
  - **Hybrids**: Cloud Vision+Gemini, Azure Read+Gemini, Document AI+Gemini, Gemini Self-Calibrating
  - **Experimental**: Legacy Hybrid, Gemini Coordinates, Gemini Bbox Synthesis, Gemini Validation, Region Classifier, Gemini Geometric
- Generate comprehensive HTML reports

### 2. Text Comparison (Mode B)
- Compare multiple OCR outputs against ground truth
- No file upload required - just copy-paste text
- Same HTML report with full metrics:
  - Order-dependent: CER, precision, recall, F1, edit distance
  - Order-independent: Alphabetically sorted comparison
  - Character-level diff visualization
  - Side-by-side text comparison

### 3. Floor Plan to Revit
- Upload floor plan images (PNG/JPG)
- Run Hybrid CV+AI wall/room detection
- Download Revit JSON with dual coordinates
- Auto-generated Dynamo Python script
- Preview detected walls, rooms, doors, windows

## Development

### Prerequisites
- Node.js 20+
- npm 8+

### Setup
```bash
cd electron-app
npm install
```

### Run Development Mode
```bash
npm run electron:dev
```

This will start Vite dev server and Electron in development mode with hot reload.

### Build for Production

#### Build for current platform
```bash
npm run build
```

#### Build for specific platforms
```bash
npm run build:win    # Windows
npm run build:mac    # macOS
npm run build:linux  # Linux
```

#### Build without packaging (for testing)
```bash
npm run build:dir
```

## Project Structure

```
electron-app/
├── src/
│   ├── main/              # Electron main process
│   │   ├── index.ts       # Main entry point
│   │   ├── preload.ts     # Preload script (IPC bridge)
│   │   ├── ipc-handlers.ts # IPC handlers
│   │   ├── processors/    # OCR processors (Phase 2)
│   │   └── utils/         # Utilities (Phase 2)
│   ├── renderer/          # React app
│   │   ├── pages/         # Page components
│   │   │   ├── ModeA.tsx  # PDF testing
│   │   │   ├── ModeB.tsx  # Text testing
│   │   │   ├── FloorPlan.tsx # Revit conversion
│   │   │   └── Settings.tsx # API keys
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css
│   └── shared/            # Shared types
│       └── types.ts
├── build/                 # Build resources (icons)
├── dist/                  # Vite build output
├── dist-electron/         # Electron build output
├── dist-installers/       # Final installers
├── package.json
├── vite.config.ts
├── tsconfig.json
└── README.md
```

## Configuration

### API Keys
API keys are stored encrypted in `~/.ocr-testing-tool/api-keys.enc` using Electron's `safeStorage` API.

Configure your API keys in the Settings page:
- Google Cloud Vision API Key
- Azure Cognitive Services Key + Endpoint
- Google Gemini API Key
- Document AI Project ID + Service Account JSON

### File Outputs
All generated files (HTML reports, Revit JSON, Python scripts) are saved to user-selected locations.

## Security

- API keys are encrypted at rest using Electron's `safeStorage`
- No data is transmitted over the network except API calls to OCR services
- All processing happens locally on your machine

## Troubleshooting

### Development Mode
If the app doesn't start, check:
1. Port 5174 is not in use
2. Node modules are installed: `npm install`
3. TypeScript compiled without errors: `npm run typecheck`

### Build Issues
If builds fail:
1. Clean build artifacts: `rm -rf dist dist-electron dist-installers`
2. Reinstall dependencies: `rm -rf node_modules package-lock.json && npm install`
3. Try building for directory first: `npm run build:dir`

## License

MIT
