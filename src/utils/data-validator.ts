/**
 * Data Validation and Completeness Analysis
 *
 * Analyzes the quality and completeness of extracted geometric data.
 * Generates reports on missing properties, data inconsistencies, and recommendations.
 */

export interface GeometricElement {
  id: string;
  type: string;
  subType?: string;
  geometry?: {
    type: string;
    coordinates: Array<{ x: number; y: number }>;
  };
  properties?: {
    length?: number;
    width?: number;
    thickness?: number;
    height?: number;
    dimension_text?: string;
    [key: string]: any;
  };
  confidence?: number;
}

export interface ElementTypeAnalysis {
  total: number;
  with_coordinates: number;
  with_length: number;
  with_width: number;
  with_thickness: number;
  with_height: number;
  with_dimension_text: number;
  completeness_score: number; // 0-100%
  missing_data_count: number;
}

export interface DataQualityReport {
  total_elements: number;
  by_type: Record<string, ElementTypeAnalysis>;
  overall_completeness: number; // 0-100%
  issues: Array<{
    severity: 'error' | 'warning' | 'info';
    element_id?: string;
    element_type?: string;
    message: string;
  }>;
  recommendations: string[];
  defaults_applied: Record<string, number>; // Count of defaults applied per property
}

/**
 * Required properties by element type
 */
const REQUIRED_PROPERTIES: Record<string, string[]> = {
  wall: ['length', 'thickness', 'height'],
  door: ['width', 'height'],
  window: ['width', 'height'],
  room: ['label'],
};

/**
 * Default values by element type and property
 */
const DEFAULT_VALUES: Record<string, Record<string, number>> = {
  wall: {
    thickness: 150, // mm - typical interior wall
    height: 2700, // mm - standard ceiling height
  },
  door: {
    width: 900, // mm - standard door width
    height: 2000, // mm - standard door height
  },
  window: {
    width: 1200, // mm - typical window width
    height: 1200, // mm - typical window height
  },
};

/**
 * Exterior wall heuristic (thicker walls)
 */
const EXTERIOR_WALL_DEFAULTS = {
  thickness: 200, // mm - thicker for exterior
};

/**
 * Analyze a single element for completeness
 */
function analyzeElement(element: GeometricElement): {
  hasCoordinates: boolean;
  hasLength: boolean;
  hasWidth: boolean;
  hasThickness: boolean;
  hasHeight: boolean;
  hasDimensionText: boolean;
  missingCount: number;
} {
  const hasCoordinates = !!(
    element.geometry?.coordinates && element.geometry.coordinates.length >= 2
  );

  const hasLength = !!(
    element.properties?.length && element.properties.length > 0
  );
  const hasWidth = !!(
    element.properties?.width && element.properties.width > 0
  );
  const hasThickness = !!(
    element.properties?.thickness && element.properties.thickness > 0
  );
  const hasHeight = !!(
    element.properties?.height && element.properties.height > 0
  );
  const hasDimensionText = !!(
    element.properties?.dimension_text &&
    element.properties.dimension_text.trim().length > 0
  );

  // Count missing required properties
  const required = REQUIRED_PROPERTIES[element.type] || [];
  const missingCount = required.filter((prop) => {
    if (prop === 'length') return !hasLength;
    if (prop === 'width') return !hasWidth;
    if (prop === 'thickness') return !hasThickness;
    if (prop === 'height') return !hasHeight;
    if (prop === 'label') return !element.properties?.label;
    return false;
  }).length;

  return {
    hasCoordinates,
    hasLength,
    hasWidth,
    hasThickness,
    hasHeight,
    hasDimensionText,
    missingCount,
  };
}

/**
 * Calculate completeness score for an element type
 */
function calculateCompletenessScore(analysis: ElementTypeAnalysis): number {
  if (analysis.total === 0) return 0;

  // Weight different properties
  const weights = {
    coordinates: 3, // Critical
    dimension_text: 2, // Very important
    length: 2,
    width: 1.5,
    thickness: 1.5,
    height: 1,
  };

  const maxScore =
    Object.values(weights).reduce((sum, w) => sum + w, 0) * analysis.total;

  const actualScore =
    weights.coordinates * analysis.with_coordinates +
    weights.dimension_text * analysis.with_dimension_text +
    weights.length * analysis.with_length +
    weights.width * analysis.with_width +
    weights.thickness * analysis.with_thickness +
    weights.height * analysis.with_height;

  return (actualScore / maxScore) * 100;
}

/**
 * Validate and analyze data quality
 */
