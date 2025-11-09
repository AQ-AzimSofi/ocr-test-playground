import { useParams, Link } from 'react-router-dom';
import { useDrawingResults } from '../api/queries';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from 'recharts';

const COLORS = ['#22c55e', '#eab308', '#f97316', '#ef4444'];

export function Statistics() {
  const { drawingId } = useParams<{ drawingId: string }>();
  const { data, isLoading, error } = useDrawingResults(drawingId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg text-gray-600">Loading...</div>
      </div>
    );
  }

  if (error || !data?.data) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg text-red-600">Error loading statistics</div>
      </div>
    );
  }

  const { drawing, resultsByTool, tools } = data.data;

  // Prepare data for charts
  const processingTimeData = tools.map((tool) => ({
    tool,
    time: resultsByTool[tool]?.processingTimeMs || 0,
  }));

  const costData = tools.map((tool) => ({
    tool,
    cost: resultsByTool[tool]?.apiCost || 0,
  }));

  const bboxCountData = tools.map((tool) => ({
    tool,
    count: resultsByTool[tool]?.boundingBoxes?.length || 0,
  }));

  // Calculate confidence distribution for each tool
  const confidenceDistribution = tools.map((tool) => {
    const bboxes = resultsByTool[tool]?.boundingBoxes || [];
    const excellent = bboxes.filter((b) => (b.confidence || 1) >= 0.95).length;
    const good = bboxes.filter(
      (b) => (b.confidence || 1) >= 0.85 && (b.confidence || 1) < 0.95
    ).length;
    const medium = bboxes.filter(
      (b) => (b.confidence || 1) >= 0.75 && (b.confidence || 1) < 0.85
    ).length;
    const low = bboxes.filter((b) => (b.confidence || 1) < 0.75).length;

    return {
      tool,
      excellent,
      good,
      medium,
      low,
    };
  });

  // Gemini update statistics
  const geminiUpdateStats = tools.map((tool) => {
    const bboxes = resultsByTool[tool]?.boundingBoxes || [];
    const geminiUpdates = bboxes.filter(
      (b) => b.metadata?.geminiUpdated
    ).length;
    const lowConfidence = bboxes.filter(
      (b) => (b.confidence || 1) < 0.85
    ).length;

    return {
      tool,
      geminiUpdates,
      lowConfidence,
      totalBboxes: bboxes.length,
      updateRate: bboxes.length > 0 ? (geminiUpdates / bboxes.length) * 100 : 0,
    };
  });

  // Accuracy metrics (if available)
  const accuracyData = tools
    .map((tool) => {
      const result = resultsByTool[tool];
      if (result?.accuracyMetrics) {
        return {
          tool,
          cer: result.accuracyMetrics.cer * 100,
          wer: result.accuracyMetrics.wer * 100,
          precision: result.accuracyMetrics.precision * 100,
          recall: result.accuracyMetrics.recall * 100,
        };
      }
      return null;
    })
    .filter(Boolean);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="mb-4">
          <Link
            to="/"
            className="text-blue-600 hover:text-blue-800 text-sm mb-2 inline-block"
          >
            ← Back to Home
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">
            {drawing.fileName}
          </h1>
          <p className="text-sm text-gray-500 mt-1">Statistics & Comparison</p>
        </div>

        {/* Navigation Tabs */}
        <div className="flex gap-2 border-b -mb-4 pb-0">
          <Link
            to={`/drawing/${drawingId}`}
            className="px-4 py-2 font-medium text-gray-600 hover:text-gray-900 border-b-2 border-transparent hover:border-gray-300"
          >
            Viewer
          </Link>
          <Link
            to={`/drawing/${drawingId}/compare`}
            className="px-4 py-2 font-medium text-gray-600 hover:text-gray-900 border-b-2 border-transparent hover:border-gray-300"
          >
            Compare
          </Link>
          <Link
            to={`/drawing/${drawingId}/stats`}
            className="px-4 py-2 font-medium text-blue-600 border-b-2 border-blue-600"
          >
            Statistics
          </Link>
        </div>
      </header>

      {/* Content */}
      <div className="p-6 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-600">Total Tools</div>
            <div className="text-3xl font-bold text-gray-900 mt-2">
              {tools.length}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-600">Avg Processing Time</div>
            <div className="text-3xl font-bold text-blue-600 mt-2">
              {Math.round(
                processingTimeData.reduce((sum, d) => sum + d.time, 0) /
                  tools.length
              )}
              ms
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-600">Total Cost</div>
            <div className="text-3xl font-bold text-green-600 mt-2">
              ¥{costData.reduce((sum, d) => sum + d.cost, 0).toFixed(2)}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-600">Total Gemini Updates</div>
            <div className="text-3xl font-bold text-purple-600 mt-2">
              {geminiUpdateStats.reduce((sum, d) => sum + d.geminiUpdates, 0)}
            </div>
          </div>
        </div>

        {/* Accuracy Metrics (if available) */}
        {accuracyData.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Accuracy Metrics</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={accuracyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="tool" />
                <YAxis
                  label={{
                    value: 'Error Rate (%)',
                    angle: -90,
                    position: 'insideLeft',
                  }}
                />
                <Tooltip />
                <Legend />
                <Bar dataKey="cer" fill="#ef4444" name="CER (%)" />
                <Bar dataKey="wer" fill="#f97316" name="WER (%)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Processing Time */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">
            Processing Time by Tool
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={processingTimeData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="tool" />
              <YAxis
                label={{
                  value: 'Time (ms)',
                  angle: -90,
                  position: 'insideLeft',
                }}
              />
              <Tooltip />
              <Legend />
              <Bar dataKey="time" fill="#3b82f6" name="Processing Time (ms)" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* API Cost */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">API Cost by Tool</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={costData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="tool" />
              <YAxis
                label={{
                  value: 'Cost (¥)',
                  angle: -90,
                  position: 'insideLeft',
                }}
              />
              <Tooltip />
              <Legend />
              <Bar dataKey="cost" fill="#22c55e" name="API Cost (¥)" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Bounding Box Count */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">
            Bounding Box Count by Tool
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={bboxCountData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="tool" />
              <YAxis
                label={{ value: 'Count', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip />
              <Legend />
              <Bar dataKey="count" fill="#8b5cf6" name="Bounding Box Count" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Confidence Distribution */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">
            Confidence Distribution by Tool
          </h2>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={confidenceDistribution}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="tool" />
              <YAxis
                label={{ value: 'Count', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip />
              <Legend />
              <Bar
                dataKey="excellent"
                stackId="a"
                fill="#22c55e"
                name="Excellent (≥95%)"
              />
              <Bar
                dataKey="good"
                stackId="a"
                fill="#eab308"
                name="Good (85-95%)"
              />
              <Bar
                dataKey="medium"
                stackId="a"
                fill="#f97316"
                name="Medium (75-85%)"
              />
              <Bar dataKey="low" stackId="a" fill="#ef4444" name="Low (<75%)" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Gemini Update Statistics */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">
            Gemini Update Statistics
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Update Count */}
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={geminiUpdateStats}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="tool" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar
                  dataKey="geminiUpdates"
                  fill="#8b5cf6"
                  name="Gemini Updates"
                />
                <Bar
                  dataKey="lowConfidence"
                  fill="#ef4444"
                  name="Low Confidence Regions"
                />
              </BarChart>
            </ResponsiveContainer>

            {/* Update Rate */}
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={geminiUpdateStats}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="tool" />
                <YAxis
                  label={{
                    value: 'Update Rate (%)',
                    angle: -90,
                    position: 'insideLeft',
                  }}
                />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="updateRate"
                  stroke="#8b5cf6"
                  name="Gemini Update Rate (%)"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Detailed Comparison Table */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Detailed Comparison</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Tool</th>
                  <th className="px-4 py-3 text-right font-semibold">
                    Processing Time
                  </th>
                  <th className="px-4 py-3 text-right font-semibold">
                    API Cost
                  </th>
                  <th className="px-4 py-3 text-right font-semibold">BBoxes</th>
                  <th className="px-4 py-3 text-right font-semibold">
                    Low Confidence
                  </th>
                  <th className="px-4 py-3 text-right font-semibold">
                    Gemini Updates
                  </th>
                  <th className="px-4 py-3 text-right font-semibold">
                    Update Rate
                  </th>
                  {accuracyData.length > 0 && (
                    <>
                      <th className="px-4 py-3 text-right font-semibold">
                        CER
                      </th>
                      <th className="px-4 py-3 text-right font-semibold">
                        WER
                      </th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y">
                {tools.map((tool, idx) => {
                  const stats = geminiUpdateStats[idx];
                  const accuracy = accuracyData.find((a) => a?.tool === tool);
                  const result = resultsByTool[tool];

                  return (
                    <tr
                      key={`stats-${tool}-${idx}`}
                      className="hover:bg-gray-50"
                    >
                      <td className="px-4 py-3 font-medium">{tool}</td>
                      <td className="px-4 py-3 text-right">
                        {result?.processingTimeMs || 0}ms
                      </td>
                      <td className="px-4 py-3 text-right">
                        ¥{(result?.apiCost || 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {stats.totalBboxes}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {stats.lowConfidence}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {stats.geminiUpdates}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {stats.updateRate.toFixed(1)}%
                      </td>
                      {accuracyData.length > 0 && (
                        <>
                          <td className="px-4 py-3 text-right">
                            {accuracy?.cer
                              ? `${accuracy.cer.toFixed(2)}%`
                              : 'N/A'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {accuracy?.wer
                              ? `${accuracy.wer.toFixed(2)}%`
                              : 'N/A'}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
