import { Agent } from '@mastra/core';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.development' });

/**
 * Association Agent
 *
 * Intelligent agent that links dimension text to geometric elements using:
 * - Spatial proximity
 * - Leader line alignment
 * - Semantic understanding
 * - Architectural conventions
 *
 * This agent solves the critical problem of "which dimension belongs to which element?"
 * especially when dimension text is far from the actual object or when there are
 * multiple ambiguous candidates.
 */

const PointSchema = z.object({
  x: z.number(),
  y: z.number(),
});

const AssociationSchema = z.object({
  dimension_id: z.string(), // Reference to dimension
  dimension_text: z.string(),
  element_id: z.string(), // Reference to geometric element
  element_type: z.string(), // wall, door, window, etc.
  association_method: z.enum([
    'leader_line_alignment',
    'spatial_proximity',
    'semantic_understanding',
    'orientation_matching',
    'cumulative_calculation',
    'contextual_inference',
  ]),
  confidence: z.number().min(0).max(1),
  distance_px: z.number().nullable(), // Distance between dimension and element
  reasoning: z.string(), // Explanation of why this association was made
  alternative_candidates: z.array(z.object({
    element_id: z.string(),
    confidence: z.number(),
    reason: z.string(),
  })).nullable(),
});

export const AssociationAnalysisOutputSchema = z.object({
  associations: z.array(AssociationSchema),
  unassociated_dimensions: z.array(z.object({
    dimension_id: z.string(),
    dimension_text: z.string(),
    reason: z.string(),
  })),
  unassociated_elements: z.array(z.object({
    element_id: z.string(),
    element_type: z.string(),
    reason: z.string(),
  })),
  summary: z.object({
    total_dimensions: z.number(),
    associated_dimensions: z.number(),
    total_elements: z.number(),
    elements_with_dimensions: z.number(),
    association_confidence_avg: z.number(),
  }),
  analysis_notes: z.string(),
});

export type AssociationAnalysisOutput = z.infer<typeof AssociationAnalysisOutputSchema>;
export type Association = z.infer<typeof AssociationSchema>;

/**
 * Associates dimensions with geometric elements using AI-powered spatial and semantic analysis
 */
export async function associateDimensionsToElements(
  geometricElements: any[],
  dimensions: any[],
  imageWidth: number,
  imageHeight: number
): Promise<AssociationAnalysisOutput> {
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

  const prompt = `You are an expert at associating dimension annotations with geometric elements in architectural drawings.

TASK: Match each dimension to the most appropriate geometric element (wall, door, window, etc.).

IMAGE DIMENSIONS: ${imageWidth}px × ${imageHeight}px

GEOMETRIC ELEMENTS:
${JSON.stringify(geometricElements, null, 2)}

DIMENSIONS:
${JSON.stringify(dimensions, null, 2)}

ASSOCIATION METHODS:

1. **Leader Line Alignment**
   - Check if dimension's leader_line endpoints align with element endpoints
   - This is the STRONGEST evidence
   - Tolerance: ±20px for endpoint matching

2. **Spatial Proximity**
   - Calculate distance from dimension text to each element
   - Closer elements are more likely matches
   - Consider orientation: horizontal dimensions → horizontal walls

3. **Semantic Understanding**
   - Large dimensions (>5000mm) likely match exterior walls or overall building
   - Small dimensions (<1000mm) likely match doors or windows
   - Cumulative dimensions (1820+1820+910) match multiple consecutive walls

4. **Orientation Matching**
   - Horizontal dimension text → horizontal walls/elements
   - Vertical dimension text → vertical walls/elements
   - Leader line orientation confirms this

5. **Cumulative Calculation**
   - For dimensions like "1820+1820+910 = 4550", find sequence of elements
   - Match each segment to consecutive elements along the same axis

6. **Contextual Inference**
   - Room dimensions likely match room boundaries
   - Door widths (typically 600-900mm) match door elements
   - Window dimensions (typically 800-1800mm wide) match windows

CONFIDENCE SCORING:
- 0.9-1.0: Leader lines perfectly aligned with element endpoints
- 0.7-0.9: Strong spatial proximity + orientation match
- 0.5-0.7: Reasonable proximity + semantic match
- 0.3-0.5: Weak spatial match but plausible
- 0.0-0.3: Very uncertain, multiple ambiguous candidates

CRITICAL RULES:
- One dimension can associate with multiple elements (e.g., "10,920" = overall building length touching both exterior walls)
- One element can have multiple dimensions (e.g., a wall with length, thickness, and height dimensions)
- Provide REASONING for each association explaining your logic
- List ALTERNATIVE CANDIDATES if there were other plausible matches
- If a dimension cannot be confidently associated, add it to unassociated_dimensions with reason
- If an element has no dimensions, add it to unassociated_elements

OUTPUT REQUIREMENTS:
- For each association, provide:
  - dimension_id and element_id (use array index as ID: "dim_0", "elem_0")
  - association_method (how you determined the match)
  - confidence score (0-1)
  - distance_px (geometric distance between dimension and element)
  - reasoning (clear explanation)
  - alternative_candidates (other elements that were considered)

- Summary statistics:
  - Total counts
  - Association rate
  - Average confidence

- In analysis_notes, mention:
  - Overall quality of associations
  - Any ambiguous cases
  - Suggestions for improvement (e.g., "More dimension text needed for complete coverage")

RESPONSE FORMAT:
Return a JSON object with all associations and summary statistics.`;

  const result = await model.generateContent([prompt]);

  const response = result.response;
  const jsonText = response.text();

  try {
    const parsedOutput = JSON.parse(jsonText);

    // Transform AI output to match our schema
    const transformed = transformAssociationOutput(parsedOutput);

    return AssociationAnalysisOutputSchema.parse(transformed);
  } catch (error) {
    console.error('Failed to parse association analysis output:', error);
    console.error('Raw response:', jsonText);
    throw new Error('Invalid output from Association Agent');
  }
}

