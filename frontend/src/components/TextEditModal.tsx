import { useState, useEffect, useRef } from 'react';
import type { BoundingBox } from '../types/api';
import { getBoundingRect } from '../utils/bboxEditor';

interface TextEditModalProps {
  isOpen: boolean;
  bbox: BoundingBox | null;
  imageElement: HTMLImageElement | null;
  onSave: (newText: string) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

export function TextEditModal({
  isOpen,
  bbox,
  imageElement,
  onSave,
  onCancel,
  onDelete,
}: TextEditModalProps) {
  const [text, setText] = useState('');
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen && bbox) {
      setText(bbox.text || '');

      // Generate cropped preview if image is available
      if (imageElement && bbox.bounds.length > 0) {
        const rect = getBoundingRect(bbox.bounds);
        const padding = 10; // Add padding around the bbox

        // Create temporary canvas for cropping
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (ctx) {
          const cropWidth = rect.width + padding * 2;
          const cropHeight = rect.height + padding * 2;

          canvas.width = cropWidth;
          canvas.height = cropHeight;

          // Draw cropped image
          ctx.drawImage(
            imageElement,
            rect.minX - padding,
            rect.minY - padding,
            cropWidth,
            cropHeight,
            0,
            0,
            cropWidth,
            cropHeight
          );

          try {
            setPreviewImage(canvas.toDataURL());
          } catch (error) {
            // CORS error - image is from different origin without proper headers
            console.warn('Cannot generate preview: CORS restricted image', error);
            setPreviewImage(null);
          }
        }
      }

      // Focus input when modal opens
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 100);
    } else {
      setText('');
      setPreviewImage(null);
    }
  }, [isOpen, bbox]);

  const handleSave = () => {
    if (text.trim() === '') {
      const confirmed = confirm(
        'The text is empty. Are you sure you want to save an empty text value?'
      );
      if (!confirmed) return;
    }
    onSave(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleSave();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  if (!isOpen || !bbox) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Edit Text</h2>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          {/* Image Preview */}
          {previewImage && (
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm font-medium text-gray-700 mb-2">
                Preview
              </p>
              <img
                src={previewImage}
                alt="Bbox preview"
                className="max-w-full h-auto border border-gray-300 rounded"
              />
            </div>
          )}

          {/* Confidence indicator */}
          {bbox.confidence !== undefined && (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">
                Confidence:
              </span>
              <span
                className={`text-sm font-semibold ${
                  bbox.confidence < 0.85
                    ? 'text-orange-600'
                    : 'text-green-600'
                }`}
              >
                {(bbox.confidence * 100).toFixed(1)}%
              </span>
              {bbox.confidence < 0.85 && (
                <span className="text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded">
                  Low Confidence
                </span>
              )}
            </div>
          )}

          {/* Original text (if modified) */}
          {bbox.metadata?.originalText && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs font-medium text-blue-700 mb-1">
                Original Text:
              </p>
              <p className="text-sm text-blue-900">
                {bbox.metadata.originalText}
              </p>
              {bbox.metadata.updateReason && (
                <p className="text-xs text-blue-600 mt-1">
                  Reason: {bbox.metadata.updateReason}
                </p>
              )}
            </div>
          )}

          {/* Text input */}
          <div>
            <label
              htmlFor="bbox-text"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Text Content
            </label>
            <textarea
              id="bbox-text"
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
              rows={4}
              placeholder="Enter text content..."
            />
            <p className="mt-1 text-xs text-gray-500">
              Press Ctrl+Enter (Cmd+Enter on Mac) to save
            </p>
          </div>

          {/* Metadata info */}
          {bbox.metadata && (
            <div className="text-xs text-gray-600 space-y-1">
              {bbox.metadata.source && (
                <p>Source: {bbox.metadata.source}</p>
              )}
              {bbox.metadata.granularity && (
                <p>Granularity: {bbox.metadata.granularity}</p>
              )}
              {bbox.metadata.verified && (
                <p className="text-green-600 font-medium">
                  ✓ Verified by user
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-between">
          <div>
            {onDelete && (
              <button
                onClick={onDelete}
                className="px-4 py-2 text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-md transition-colors"
              >
                Delete BBox
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
