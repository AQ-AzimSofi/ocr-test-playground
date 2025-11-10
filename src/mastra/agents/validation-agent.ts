import { Agent } from '@mastra/core';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.development' });

/**
 * Validation Agent
 *
 * Final quality assurance agent that reviews all extracted data for:
 * - Mathematical consistency (do segment dimensions sum to overall dimensions?)
 * - Geometric sanity (are coordinates within image bounds?)
 * - Architectural plausibility (are dimensions realistic?)
 * - Data completeness (are required properties present?)
 * - Association quality (are dimension-element links reasonable?)
 *
 * This agent can flag errors, suggest corrections, and trigger re-processing if needed.
 */

const IssueSchema = z.object({
  severity: z.enum(['error', 'warning', 'info']),
  category: z.enum([
    'mathematical_inconsistency',
    'geometric_error',
    'dimension_mismatch',
    'missing_data',
    'unrealistic_value',
    'low_confidence',
    'association_conflict',
    'scale_error',
    'other',
  ]),
  element_id: z.string().nullable(),
  dimension_id: z.string().nullable(),
  description: z.string(),
  suggested_fix: z.string().nullable(),
  confidence_in_issue: z.number().min(0).max(1),
});

const CorrectionSchema = z.object({
  correction_type: z.enum([
    'dimension_value',
    'coordinate',
    'association',
    'property',
    'classification',
  ]),
  target_id: z.string(), // ID of element/dimension to correct
  field_name: z.string(), // Which field to correct
  current_value: z.any(), // Current (wrong) value
  corrected_value: z.any(), // Proposed correct value
  reasoning: z.string(),
  confidence: z.number().min(0).max(1),
});

const ValidationCheckSchema = z.object({
  check_name: z.string(),
  passed: z.boolean(),
  details: z.string(),
  affected_count: z.number().nullable(),
});

export const ValidationOutputSchema = z.object({
  overall_quality: z.object({
    score: z.number().min(0).max(100), // 0-100 overall quality score
    grade: z.enum(['excellent', 'good', 'acceptable', 'poor', 'failed']),
    data_completeness_pct: z.number().min(0).max(100),
    association_success_rate: z.number().min(0).max(100),
    avg_confidence: z.number().min(0).max(1),
  }),
  validation_checks: z.array(ValidationCheckSchema),
  issues: z.array(IssueSchema),
  suggested_corrections: z.array(CorrectionSchema),
  statistics: z.object({
    total_issues: z.number(),
    errors: z.number(),
    warnings: z.number(),
    info: z.number(),
    elements_with_issues: z.number(),
    dimensions_with_issues: z.number(),
  }),
  recommendations: z.array(z.string()),
  analysis_summary: z.string(),
  ready_for_revit: z.boolean(),
  requires_reprocessing: z.boolean(),
});

export type ValidationOutput = z.infer<typeof ValidationOutputSchema>;
export type Issue = z.infer<typeof IssueSchema>;
export type Correction = z.infer<typeof CorrectionSchema>;

/**
 * Validates all extracted data and associations for quality and consistency
 */