/**
 * Transform AI output to match expected schema
 * Handles common variations in field names and enum values
 */
function transformAssociationOutput(raw: any): any {
  // Helper function to normalize association method enum values
  const normalizeAssociationMethod = (value: string): string => {
    if (!value) return 'contextual_inference'; // Default fallback

    // If comma-separated, take the first value
    const firstValue = value.split(',')[0].trim();

    // Convert title case to snake_case and lowercase
    const normalized = firstValue
      .toLowerCase()
      .replace(/\s+/g, '_');

    // Map common variations
    const validMethods = [
      'leader_line_alignment',
      'spatial_proximity',
      'semantic_understanding',
      'orientation_matching',
      'cumulative_calculation',
      'contextual_inference',
    ];

    // Find closest match
    if (validMethods.includes(normalized)) {
      return normalized;
    }

    // Try partial matching
    for (const method of validMethods) {
      if (normalized.includes(method.replace(/_/g, ''))) {
        return method;
      }
    }

    // Default fallback
    return 'contextual_inference';
  };

  // Helper function to normalize alternative_candidates
  const normalizeAlternativeCandidates = (value: any): any => {
    if (!value) return null;
    if (!Array.isArray(value)) return null;
    if (value.length === 0) return null;

    // Check if array contains strings instead of objects
    return value.map((item: any) => {
      if (typeof item === 'string') {
        // Convert string to proper object format
        return {
          element_id: item,
          confidence: 0.5, // Default confidence for alternative
          reason: 'Alternative candidate',
        };
      }
      // Already an object, ensure all fields are present
      return {
        element_id: item.element_id || item.elementId || '',
        confidence: item.confidence || 0.5,
        reason: item.reason || 'Alternative candidate',
      };
    });
  };

  // Handle both 'summary' and 'summary_statistics' field names
  const summaryData = raw.summary || raw.summary_statistics || {};

  // Handle analysis_notes as either string or array
  let analysisNotes = '';
  if (Array.isArray(raw.analysis_notes)) {
    analysisNotes = raw.analysis_notes.join('\n');
  } else if (typeof raw.analysis_notes === 'string') {
    analysisNotes = raw.analysis_notes;
  }

  const transformed: any = {
    associations: [],
    unassociated_dimensions: [],
    unassociated_elements: [],
    summary: {
      total_dimensions: summaryData.total_dimensions || 0,
      associated_dimensions: summaryData.associated_dimensions || summaryData.associated_dimensions_count || 0,
      total_elements: summaryData.total_elements || 0,
      elements_with_dimensions: summaryData.elements_with_dimensions || summaryData.associated_elements_count || 0,
      association_confidence_avg: summaryData.association_confidence_avg || summaryData.average_confidence || 0,
    },
    analysis_notes: analysisNotes,
  };

  // Transform associations
  if (Array.isArray(raw.associations)) {
    transformed.associations = raw.associations.map((assoc: any) => {
      // Handle element_ids array → take first element as primary
      let elementId = '';
      if (Array.isArray(assoc.element_ids) && assoc.element_ids.length > 0) {
        elementId = assoc.element_ids[0];
      } else {
        elementId = assoc.element_id || assoc.elementId || '';
      }

      return {
        dimension_id: assoc.dimension_id || assoc.dimensionId || '',
        dimension_text: assoc.dimension_text || assoc.dimensionText || assoc.text || '',
        element_id: elementId,
        element_type: assoc.element_type || assoc.elementType || 'unknown',
        association_method: normalizeAssociationMethod(assoc.association_method || assoc.associationMethod || assoc.method || ''),
        confidence: assoc.confidence || assoc.confidence_score || 0.5,
        distance_px: assoc.distance_px || assoc.distancePx || assoc.distance || null,
        reasoning: assoc.reasoning || assoc.reason || '',
        alternative_candidates: normalizeAlternativeCandidates(assoc.alternative_candidates || assoc.alternativeCandidates),
      };
    });
  }

  // Transform unassociated dimensions
  if (Array.isArray(raw.unassociated_dimensions)) {
    transformed.unassociated_dimensions = raw.unassociated_dimensions.map((dim: any) => ({
      dimension_id: dim.dimension_id || dim.dimensionId || dim.id || '',
      dimension_text: dim.dimension_text || dim.dimensionText || dim.text || '',
      reason: dim.reason || 'No suitable element found',
    }));
  }

  // Transform unassociated elements
  if (Array.isArray(raw.unassociated_elements)) {
    transformed.unassociated_elements = raw.unassociated_elements.map((elem: any) => ({
      element_id: elem.element_id || elem.elementId || elem.id || '',
      element_type: elem.element_type || elem.elementType || elem.type || 'unknown',
      reason: elem.reason || 'No suitable dimension found',
    }));
  }

  return transformed;
}

