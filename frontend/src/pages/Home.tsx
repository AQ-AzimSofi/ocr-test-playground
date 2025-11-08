import { useState } from 'react';
import { useTestRuns } from '../api/queries';
import { TestRunCard } from '../components/TestRunCard';

export function Home() {
  const { data, isLoading, error } = useTestRuns();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCompleted, setFilterCompleted] = useState<'all' | 'completed' | 'in-progress'>('all');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg text-gray-600">Loading test runs...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg text-red-600">Error loading test runs</div>
      </div>
    );
  }

  const testRuns = data?.data || [];

  // Filter test runs
  const filteredRuns = testRuns.filter((run) => {
    // Search filter
    const matchesSearch =
      searchQuery === '' ||
      run.runName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      run.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      run.drawings?.some((d) => d.fileName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      run.tools.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));

    // Status filter
    const matchesStatus =
      filterCompleted === 'all' ||
      (filterCompleted === 'completed' && run.completed) ||
      (filterCompleted === 'in-progress' && !run.completed);

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-8 py-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">OCR Test Runs</h1>
          <p className="text-gray-600">
            View and compare OCR test results chronologically. Click a test run to see detailed results.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="max-w-7xl mx-auto px-8 py-6">
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          {/* Search */}
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search by drawing name, tool, or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Status Filter */}
          <div className="flex gap-2">
            <button
              onClick={() => setFilterCompleted('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filterCompleted === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              All ({testRuns.length})
            </button>
            <button
              onClick={() => setFilterCompleted('completed')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filterCompleted === 'completed'
                  ? 'bg-green-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              Completed ({testRuns.filter((r) => r.completed).length})
            </button>
            <button
              onClick={() => setFilterCompleted('in-progress')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filterCompleted === 'in-progress'
                  ? 'bg-yellow-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              In Progress ({testRuns.filter((r) => !r.completed).length})
            </button>
          </div>
        </div>

        {/* Test Runs List */}
        <div className="space-y-4">
          {filteredRuns.map((testRun, idx) => (
            <TestRunCard
              key={testRun.id}
              testRun={testRun}
              isLatest={idx === 0 && filterCompleted === 'all' && searchQuery === ''}
            />
          ))}
        </div>

        {/* Empty State */}
        {filteredRuns.length === 0 && (
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <div className="text-gray-500 mb-4">
              {searchQuery || filterCompleted !== 'all' ? (
                <>No test runs found matching your filters</>
              ) : (
                <>No test runs yet. Run OCR tests to see results here.</>
              )}
            </div>
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setFilterCompleted('all');
                }}
                className="text-blue-600 hover:text-blue-700 text-sm font-medium"
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* Footer hint */}
        {testRuns.length > 0 && (
          <div className="mt-6 text-center text-sm text-gray-500">
            Tip: Hover over a test run to see detailed metrics
          </div>
        )}
      </div>
    </div>
  );
}
