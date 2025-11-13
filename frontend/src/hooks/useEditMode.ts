import { useState, useCallback, useEffect } from 'react';
import type { BoundingBox } from '../types/api';

export type BBoxChange = {
  type: 'add' | 'modify' | 'delete';
  bbox: BoundingBox;
  originalBbox?: BoundingBox; // For modify/delete operations
};

export type EditModeState = {
  isEditMode: boolean;
  isDirty: boolean;
  changes: Map<string, BBoxChange>; // key is bbox ID (index or unique identifier)
  currentBBoxes: BoundingBox[];
};

export function useEditMode(initialBBoxes: BoundingBox[]) {
  const [isEditMode, setIsEditMode] = useState(false);
  const [changes, setChanges] = useState<Map<string, BBoxChange>>(new Map());
  const [currentBBoxes, setCurrentBBoxes] = useState<BoundingBox[]>(initialBBoxes);

  // Update current bboxes when initial data changes
  useEffect(() => {
    if (changes.size === 0) {
      setCurrentBBoxes(initialBBoxes);
    }
  }, [initialBBoxes, changes.size]);

  const isDirty = changes.size > 0;

  // Generate unique ID for bbox (using text + bounds as key)
  const getBBoxId = useCallback((bbox: BoundingBox): string => {
    return `${bbox.text}_${JSON.stringify(bbox.bounds)}`;
  }, []);

  const toggleEditMode = useCallback(() => {
    setIsEditMode((prev) => !prev);
  }, []);

  const addBBox = useCallback((bbox: BoundingBox) => {
    const id = getBBoxId(bbox);
    const newChanges = new Map(changes);

    newChanges.set(id, {
      type: 'add',
      bbox,
    });

    setChanges(newChanges);
    setCurrentBBoxes((prev) => [...prev, bbox]);
  }, [changes, getBBoxId]);

  const modifyBBox = useCallback((index: number, newBBox: BoundingBox) => {
    const originalBbox = initialBBoxes[index];
    const currentBbox = currentBBoxes[index];

    if (!currentBbox) return;

    const id = getBBoxId(currentBbox);
    const newChanges = new Map(changes);

    // Check if this was a newly added bbox
    const existingChange = newChanges.get(id);
    if (existingChange && existingChange.type === 'add') {
      // Update the added bbox
      newChanges.set(id, {
        type: 'add',
        bbox: newBBox,
      });
    } else {
      // Mark as modified
      newChanges.set(id, {
        type: 'modify',
        bbox: newBBox,
        originalBbox,
      });
    }

    setChanges(newChanges);
    setCurrentBBoxes((prev) => {
      const updated = [...prev];
      updated[index] = newBBox;
      return updated;
    });
  }, [initialBBoxes, currentBBoxes, changes, getBBoxId]);

  const deleteBBox = useCallback((index: number) => {
    const bbox = currentBBoxes[index];
    if (!bbox) return;

    const id = getBBoxId(bbox);
    const newChanges = new Map(changes);

    // Check if this was a newly added bbox
    const existingChange = newChanges.get(id);
    if (existingChange && existingChange.type === 'add') {
      // Just remove it from changes
      newChanges.delete(id);
    } else {
      // Mark as deleted
      newChanges.set(id, {
        type: 'delete',
        bbox,
        originalBbox: initialBBoxes[index],
      });
    }

    setChanges(newChanges);
    setCurrentBBoxes((prev) => prev.filter((_, i) => i !== index));
  }, [currentBBoxes, initialBBoxes, changes, getBBoxId]);

  const approveBBox = useCallback((index: number) => {
    const bbox = currentBBoxes[index];
    if (!bbox) return;

    // Mark bbox as verified (removes from low confidence queue)
    const approvedBBox: BoundingBox = {
      ...bbox,
      metadata: {
        ...bbox.metadata,
        verified: true,
      },
    };

    modifyBBox(index, approvedBBox);
  }, [currentBBoxes, modifyBBox]);

  const discardChanges = useCallback(() => {
    setChanges(new Map());
    setCurrentBBoxes(initialBBoxes);
  }, [initialBBoxes]);

  const getChangesArray = useCallback((): BBoxChange[] => {
    return Array.from(changes.values());
  }, [changes]);

  const clearChanges = useCallback(() => {
    setChanges(new Map());
  }, []);

  return {
    isEditMode,
    toggleEditMode,
    setIsEditMode,
    isDirty,
    changes: getChangesArray(),
    currentBBoxes,
    addBBox,
    modifyBBox,
    deleteBBox,
    approveBBox,
    discardChanges,
    clearChanges,
  };
}