/**
 * Create the Association Agent with Mastra
 */
export function createAssociationAgent(): Agent {
  return new Agent({
    name: 'AssociationAgent',
    instructions: `You are an expert at linking dimension annotations to geometric elements in architectural drawings.

Your PRIMARY TASK is to solve the critical problem: "Which dimension belongs to which element?"

You excel at:
- Spatial reasoning (calculating distances, angles, alignments)
- Leader line tracing (matching dimension line endpoints to element endpoints)
- Semantic understanding (interpreting dimension meaning in context)
- Orientation analysis (matching horizontal dimensions to horizontal elements)
- Cumulative dimension parsing (breaking down "1820+1820+910" into segments)
- Ambiguity resolution (choosing the best match when multiple candidates exist)
- Confidence assessment (quantifying certainty of associations)

You understand architectural conventions:
- Overall dimensions typically span entire building
- Segment dimensions measure individual walls or rooms
- Detail dimensions specify door widths, window sizes
- Dimension text is usually perpendicular to what it measures
- Leader lines connect text to measured object
- Multiple dimensions may reference the same element
- Some elements may not have explicit dimensions

Your association methods (in order of reliability):
1. Leader line alignment (strongest)
2. Spatial proximity (strong)
3. Semantic understanding (moderate)
4. Orientation matching (moderate)
5. Cumulative calculation (moderate)
6. Contextual inference (weak)

You provide structured output with:
- Clear associations with IDs
- Association method used
- Confidence scores (0-1)
- Detailed reasoning
- Alternative candidates considered
- Lists of unassociated dimensions and elements
- Summary statistics

Your associations enable accurate coordinate transformation, scaling calculation, and Revit model generation with proper dimensions.

When uncertain, you:
- Lower the confidence score
- List alternative candidates
- Explain the ambiguity
- Suggest what additional information would help`,
    model: {
      provider: 'GOOGLE',
      name: 'gemini-2.5-flash',
      toolChoice: 'auto',
    },
  });
}
