import type { BoundingBox } from '../types/api';

interface StatisticsPanelProps {
  boundingBoxes: BoundingBox[];
  toolName: string;
}

interface Stats {
  total: number;
  highConfidence: number;
  lowConfidence: number;
  geminiCorrected: number;
  lowConfidenceNotCorrected: number;
  correctionRate: number;
}

function calculateStats(boundingBoxes: BoundingBox[]): Stats {
  const total = boundingBoxes.length;
  let highConfidence = 0;
  let lowConfidence = 0;
  let geminiCorrected = 0;

  boundingBoxes.forEach((bbox) => {
    const conf = bbox.confidence ?? 1.0;

    if (conf >= 0.85) {
      highConfidence++;
    } else {
      lowConfidence++;
      if (bbox.metadata?.geminiUpdated) {
        geminiCorrected++;
      }
    }
  });

  const lowConfidenceNotCorrected = lowConfidence - geminiCorrected;
  const correctionRate =
    lowConfidence > 0 ? (geminiCorrected / lowConfidence) * 100 : 0;

  return {
    total,
    highConfidence,
    lowConfidence,
    geminiCorrected,
    lowConfidenceNotCorrected,
    correctionRate,
  };
}

export function StatisticsPanel({
  boundingBoxes,
  toolName,
}: StatisticsPanelProps) {
  const stats = calculateStats(boundingBoxes);

  return (
    <div className="border rounded-lg p-4 bg-gray-50">
      <h3 className="text-sm font-semibold mb-3 text-gray-700">
        {toolName} Statistics
      </h3>

      <div className="space-y-2 text-sm">
        {/* Total boxes */}
        <div className="flex justify-between">
          <span className="text-gray-600">Total Regions:</span>
          <span className="font-medium">{stats.total}</span>
        </div>

        {/* High confidence */}
        <div className="flex justify-between items-center">
          <span className="text-gray-600 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            High Confidence (≥85%):
          </span>
          <span className="font-medium text-green-700">
            {stats.highConfidence}
            <span className="text-xs text-gray-500 ml-1">
              ({((stats.highConfidence / stats.total) * 100).toFixed(1)}%)
            </span>
          </span>
        </div>

        {/* Low confidence */}
        <div className="flex justify-between items-center">
          <span className="text-gray-600 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-orange-500"></span>
            Low Confidence (&lt;85%):
          </span>
          <span className="font-medium text-orange-700">
            {stats.lowConfidence}
            <span className="text-xs text-gray-500 ml-1">
              ({((stats.lowConfidence / stats.total) * 100).toFixed(1)}%)
            </span>
          </span>
        </div>

        {/* Gemini corrected */}
        <div className="flex justify-between items-center pl-4 border-l-2 border-blue-300">
          <span className="text-gray-600 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
            Corrected by Gemini:
          </span>
          <span className="font-medium text-blue-700">
            {stats.geminiCorrected}
            <span className="text-xs text-gray-500 ml-1">
              (
              {stats.lowConfidence > 0
                ? ((stats.geminiCorrected / stats.lowConfidence) * 100).toFixed(
                    1
                  )
                : 0}
              %)
            </span>
          </span>
        </div>

        {/* Low confidence not corrected */}
        <div className="flex justify-between items-center pl-4 border-l-2 border-gray-300">
          <span className="text-gray-600 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
            Sent but Unchanged:
          </span>
          <span className="font-medium text-yellow-700">
            {stats.lowConfidenceNotCorrected}
            <span className="text-xs text-gray-500 ml-1">
              (
              {stats.lowConfidence > 0
                ? (
                    (stats.lowConfidenceNotCorrected / stats.lowConfidence) *
                    100
                  ).toFixed(1)
                : 0}
              %)
            </span>
          </span>
        </div>

        {/* Correction rate */}
        {stats.lowConfidence > 0 && (
          <div className="pt-2 mt-2 border-t border-gray-300">
            <div className="flex justify-between items-center">
              <span className="text-gray-700 font-medium">
                Correction Rate:
              </span>
              <span className="font-semibold text-blue-600">
                {stats.correctionRate.toFixed(1)}%
              </span>
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {stats.geminiCorrected} of {stats.lowConfidence} low-confidence
              regions were corrected
            </div>
          </div>
        )}

        {/* No low confidence message */}
        {stats.lowConfidence === 0 && (
          <div className="pt-2 mt-2 border-t border-gray-300">
            <div className="text-xs text-gray-500 italic">
              All regions have high confidence (≥85%). No regions were sent to
              Gemini for correction.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