export async function validateExtractionResults(
  geometricElements: any[],
  dimensions: any[],
  associations: any[],
  metadata: {
    imageWidth: number;
    imageHeight: number;
    scalingFactor?: number;
    scaleText?: string;
  }
): Promise<ValidationOutput> {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_GEMINI_API_KEY environment variable not set');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
    },
  });

  const prompt = `You are a quality assurance expert for architectural drawing analysis. Your task is to validate all extracted data and flag any issues.

TASK: Perform comprehensive validation checks and provide quality assessment.

IMAGE METADATA:
- Dimensions: ${metadata.imageWidth}px × ${metadata.imageHeight}px
- Scaling Factor: ${metadata.scalingFactor ? `${metadata.scalingFactor} mm/pixel` : 'Not calculated'}
- Scale Text: ${metadata.scaleText || 'Not found'}

GEOMETRIC ELEMENTS (${geometricElements.length}):
${JSON.stringify(geometricElements, null, 2)}

DIMENSIONS (${dimensions.length}):
${JSON.stringify(dimensions, null, 2)}

ASSOCIATIONS (${associations.length}):
${JSON.stringify(associations, null, 2)}

VALIDATION CHECKS TO PERFORM:

**1. Mathematical Consistency**
- Do segment dimensions sum to overall dimensions?
  Example: If walls are 1820, 1820, 910, does overall dimension say 4550? (within 5% tolerance)
- Are cumulative dimensions (e.g., "1820+1820+910") correctly calculated?
- Check: sum of associated segments ≈ dimension text value

**2. Geometric Sanity**
- Are all coordinates within image bounds (0-width, 0-height)?
- Are wall endpoints connected properly (no gaps or overlaps)?
- Are element dimensions reasonable (not negative, not impossibly large)?
- Check: 0 ≤ x ≤ ${metadata.imageWidth}, 0 ≤ y ≤ ${metadata.imageHeight}

**3. Architectural Plausibility**
- Are wall lengths realistic? (typically 500mm - 20,000mm)
- Are wall thicknesses reasonable? (typically 100mm - 300mm)
- Are door widths standard? (typically 600mm - 1000mm)
- Are window sizes reasonable? (typically 600mm - 2000mm wide)
- Are room areas plausible? (typically 4m² - 50m²)

**4. Scaling Validation**
- If scaling factor exists, do calculated lengths match dimension text?
- Example: Wall 200px long, scaling 50mm/px → 10,000mm. Does dimension say "10,000"?
- Tolerance: ±5% acceptable
- Flag if discrepancies exceed 10%

**5. Data Completeness**
- What percentage of elements have dimensions?
- Are required properties present? (walls need length, doors need width)
- Are confidence scores reasonable? (average > 0.6 is acceptable)
- Calculate: completeness_pct = (elements_with_required_data / total_elements) × 100

**6. Association Quality**
- Are associations logical? (dimension proximity to element)
- Are confidence scores appropriate for the association method?
- Are there orphaned dimensions (no element) or orphaned elements (no dimension)?
- Check for conflicts: dimension associated with wrong element type

**7. Confidence Analysis**
- Average confidence across all elements
- Average confidence across all dimensions
- Average confidence across all associations
- Flag low-confidence items (< 0.5) for review

ISSUE SEVERITY LEVELS:
- **ERROR**: Critical problem preventing Revit import (e.g., negative coordinates, missing required data)
- **WARNING**: Suspicious but not blocking (e.g., dimension mismatch, low confidence, unrealistic values)
- **INFO**: Informational note (e.g., "No scale indicator found", "Some elements lack dimensions")

CORRECTION SUGGESTIONS:
- If you detect an obvious error with high confidence, suggest a correction
- Example: Dimension says "10,920" but wall length calculates to 10,000mm → suggest correcting scaling factor
- Only suggest corrections when confidence > 0.8

OUTPUT REQUIREMENTS:

1. **overall_quality**:
   - score: 0-100 based on checks passed and issue severity
   - grade: excellent (90-100), good (70-89), acceptable (50-69), poor (30-49), failed (<30)
   - data_completeness_pct: percentage of elements with all required properties
   - association_success_rate: percentage of dimensions successfully associated
   - avg_confidence: average confidence across all items

2. **validation_checks**: List of specific checks performed
   - check_name: descriptive name
   - passed: true/false
   - details: explanation
   - affected_count: number of items affected

3. **issues**: Detected problems
   - severity: error/warning/info
   - category: type of issue
   - element_id/dimension_id: affected item
   - description: clear explanation
   - suggested_fix: how to fix (if known)
   - confidence_in_issue: how certain you are this is actually a problem

4. **suggested_corrections**: Proposed fixes
   - What to correct, why, and new value
   - Only if confidence > 0.8

5. **recommendations**: High-level suggestions for improvement
   - e.g., "Re-run dimension extraction in region X", "Manual review needed for elements [...]"

6. **analysis_summary**: Overall assessment in human-readable text

7. **ready_for_revit**: Boolean - is this data good enough for Revit import?

8. **requires_reprocessing**: Boolean - should any agent be re-run?

RESPONSE FORMAT:
Return a JSON object with complete validation results.`;

  const result = await model.generateContent([prompt]);

  const response = result.response;
  const jsonText = response.text();

  try {
    const parsedOutput = JSON.parse(jsonText);

    // Transform AI output to match our schema
    const transformed = transformValidationOutput(parsedOutput);

    return ValidationOutputSchema.parse(transformed);
  } catch (error) {
    console.error('Failed to parse validation output:', error);
    console.error('Raw response:', jsonText);
    throw new Error('Invalid output from Validation Agent');
  }
}

/**
 * Transform AI output to match expected schema
 * Handles common variations in field names and enum values
 */
