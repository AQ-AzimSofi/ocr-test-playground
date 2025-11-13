import React, { useState } from 'react';
import type { MissingTextEntry } from '../types/api';

interface MissingTextPanelProps {
  missingTexts: MissingTextEntry[];
  onAdd: (text: string, notes?: string) => void;
  onDelete: (id: string) => void;
  disabled?: boolean;
}

export const MissingTextPanel: React.FC<MissingTextPanelProps> = ({
  missingTexts,
  onAdd,
  onDelete,
  disabled = false,
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [newText, setNewText] = useState('');
  const [newNotes, setNewNotes] = useState('');

  const handleAdd = () => {
    if (!newText.trim()) return;

    onAdd(newText.trim(), newNotes.trim() || undefined);
    setNewText('');
    setNewNotes('');
    setIsAdding(false);
  };

  const handleCancel = () => {
    setNewText('');
    setNewNotes('');
    setIsAdding(false);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">
          Missing Text ({missingTexts.length})
        </h3>
        {!isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            disabled={disabled}
            className="flex items-center gap-1 px-3 py-1 text-sm bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-300 text-white font-medium rounded transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Missing
          </button>
        )}
      </div>

      {/* Add Form */}
      {isAdding && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Text that should have been detected:
          </label>
          <input
            type="text"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="Enter the missing text..."
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded mb-2 focus:outline-none focus:ring-2 focus:ring-yellow-500"
            autoFocus
          />

          <label className="block text-xs font-medium text-gray-700 mb-1">
            Notes (optional):
          </label>
          <input
            type="text"
            value={newNotes}
            onChange={(e) => setNewNotes(e.target.value)}
            placeholder="Where was it located, why was it missed, etc."
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded mb-3 focus:outline-none focus:ring-2 focus:ring-yellow-500"
          />

          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={!newText.trim()}
              className="flex-1 px-3 py-1.5 text-sm bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-300 text-white font-medium rounded transition-colors"
            >
              Add
            </button>
            <button
              onClick={handleCancel}
              className="flex-1 px-3 py-1.5 text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium rounded transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Missing Text List */}
      {missingTexts.length === 0 ? (
        <p className="text-sm text-gray-500 italic py-2">
          No missing text entries yet. Click "Add Missing" to record text that wasn't detected.
        </p>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {missingTexts.map((entry) => (
            <div
              key={entry.id}
              className="p-3 bg-yellow-50 border border-yellow-200 rounded"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="font-medium text-sm text-gray-900 break-words">
                    "{entry.text}"
                  </div>
                  {entry.notes && (
                    <div className="text-xs text-gray-600 mt-1">
                      Note: {entry.notes}
                    </div>
                  )}
                  <div className="text-xs text-gray-500 mt-1">
                    Added: {new Date(entry.addedAt).toLocaleString()}
                  </div>
                </div>
                <button
                  onClick={() => onDelete(entry.id)}
                  disabled={disabled}
                  className="flex-shrink-0 p-1 text-red-600 hover:text-red-800 hover:bg-red-100 rounded transition-colors"
                  title="Delete this entry"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