export function validateData(elements: GeometricElement[]): DataQualityReport {
  const byType: Record<string, ElementTypeAnalysis> = {};
  const issues: DataQualityReport['issues'] = [];
  const recommendations: string[] = [];
  const defaultsApplied: Record<string, number> = {};

  // Analyze each element type
  for (const element of elements) {
    const type = element.type;

    if (!byType[type]) {
      byType[type] = {
        total: 0,
        with_coordinates: 0,
        with_length: 0,
        with_width: 0,
        with_thickness: 0,
        with_height: 0,
        with_dimension_text: 0,
        completeness_score: 0,
        missing_data_count: 0,
      };
    }

    const analysis = analyzeElement(element);
    byType[type].total++;
    if (analysis.hasCoordinates) byType[type].with_coordinates++;
    if (analysis.hasLength) byType[type].with_length++;
    if (analysis.hasWidth) byType[type].with_width++;
    if (analysis.hasThickness) byType[type].with_thickness++;
    if (analysis.hasHeight) byType[type].with_height++;
    if (analysis.hasDimensionText) byType[type].with_dimension_text++;
    byType[type].missing_data_count += analysis.missingCount;

    // Generate issues for critical missing data
    if (!analysis.hasCoordinates) {
      issues.push({
        severity: 'error',
        element_id: element.id,
        element_type: type,
        message: `${type} is missing coordinates - cannot generate geometry`,
      });
    }

    if (type === 'wall' && !analysis.hasLength && !analysis.hasDimensionText) {
      issues.push({
        severity: 'warning',
        element_id: element.id,
        element_type: type,
        message: `Wall has no length or dimension text - will calculate from coordinates`,
      });
    }

    if (type === 'wall' && !analysis.hasThickness) {
      issues.push({
        severity: 'info',
        element_id: element.id,
        element_type: type,
        message: `Wall missing thickness - will use default (${element.subType === 'exterior-wall' ? 200 : 150}mm)`,
      });
    }
  }

  // Calculate completeness scores
  for (const type in byType) {
    byType[type].completeness_score = calculateCompletenessScore(byType[type]);
  }

  // Overall completeness
  const totalElements = elements.length;
  const totalScore = Object.values(byType).reduce(
    (sum, analysis) =>
      sum + (analysis.completeness_score * analysis.total) / totalElements,
    0
  );

  // Generate recommendations
  for (const type in byType) {
    const analysis = byType[type];

    if (analysis.with_dimension_text / analysis.total < 0.5) {
      recommendations.push(
        `Only ${Math.round((analysis.with_dimension_text / analysis.total) * 100)}% of ${type}s have dimension text. Consider improving OCR or dimension association.`
      );
    }

    if (analysis.with_length / analysis.total < 0.3 && type === 'wall') {
      recommendations.push(
        `${Math.round((1 - analysis.with_length / analysis.total) * 100)}% of walls missing length data. Will calculate from coordinates instead.`
      );
    }

    if (analysis.completeness_score < 60) {
      recommendations.push(
        `${type} data has low completeness (${analysis.completeness_score.toFixed(0)}%). Review AI detection accuracy.`
      );
    }
  }

  // Add general recommendations
  if (totalScore < 70) {
    recommendations.push(
      'Overall data completeness is below 70%. Consider:\n  - Using higher resolution source images\n  - Adding more dimension labels to drawings\n  - Training custom AI models for better accuracy'
    );
  }

  return {
    total_elements: totalElements,
    by_type: byType,
    overall_completeness: totalScore,
    issues,
    recommendations,
    defaults_applied: defaultsApplied,
  };
}

/**
 * Apply default values to elements with missing properties
 * Modifies elements in-place
 */
export function applyDefaults(
  elements: GeometricElement[]
): Record<string, number> {
  const defaultsApplied: Record<string, number> = {};

  for (const element of elements) {
    if (!element.properties) {
      element.properties = {};
    }

    const defaults = DEFAULT_VALUES[element.type];
    if (!defaults) continue;

    // Apply defaults for missing properties
    for (const [property, value] of Object.entries(defaults)) {
      if (!element.properties[property] || element.properties[property] === 0) {
        // Special case: exterior walls get thicker default
        if (
          element.type === 'wall' &&
          property === 'thickness' &&
          element.subType === 'exterior-wall'
        ) {
          element.properties[property] = EXTERIOR_WALL_DEFAULTS.thickness;
        } else {
          element.properties[property] = value;
        }

        const key = `${element.type}.${property}`;
        defaultsApplied[key] = (defaultsApplied[key] || 0) + 1;
      }
    }
  }

  return defaultsApplied;
}

/**
 * Log validation report to console
 */
export function logValidationReport(report: DataQualityReport): void {
  console.log(`\n${'='.repeat(70)}`);
  console.log('DATA QUALITY VALIDATION REPORT');
  console.log('='.repeat(70));

  console.log(
    `\nOverall Completeness: ${report.overall_completeness.toFixed(1)}%`
  );
  console.log(`Total Elements: ${report.total_elements}`);

  console.log(`\nBy Element Type:`);
  for (const [type, analysis] of Object.entries(report.by_type)) {
    console.log(`  ${type.toUpperCase()} (${analysis.total} total)`);
    console.log(`    Completeness: ${analysis.completeness_score.toFixed(1)}%`);
    console.log(
      `    With coordinates: ${analysis.with_coordinates}/${analysis.total}`
    );
    console.log(
      `    With dimensions: ${analysis.with_dimension_text}/${analysis.total}`
    );
    if (type === 'wall') {
      console.log(
        `    With thickness: ${analysis.with_thickness}/${analysis.total}`
      );
    }
  }

  if (report.issues.length > 0) {
    console.log(`\nIssues Found: ${report.issues.length}`);
    const errors = report.issues.filter((i) => i.severity === 'error');
    const warnings = report.issues.filter((i) => i.severity === 'warning');
    if (errors.length > 0) console.log(`    Errors: ${errors.length}`);
    if (warnings.length > 0) console.log(`    Warnings: ${warnings.length}`);
  }

  if (report.recommendations.length > 0) {
    console.log(`\nRecommendations:`);
    report.recommendations.forEach((rec) => {
      console.log(`  - ${rec}`);
    });
  }

  if (Object.keys(report.defaults_applied).length > 0) {
    console.log(`\nDefaults Applied:`);
    for (const [property, count] of Object.entries(report.defaults_applied)) {
      console.log(`  - ${property}: ${count} times`);
    }
  }

  console.log('');
}