function transformValidationOutput(raw: any): any {
  // Helper function to normalize severity enum values
  const normalizeSeverity = (value: string): string => {
    if (!value) return 'info';
    const normalized = value.toLowerCase();
    const validSeverities = ['error', 'warning', 'info'];
    if (validSeverities.includes(normalized)) {
      return normalized;
    }
    return 'info'; // Default fallback
  };

  // Helper function to normalize category enum values
  const normalizeCategory = (value: string): string => {
    if (!value) return 'other';

    // Convert to lowercase and replace spaces with underscores
    const normalized = value.toLowerCase().replace(/\s+/g, '_');

    const validCategories = [
      'mathematical_inconsistency',
      'geometric_error',
      'dimension_mismatch',
      'missing_data',
      'unrealistic_value',
      'low_confidence',
      'association_conflict',
      'scale_error',
      'other',
    ];

    // Direct match
    if (validCategories.includes(normalized)) {
      return normalized;
    }

    // Partial matching for common variations
    const categoryMappings: { [key: string]: string } = {
      'scaling': 'scale_error',
      'scale': 'scale_error',
      'mathematical': 'mathematical_inconsistency',
      'math': 'mathematical_inconsistency',
      'geometric': 'geometric_error',
      'geometry': 'geometric_error',
      'dimension': 'dimension_mismatch',
      'missing': 'missing_data',
      'unrealistic': 'unrealistic_value',
      'confidence': 'low_confidence',
      'association': 'association_conflict',
      'architectural': 'unrealistic_value',
      'plausibility': 'unrealistic_value',
      'data_completeness': 'missing_data',
      'completeness': 'missing_data',
    };

    // Try to find a matching category
    for (const [key, category] of Object.entries(categoryMappings)) {
      if (normalized.includes(key)) {
        return category;
      }
    }

    return 'other';
  };

  // Helper function to normalize validation checks
  const normalizeValidationCheck = (check: any): any => {
    return {
      check_name: check.check_name || check.checkName || check.name || 'Unknown check',
      passed: check.passed !== undefined ? check.passed : true,
      details: check.details || check.description || '',
      affected_count: check.affected_count !== undefined ? check.affected_count : null,
    };
  };

  // Helper function to normalize issues
  const normalizeIssue = (issue: any): any => {
    return {
      severity: normalizeSeverity(issue.severity || 'info'),
      category: normalizeCategory(issue.category || 'other'),
      element_id: issue.element_id || issue.elementId || null,
      dimension_id: issue.dimension_id || issue.dimensionId || null,
      description: issue.description || issue.message || '',
      suggested_fix: issue.suggested_fix || issue.suggestedFix || issue.fix || null,
      confidence_in_issue: issue.confidence_in_issue !== undefined ? issue.confidence_in_issue : (issue.confidence || 0.8),
    };
  };

  // Helper function to normalize corrections
  const normalizeCorrection = (correction: any): any => {
    const validTypes = ['dimension_value', 'coordinate', 'association', 'property', 'classification'];
    let correctionType = correction.correction_type || correction.type || 'property';
    correctionType = correctionType.toLowerCase().replace(/\s+/g, '_');
    if (!validTypes.includes(correctionType)) {
      correctionType = 'property';
    }

    return {
      correction_type: correctionType,
      target_id: correction.target_id || correction.targetId || '',
      field_name: correction.field_name || correction.fieldName || correction.field || '',
      current_value: correction.current_value !== undefined ? correction.current_value : null,
      corrected_value: correction.corrected_value !== undefined ? correction.corrected_value : null,
      reasoning: correction.reasoning || correction.reason || '',
      confidence: correction.confidence || 0.5,
    };
  };

  // Transform overall quality
  const qualityData = raw.overall_quality || raw.overallQuality || raw.quality || {};
  const validGrades = ['excellent', 'good', 'acceptable', 'poor', 'failed'];
  let grade = qualityData.grade || 'acceptable';
  grade = grade.toLowerCase();
  if (!validGrades.includes(grade)) {
    grade = 'acceptable';
  }

  const transformed: any = {
    overall_quality: {
      score: qualityData.score !== undefined ? qualityData.score : 50,
      grade: grade,
      data_completeness_pct: qualityData.data_completeness_pct !== undefined ? qualityData.data_completeness_pct : (qualityData.dataCompletenessPct || 0),
      association_success_rate: qualityData.association_success_rate !== undefined ? qualityData.association_success_rate : (qualityData.associationSuccessRate || 0),
      avg_confidence: qualityData.avg_confidence !== undefined ? qualityData.avg_confidence : (qualityData.avgConfidence || 0),
    },
    validation_checks: [],
    issues: [],
    suggested_corrections: [],
    statistics: {
      total_issues: 0,
      errors: 0,
      warnings: 0,
      info: 0,
      elements_with_issues: 0,
      dimensions_with_issues: 0,
    },
    recommendations: [],
    analysis_summary: raw.analysis_summary || raw.analysisSummary || raw.summary || '',
    ready_for_revit: raw.ready_for_revit !== undefined ? raw.ready_for_revit : (raw.readyForRevit !== undefined ? raw.readyForRevit : true),
    requires_reprocessing: raw.requires_reprocessing !== undefined ? raw.requires_reprocessing : (raw.requiresReprocessing !== undefined ? raw.requiresReprocessing : false),
  };

  // Transform validation checks
  if (Array.isArray(raw.validation_checks)) {
    transformed.validation_checks = raw.validation_checks.map(normalizeValidationCheck);
  } else if (Array.isArray(raw.validationChecks)) {
    transformed.validation_checks = raw.validationChecks.map(normalizeValidationCheck);
  }

  // Transform issues
  if (Array.isArray(raw.issues)) {
    transformed.issues = raw.issues.map(normalizeIssue);
  }

  // Transform suggested corrections
  if (Array.isArray(raw.suggested_corrections)) {
    transformed.suggested_corrections = raw.suggested_corrections.map(normalizeCorrection);
  } else if (Array.isArray(raw.suggestedCorrections)) {
    transformed.suggested_corrections = raw.suggestedCorrections.map(normalizeCorrection);
  }

  // Transform statistics
  const statsData = raw.statistics || raw.stats || {};
  transformed.statistics = {
    total_issues: statsData.total_issues !== undefined ? statsData.total_issues : (statsData.totalIssues || 0),
    errors: statsData.errors || 0,
    warnings: statsData.warnings || 0,
    info: statsData.info || 0,
    elements_with_issues: statsData.elements_with_issues !== undefined ? statsData.elements_with_issues : (statsData.elementsWithIssues || 0),
    dimensions_with_issues: statsData.dimensions_with_issues !== undefined ? statsData.dimensions_with_issues : (statsData.dimensionsWithIssues || 0),
  };

  // Transform recommendations
  if (Array.isArray(raw.recommendations)) {
    transformed.recommendations = raw.recommendations;
  }

  return transformed;
}

