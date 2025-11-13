import { useState, useCallback } from 'react';
import type { BoundingBox } from '../types/api';
import { useEditMode } from './useEditMode';
import { useSaveCorrections } from '../api/queries';

/**
 * Hook to manage test run editing state and operations
 * Integrates with useEditMode and provides callbacks for canvas and sidebar
 */
export function useTestRunEditor(
  initialBBoxes: BoundingBox[],
  resultId: string | undefined
) {
  const editMode = useEditMode(initialBBoxes);
  const saveCorrections = useSaveCorrections();

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [isResizeMode, setIsResizeMode] = useState(false);
  const [resizingBBoxIndex, setResizingBBoxIndex] = useState<number | null>(null);

  // Open text edit modal for specific bbox
  const openEditModal = useCallback((index: number) => {
    setEditingIndex(index);
    setEditModalOpen(true);
  }, []);

  // Close text edit modal
  const closeEditModal = useCallback(() => {
    setEditModalOpen(false);
    setEditingIndex(null);
  }, []);

  // Save text from modal
  const handleSaveText = useCallback(
    (newText: string) => {
      if (editingIndex !== null) {
        const bbox = editMode.currentBBoxes[editingIndex];
        if (bbox) {
          const updatedBBox: BoundingBox = {
            ...bbox,
            text: newText,
            metadata: {
              ...bbox.metadata,
              ...(bbox.text !== newText && {
                originalText: bbox.metadata?.originalText || bbox.text,
              }),
            },
          };
          editMode.modifyBBox(editingIndex, updatedBBox);
        }
      }
      closeEditModal();
    },
    [editingIndex, editMode, closeEditModal]
  );

  // Delete bbox from modal
  const handleDeleteFromModal = useCallback(() => {
    if (editingIndex !== null) {
      editMode.deleteBBox(editingIndex);
      closeEditModal();
    }
  }, [editingIndex, editMode, closeEditModal]);

  // Handle new bbox creation
  const handleBBoxCreate = useCallback(
    (newBBox: BoundingBox) => {
      editMode.addBBox(newBBox);
      // Open modal to add text
      const newIndex = editMode.currentBBoxes.length;
      setTimeout(() => {
        openEditModal(newIndex);
      }, 100);
    },
    [editMode, openEditModal]
  );

  // Open save confirmation modal
  const handleSaveClick = useCallback(() => {
    if (editMode.isDirty) {
      setSaveModalOpen(true);
    }
  }, [editMode.isDirty]);

  // Confirm and execute save
  const handleConfirmSave = useCallback(async () => {
    if (!resultId) return;

    try {
      await saveCorrections.mutateAsync({
        resultId,
        corrections: editMode.changes,
      });

      // Clear changes after successful save
      editMode.clearChanges();
      setSaveModalOpen(false);
    } catch (error) {
      console.error('Failed to save corrections:', error);
      alert('Failed to save corrections. Please try again.');
    }
  }, [resultId, saveCorrections, editMode]);

  // Cancel save modal
  const handleCancelSave = useCallback(() => {
    setSaveModalOpen(false);
  }, []);

  // Discard all changes
  const handleDiscardChanges = useCallback(() => {
    if (
      confirm(
        'Are you sure you want to discard all changes? This cannot be undone.'
      )
    ) {
      editMode.discardChanges();
      editMode.setIsEditMode(false);
    }
  }, [editMode]);

  // Toggle resize mode for specific bbox
  const toggleResizeMode = useCallback((index: number) => {
    setResizingBBoxIndex((current) => {
      if (current === index) {
        // If clicking same bbox, exit resize mode
        setIsResizeMode(false);
        return null;
      } else {
        // Enter resize mode for this bbox
        setIsResizeMode(true);
        return index;
      }
    });
  }, []);

  // Exit resize mode when selection changes
  const exitResizeMode = useCallback(() => {
    setIsResizeMode(false);
    setResizingBBoxIndex(null);
  }, []);

  return {
    // Edit mode state
    ...editMode,

    // Modal state
    editModalOpen,
    editingIndex,
    saveModalOpen,

    // Resize mode state
    isResizeMode,
    resizingBBoxIndex,

    // Modal operations
    openEditModal,
    closeEditModal,
    handleSaveText,
    handleDeleteFromModal,

    // Canvas operations
    handleBBoxCreate,

    // Resize operations
    toggleResizeMode,
    exitResizeMode,

    // Save operations
    handleSaveClick,
    handleConfirmSave,
    handleCancelSave,
    handleDiscardChanges,

    // Save mutation state
    isSaving: saveCorrections.isPending,
  };
}
