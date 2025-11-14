import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow, format } from 'date-fns';
import type { TestRun } from '../types/api';
import { CheckmarkIcon } from './icons';
import { ConfidentialBadge } from './ConfidentialBadge';

interface TestRunCardProps {
  testRun: TestRun;
  isLatest?: boolean;
  isSelected?: boolean;
  onSelect?: (id: string, selected: boolean) => void;
  onDelete?: (id: string) => void;
}

const TOOL_COLORS: Record<string, string> = {
  // Pure OCR Processors
  'cloud-vision': 'bg-blue-100 text-blue-800 border-blue-300',
  'azure-layout': 'bg-cyan-100 text-cyan-800 border-cyan-300',
  'azure-read': 'bg-teal-100 text-teal-800 border-teal-300',
  'document-ai': 'bg-green-100 text-green-800 border-green-300',

  // AI-Only Processors
  'gemini-2.0-flash': 'bg-purple-100 text-purple-800 border-purple-300',
  gemini: 'bg-purple-100 text-purple-800 border-purple-300',
  'gemini-geometric': 'bg-violet-100 text-violet-800 border-violet-300',
  'gemini-coordinates': 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-300',
  'gemini-self-calibrating': 'bg-pink-100 text-pink-800 border-pink-300',

  // Hybrid Processors
  hybrid:
    'bg-gradient-to-r from-blue-100 to-purple-100 text-purple-800 border-purple-300',
  'cloud-vision-gemini-hybrid':
    'bg-gradient-to-r from-blue-100 to-purple-100 text-indigo-800 border-indigo-300',
  'azure-read-gemini-hybrid':
    'bg-gradient-to-r from-teal-100 to-purple-100 text-purple-800 border-purple-300',
  'azure-layout-gemini-hybrid':
    'bg-gradient-to-r from-cyan-100 to-purple-100 text-cyan-800 border-cyan-300',
  'document-ai-gemini-hybrid':
    'bg-gradient-to-r from-green-100 to-purple-100 text-green-800 border-green-300',
  'hybrid-cv-ai':
    'bg-gradient-to-r from-orange-100 to-purple-100 text-orange-800 border-orange-300',
};