/**
 * Create the Validation Agent with Mastra
 */
export function createValidationAgent(): Agent {
  return new Agent({
    name: 'ValidationAgent',
    instructions: `You are a quality assurance expert specializing in architectural drawing analysis validation.

Your PRIMARY TASK is to review all extracted data and ensure it's accurate, complete, and ready for Revit import.

You perform comprehensive validation checks:

**Mathematical Consistency**
- Verify segment dimensions sum to overall dimensions (±5% tolerance)
- Validate cumulative dimension calculations
- Check scaling factor consistency

**Geometric Sanity**
- Ensure coordinates are within image bounds
- Check for properly connected walls
- Validate element dimensions are reasonable (not negative, not impossibly large)

**Architectural Plausibility**
- Verify wall lengths (500mm - 20,000mm typical)
- Check wall thicknesses (100mm - 300mm typical)
- Validate door widths (600mm - 1000mm typical)
- Confirm window sizes (600mm - 2000mm typical)
- Assess room areas (4m² - 50m² typical)

**Scaling Validation**
- If scaling factor exists, verify calculated lengths match dimension text (±5% tolerance)
- Flag discrepancies exceeding 10%

**Data Completeness**
- Calculate percentage of elements with dimensions
- Check for required properties (walls need length, doors need width)
- Assess confidence score distribution

**Association Quality**
- Verify associations are logical and spatially coherent
- Check for orphaned dimensions or elements
- Detect association conflicts

**Confidence Analysis**
- Calculate average confidence scores
- Flag low-confidence items (<0.5) for review

You categorize issues by severity:
- ERROR: Blocks Revit import (missing data, invalid coordinates)
- WARNING: Suspicious but not blocking (mismatches, low confidence)
- INFO: Informational notes (missing scale, incomplete dimensions)

You suggest corrections when:
- Error is obvious and unambiguous
- Confidence in correction > 0.8
- Correction is actionable

You provide:
- Overall quality score (0-100) and grade
- List of all validation checks performed
- Detailed issue reports with severity and suggested fixes
- Correction proposals with reasoning
- High-level recommendations
- Boolean flags: ready_for_revit, requires_reprocessing

Your validation ensures data quality and prevents downstream errors in Revit model generation.

You are thorough but pragmatic: you distinguish between critical errors and acceptable imperfections. Your goal is production-ready data, not perfection.`,
    model: {
      provider: 'GOOGLE',
      name: 'gemini-2.5-flash',
      toolChoice: 'auto',
    },
  });
}
