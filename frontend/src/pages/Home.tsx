import { useState } from 'react';
import { useTestRuns, useDeleteTestRun, useDeleteTestRuns } from '../api/queries';
import { TestRunCard } from '../components/TestRunCard';
import { ConfirmDeleteModal } from '../components/ConfirmDeleteModal';

export function Home() {
  const { data, isLoading, error } = useTestRuns();
  const deleteTestRun = useDeleteTestRun();
  const deleteTestRuns = useDeleteTestRuns();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCompleted, setFilterCompleted] = useState<
    'all' | 'completed' | 'in-progress'
  >('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTargets, setDeleteTargets] = useState<string[]>([]);

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
      run.drawings?.some((d) =>
        d.fileName.toLowerCase().includes(searchQuery.toLowerCase())
      ) ||
      run.tools.some((t) =>
        t.toLowerCase().includes(searchQuery.toLowerCase())
      );

    // Status filter
    const matchesStatus =
      filterCompleted === 'all' ||
      (filterCompleted === 'completed' && run.completed) ||
      (filterCompleted === 'in-progress' && !run.completed);

    return matchesSearch && matchesStatus;
  });

  // Handlers
  const handleSelect = (id: string, selected: boolean) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (selected) {
        newSet.add(id);
      } else {
        newSet.delete(id);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredRuns.length && filteredRuns.length > 0) {
      // Deselect all
      setSelectedIds(new Set());
    } else {
      // Select all filtered runs
      setSelectedIds(new Set(filteredRuns.map((run) => run.id)));
    }
  };

  const handleDeleteClick = (id: string) => {
    setDeleteTargets([id]);
    setDeleteModalOpen(true);
  };

  const handleBulkDeleteClick = () => {
    if (selectedIds.size === 0) return;
    setDeleteTargets(Array.from(selectedIds));
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    try {
      if (deleteTargets.length === 1) {
        await deleteTestRun.mutateAsync(deleteTargets[0]);
      } else {
        await deleteTestRuns.mutateAsync(deleteTargets);
      }
      // Clear selection and close modal
      setSelectedIds(new Set());
      setDeleteModalOpen(false);
      setDeleteTargets([]);
    } catch (error) {
      // Error is handled by React Query mutation
    }
  };

  const handleCloseModal = () => {
    if (!deleteTestRun.isPending && !deleteTestRuns.isPending) {
      setDeleteModalOpen(false);
      setDeleteTargets([]);
    }
  };

  const isDeleting = deleteTestRun.isPending || deleteTestRuns.isPending;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-8 py-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            OCR Test Runs
          </h1>
          <p className="text-gray-600">
            View and compare OCR test results chronologically. Click a test run
            to see detailed results.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="max-w-7xl mx-auto px-8 py-6">
        {/* Bulk Actions Bar */}
        {selectedIds.size > 0 && (
          <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-blue-900">
                {selectedIds.size} test run{selectedIds.size !== 1 ? 's' : ''}{' '}
                selected
              </span>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                Clear selection
              </button>
            </div>
            <button
              onClick={handleBulkDeleteClick}
              disabled={isDeleting}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <svg
                className="w-4 h-4"
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
              Delete Selected
            </button>
          </div>
        )}

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
            {/* Select All Button */}
            {filteredRuns.length > 0 && (
              <button
                onClick={handleSelectAll}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
              >
                {selectedIds.size === filteredRuns.length && filteredRuns.length > 0
                  ? 'Deselect All'
                  : 'Select All'}
              </button>
            )}
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
              isLatest={
                idx === 0 && filterCompleted === 'all' && searchQuery === ''
              }
              isSelected={selectedIds.has(testRun.id)}
              onSelect={handleSelect}
              onDelete={handleDeleteClick}
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

      {/* Delete Confirmation Modal */}
      <ConfirmDeleteModal
        isOpen={deleteModalOpen}
        onClose={handleCloseModal}
        onConfirm={handleConfirmDelete}
        testRunCount={deleteTargets.length}
        isDeleting={isDeleting}
      />
    </div>
  );
}
