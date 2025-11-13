import type { BBoxCorrection } from '../types/api';

interface SaveConfirmModalProps {
  isOpen: boolean;
  changes: BBoxCorrection[];
  onConfirm: () => void;
  onCancel: () => void;
  isSaving?: boolean;
}

export function SaveConfirmModal({
  isOpen,
  changes,
  onConfirm,
  onCancel,
  isSaving = false,
}: SaveConfirmModalProps) {
  if (!isOpen) return null;

  const addedCount = changes.filter((c) => c.type === 'add').length;
  const modifiedCount = changes.filter((c) => c.type === 'modify').length;
  const deletedCount = changes.filter((c) => c.type === 'delete').length;
  const totalChanges = changes.length;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            Save Changes?
          </h2>
        </div>

        {/* Body */}
        <div className="px-6 py-4">
          <p className="text-gray-700 mb-4">
            You have {totalChanges} unsaved change{totalChanges !== 1 ? 's' : ''}{' '}
            to this result:
          </p>

          <div className="space-y-2 bg-gray-50 rounded-lg p-4">
            {addedCount > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700">
                  Added bounding boxes:
                </span>
                <span className="text-sm font-semibold text-green-600">
                  {addedCount}
                </span>
              </div>
            )}
            {modifiedCount > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700">
                  Modified bounding boxes:
                </span>
                <span className="text-sm font-semibold text-blue-600">
                  {modifiedCount}
                </span>
              </div>
            )}
            {deletedCount > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700">
                  Deleted bounding boxes:
                </span>
                <span className="text-sm font-semibold text-red-600">
                  {deletedCount}
                </span>
              </div>
            )}
          </div>

          <p className="text-sm text-gray-600 mt-4">
            This will update the extraction result with your corrections.
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={isSaving}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isSaving}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSaving && (
              <svg
                className="animate-spin h-4 w-4 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
            )}
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
