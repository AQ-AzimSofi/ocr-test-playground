/**
 * Processor metadata and descriptions for OCR tools
 * Used to display tooltips and information in the UI
 */

export interface ProcessorInfo {
  name: string;
  displayName: string;
  shortDescription: string;
  fullDescription: string;
  howItWorks: string[];
  keyFeatures: string[];
  bestFor: string;
  cost: string;
  bboxAccuracy: 'precise' | 'approximate' | 'mixed' | 'none';
  recommended?: boolean;
  experimental?: boolean;
  category: 'core' | 'hybrid' | 'experimental';
}

export const processorMetadata: Record<string, ProcessorInfo> = {
  'cloud-vision': {
    name: 'cloud-vision',
    displayName: 'Cloud Vision',
    shortDescription: 'Fast, reliable paragraph-level OCR',
    fullDescription:
      'Google Cloud Vision Document Text Detection provides high-accuracy OCR with paragraph-level bounding boxes.',
    howItWorks: [
      'Sends image to Google Cloud Vision API',
      'Extracts text with paragraph-level bounding boxes',
      'Returns full text with confidence scores',
    ],
    keyFeatures: [
      'High accuracy for printed text',
      'Excellent character recognition',
      'Fast and reliable processing',
      'Paragraph-level granularity',
    ],
    bestFor: 'High-quality scanned drawings with clear text',
    cost: '~0.15 yen per image',
    bboxAccuracy: 'precise',
    category: 'core',
  },

  gemini: {
    name: 'gemini',
    displayName: 'Gemini 2.5 Flash',
    shortDescription: 'AI-powered vision model with context understanding',
    fullDescription:
      'Google Gemini 2.5 Flash multimodal AI provides advanced text extraction with contextual understanding, especially strong for complex layouts and Japanese text.',
    howItWorks: [
      'Sends image to Gemini 2.5 Flash vision model',
      'AI analyzes image contextually',
      'Extracts all visible text',
      'No bounding boxes (vision model limitation)',
    ],
    keyFeatures: [
      'Excellent at detecting text with overlays/noise',
      'Superior Japanese text recognition',
      'Context-aware extraction',
      'Handles complex layouts',
    ],
    bestFor:
      'Complex layouts with mixed Japanese/English or text with difficult backgrounds',
    cost: '~0.05 yen per image',
    bboxAccuracy: 'none',
    category: 'core',
  },

  'azure-layout': {
    name: 'azure-layout',
    displayName: 'Azure Layout',
    shortDescription: 'Structure-aware OCR with table detection',
    fullDescription:
      'Azure AI Document Intelligence prebuilt-layout model provides advanced layout analysis with table detection and structured data extraction.',
    howItWorks: [
      'Analyzes document structure and layout',
      'Detects tables, paragraphs, and key-value pairs',
      'Extracts text with line-level bounding boxes',
      'Preserves reading order and spatial relationships',
    ],
    keyFeatures: [
      'Table detection and extraction',
      'Layout-aware processing',
      'Structured data recognition',
      'Line-level confidence scores',
    ],
    bestFor: 'Technical drawings with structured layouts and tables',
    cost: '~1.50 yen per page',
    bboxAccuracy: 'precise',
    category: 'core',
  },

  'azure-read': {
    name: 'azure-read',
    displayName: 'Azure Read',
    shortDescription: 'Cost-effective word-level OCR',
    fullDescription:
      'Azure AI Document Intelligence read model provides fast, cost-effective OCR with word-level precision and confidence scores.',
    howItWorks: [
      'Sends image to Azure Read API',
      'Extracts text at word-level granularity',
      'Returns word-level bounding boxes',
      'Includes confidence scores per word',
    ],
    keyFeatures: [
      'Fast processing speed',
      'Cost-effective pricing',
      'Good multilingual support',
      'Word-level precision with confidence',
    ],
    bestFor: 'General-purpose OCR with budget constraints',
    cost: '~0.225 yen per page',
    bboxAccuracy: 'precise',
    category: 'core',
  },

  hybrid: {
    name: 'hybrid',
    displayName: 'Hybrid (Legacy)',
    shortDescription: 'Simple parallel processing (Cloud Vision + Gemini)',
    fullDescription:
      'Original hybrid approach that runs Cloud Vision and Gemini in parallel and selects the best result based on text length. Superseded by region-level hybrid processors.',
    howItWorks: [
      'Runs Cloud Vision and Gemini simultaneously',
      'Compares text length of both results',
      'Selects longer result (assumed to be more complete)',
      'No true fusion or correction',
    ],
    keyFeatures: [
      'Simple selection logic',
      'Parallel processing',
      'Uses both APIs',
      'Document-level selection only',
    ],
    bestFor: 'Baseline comparison and testing (not recommended for production)',
    cost: '~0.20 yen per image',
    bboxAccuracy: 'precise',
    category: 'hybrid',
  },

  'cloud-vision-gemini-hybrid': {
    name: 'cloud-vision-gemini-hybrid',
    displayName: 'Cloud Vision + Gemini Hybrid',
    shortDescription: 'Region-level fusion with AI correction (RECOMMENDED)',
    fullDescription:
      "Advanced hybrid processor that combines Cloud Vision's precise bounding boxes with Gemini's superior text detection. Uses confidence-based selective correction at the region level.",
    howItWorks: [
      'Cloud Vision extracts text with paragraph-level bboxes',
      'Analyzes confidence scores for each region',
      'High confidence regions (≥85%): Kept as-is',
      'Low confidence regions (<85%): Cropped and re-processed with Gemini',
      'Merges results: precise bboxes + AI-corrected text',
    ],
    keyFeatures: [
      'Region-level fusion (not document-level)',
      'Preserves spatial accuracy from Cloud Vision',
      'Gemini fixes OCR errors selectively',
      'Cost-optimized (only crops low-confidence regions)',
      'Tracks which regions were updated',
    ],
    bestFor: 'Production use - highest accuracy with cost efficiency',
    cost: '~0.15-0.30 yen per image (depends on low-confidence region count)',
    bboxAccuracy: 'precise',
    recommended: true,
    category: 'hybrid',
  },

  'azure-read-gemini-hybrid': {
    name: 'azure-read-gemini-hybrid',
    displayName: 'Azure Read + Gemini Hybrid',
    shortDescription: 'Budget-friendly hybrid with word-level precision',
    fullDescription:
      'Similar to Cloud Vision hybrid but uses Azure Read as the base, providing word-level precision at a lower cost. Gemini corrects low-confidence words.',
    howItWorks: [
      'Azure Read extracts text at word-level',
      'Analyzes confidence scores per word',
      'High confidence words (≥85%): Kept as-is',
      'Low confidence words (<85%): Cropped and re-processed with Gemini',
      'Merges results: word-level precision + AI corrections',
    ],
    keyFeatures: [
      'Word-level granularity (finer than paragraph)',
      'More cost-effective than Cloud Vision hybrid',
      "Azure's multilingual strength + Gemini's intelligence",
      'Preserves word-level bounding boxes',
    ],
    bestFor: 'Budget-conscious projects needing high accuracy',
    cost: '~0.225-0.40 yen per image (depends on low-confidence word count)',
    bboxAccuracy: 'precise',
    category: 'hybrid',
  },

  'gemini-coordinates': {
    name: 'gemini-coordinates',
    displayName: 'Gemini Coordinates (Experimental)',
    shortDescription: 'Asks Gemini for text + percentage coordinates',
    fullDescription:
      'Experimental processor that prompts Gemini to provide both text and approximate bounding box coordinates as percentages of image dimensions.',
    howItWorks: [
      'Sends image to Gemini with special coordinate prompt',
      'Requests format: TEXT|top|left|width|height (percentages)',
      'Parses response to extract text and coordinates',
      'Converts percentages to pixel bounding boxes',
      'Falls back to text-only if format parsing fails',
    ],
    keyFeatures: [
      'Single API call to Gemini',
      'Gets text AND bboxes from one source',
      'Very cheap (Gemini only)',
      'Tests if Gemini can provide spatial data',
    ],
    bestFor: 'Testing if Gemini can reliably provide coordinate information',
    cost: '~0.05 yen per image',
    bboxAccuracy: 'approximate',
    experimental: true,
    category: 'experimental',
  },

  'gemini-bbox-synthesis': {
    name: 'gemini-bbox-synthesis',
    displayName: 'Gemini Bbox Synthesis (Experimental)',
    shortDescription: 'Matches Gemini text to Cloud Vision bboxes',
    fullDescription:
      "Experimental fusion processor that combines Gemini's superior text detection with Cloud Vision's precise bounding boxes through intelligent fuzzy matching and bbox synthesis.",
    howItWorks: [
      'Runs Gemini (text) + Cloud Vision (text + bboxes) in parallel',
      'Segments Gemini text into matchable units',
      'Fuzzy matches each Gemini segment to Cloud Vision bboxes',
      'Reuses Cloud Vision bboxes for matched text',
      'Synthesizes approximate bboxes for unmatched Gemini text',
      'Final output: All Gemini text with bboxes (precise or synthesized)',
    ],
    keyFeatures: [
      'Captures text Cloud Vision missed',
      'Provides bboxes for all text',
      'Fuzzy matching with similarity threshold',
      'Automatic bbox synthesis for new text',
      'Tracks bbox sources (OCR vs synthesized)',
    ],
    bestFor: 'Maximum text detection completeness',
    cost: '~0.20 yen per image',
    bboxAccuracy: 'mixed',
    experimental: true,
    category: 'experimental',
  },

  'gemini-validation': {
    name: 'gemini-validation',
    displayName: 'Gemini Validation (Experimental)',
    shortDescription: 'Uses Gemini as QA reviewer to validate Azure results',
    fullDescription:
      'Experimental processor that uses Azure Read as baseline, then asks Gemini to act as a quality assurance reviewer to identify missing or incorrect text.',
    howItWorks: [
      'Runs Azure Read for baseline OCR with bboxes',
      'Sends image + Azure text to Gemini for validation',
      'Gemini identifies missing text and incorrect text',
      'Parses location descriptions from Gemini',
      'Crops regions with issues and re-processes with Gemini',
      'Synthesizes bboxes for newly found text',
      'Corrects Azure text based on Gemini feedback',
    ],
    keyFeatures: [
      'Systematic QA approach',
      'Gemini explicitly identifies problems',
      'Only processes regions needing correction',
      'Provides correction rationale',
      'Combines Azure precision with Gemini detection',
    ],
    bestFor: 'Systematic error detection and validation',
    cost: '~0.30-0.50 yen per image (depends on issues found)',
    bboxAccuracy: 'mixed',
    experimental: true,
    category: 'experimental',
  },

  'region-classifier': {
    name: 'region-classifier',
    displayName: 'Region Classifier (Experimental)',
    shortDescription:
      'Smart routing: Azure for high confidence, Gemini for low',
    fullDescription:
      "Experimental processor that intelligently routes different content regions to optimal processors based on Azure Layout's confidence scores.",
    howItWorks: [
      'Runs Azure Layout for structure analysis',
      'Classifies each region by confidence level',
      'High confidence regions (≥85%): Keep Azure results',
      'Low confidence regions (<85%): Crop and send to Gemini',
      'Batch processes low-confidence crops',
      'Merges results: mostly Azure with selective Gemini corrections',
    ],
    keyFeatures: [
      'Data-driven routing by confidence',
      'Cost optimization (Gemini only where needed)',
      'Leverages Azure Layout structure analysis',
      'Batch processing for efficiency',
    ],
    bestFor: 'Smart cost optimization with selective AI enhancement',
    cost: '~1.50-1.70 yen per image (depends on low-confidence region count)',
    bboxAccuracy: 'precise',
    experimental: true,
    category: 'experimental',
  },
};

/**
 * Get processor info by name
 */
export function getProcessorInfo(
  processorName: string
): ProcessorInfo | undefined {
  return processorMetadata[processorName];
}

/**
 * Get all processor names
 */
export function getAllProcessorNames(): string[] {
  return Object.keys(processorMetadata);
}

/**
 * Get processors by category
 */
export function getProcessorsByCategory(
  category: ProcessorInfo['category']
): ProcessorInfo[] {
  return Object.values(processorMetadata).filter(
    (p) => p.category === category
  );
}

/**
 * Format processor display name with badge
 */
export function getProcessorDisplayLabel(processorName: string): string {
  const info = getProcessorInfo(processorName);
  if (!info) return processorName;

  let label = info.displayName;
  if (info.recommended) label += ' (Recommended)';
  if (info.experimental) label += ' (Experimental)';

  return label;
}