export function TestRunCard({
  testRun,
  isLatest = false,
  isSelected = false,
  onSelect,
  onDelete,
}: TestRunCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  const startedAt = new Date(testRun.startedAt);
  const relativeTime = formatDistanceToNow(startedAt, { addSuffix: true });
  const dateOnly = format(startedAt, 'PPp'); // Shorter format

  const isComplete = testRun.completed;
  const hasDrawings = (testRun.drawings?.length || 0) > 0;
  const drawingName = testRun.drawings?.[0]?.fileName || 'Unknown drawing';

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    onSelect?.(testRun.id, e.target.checked);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDelete?.(testRun.id);
  };

  return (
    <Link to={`/test-run/${testRun.id}`}>
      <div
        className={`bg-white rounded-lg shadow-md hover:shadow-xl transition-all duration-200 p-6 cursor-pointer border ${
          isSelected
            ? 'border-blue-500 ring-2 ring-blue-200'
            : 'border-gray-200 hover:border-blue-400'
        }`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-start gap-3 flex-1">
            {/* Checkbox */}
            {onSelect && (
              <div className="pt-1">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={handleCheckboxChange}
                  onClick={(e) => e.stopPropagation()}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                />
              </div>
            )}

            <div className="flex-1">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {/* Latest Badge */}
              {isLatest && (
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-500 text-white">
                  Latest
                </span>
              )}

              {/* Status Badge */}
              <span
                className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1 ${
                  isComplete
                    ? 'bg-green-100 text-green-800'
                    : 'bg-yellow-100 text-yellow-800'
                }`}
              >
                {isComplete && <CheckmarkIcon size={12} />}
                {isComplete ? 'Completed' : 'In Progress'}
              </span>

              {/* Confidential Badge */}
              {testRun.isConfidential && <ConfidentialBadge size="small" />}
            </div>

            {/* Full Timestamp - Prominently Displayed */}
            <div className="text-sm text-gray-700 font-medium mb-2">
              {dateOnly}
            </div>
            <div className="text-xs text-gray-500 mb-3">({relativeTime})</div>

            <h3 className="text-lg font-semibold text-gray-900">
              {drawingName}
            </h3>

            {hasDrawings && (
              <div className="flex items-center gap-2 mt-1 text-sm text-gray-600">
                <span>Type: {testRun.drawings![0].type}</span>
                <span>•</span>
                <span>Quality: {testRun.drawings![0].quality}</span>
              </div>
            )}
            </div>
          </div>

          {/* Delete Button */}
          {onDelete && (
            <button
              onClick={handleDelete}
              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Delete test run"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          )}
        </div>

        {/* Tools Section */}
        <div className="mb-4">
          <div className="text-xs font-medium text-gray-500 mb-2">
            OCR Tools ({testRun.tools.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {testRun.tools.map((tool) => (
              <span
                key={tool}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
                  TOOL_COLORS[tool] ||
                  'bg-gray-100 text-gray-800 border-gray-300'
                }`}
              >
                {tool}
              </span>
            ))}
          </div>
        </div>

        {/* Hover Expansion Panel */}
        {isHovered && isComplete && testRun.summary && (
          <div className="mt-4 pt-4 border-t border-gray-200 animate-fadeIn">
            <div className="grid grid-cols-2 gap-4 text-sm">
              {/* Quick Stats */}
              <div>
                <div className="text-xs font-medium text-gray-500 mb-2">
                  Processing Time
                </div>
                <div className="space-y-1">
                  {testRun.tools.slice(0, 2).map((tool) => {
                    const avgTime =
                      testRun.summary.avgProcessingTimeByTool[tool];
                    return avgTime ? (
                      <div key={tool} className="flex justify-between text-xs">
                        <span
                          className="text-gray-600 truncate max-w-[120px]"
                          title={tool}
                        >
                          {tool}
                        </span>
                        <span className="font-medium">
                          {avgTime.toFixed(0)}ms
                        </span>
                      </div>
                    ) : null;
                  })}
                  {testRun.tools.length > 2 && (
                    <div className="text-xs text-gray-400 italic">
                      +{testRun.tools.length - 2} more...
                    </div>
                  )}
                </div>
              </div>

              <div>
                <div className="text-xs font-medium text-gray-500 mb-2">
                  API Cost
                </div>
                <div className="space-y-1">
                  {testRun.tools.slice(0, 2).map((tool) => {
                    const cost = testRun.summary.totalCostByTool[tool];
                    return cost !== undefined ? (
                      <div key={tool} className="flex justify-between text-xs">
                        <span
                          className="text-gray-600 truncate max-w-[120px]"
                          title={tool}
                        >
                          {tool}
                        </span>
                        <span className="font-medium">¥{cost.toFixed(2)}</span>
                      </div>
                    ) : null;
                  })}
                  {testRun.tools.length > 2 && (
                    <div className="text-xs text-gray-400 italic">
                      +{testRun.tools.length - 2} more...
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Recommended Tool */}
            {testRun.summary.recommendedTool && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Best Overall:</span>
                  <span
                    className={`px-2 py-1 rounded text-xs font-semibold ${
                      TOOL_COLORS[testRun.summary.recommendedTool] ||
                      'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {testRun.summary.recommendedTool}
                  </span>
                </div>
              </div>
            )}

            {/* Test Run ID - For Debugging */}
            {isLatest && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <div className="text-xs text-gray-500">
                  <span className="font-medium">Latest Test Run</span>
                  <div
                    className="mt-1 text-gray-400 font-mono text-[10px] truncate"
                    title={testRun.id}
                  >
                    ID: {testRun.id.substring(0, 8)}...
                  </div>
                  <div className="mt-1 text-blue-600 font-medium flex items-center gap-1">
                    <CheckmarkIcon size={12} />
                    This run has bounding box data
                  </div>
                </div>
              </div>
            )}

            {/* View Details Button */}
            <div className="mt-4">
              <button className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
                View Detailed Results →
              </button>
            </div>
          </div>
        )}

        {/* Incomplete Test Run Message */}
        {isHovered && !isComplete && (
          <div className="mt-4 pt-4 border-t border-gray-200 animate-fadeIn">
            <div className="text-center text-sm text-gray-500 italic">
              Test run in progress...
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}
