import { useState, useCallback, useEffect, useRef } from 'react';
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

  // Track refs to detect actual changes and avoid infinite loops
  const changesRef = useRef<Map<string, BBoxChange>>(changes);
  const currentBBoxesRef = useRef<BoundingBox[]>(currentBBoxes);

  // Keep refs in sync with state
  useEffect(() => {
    changesRef.current = changes;
    currentBBoxesRef.current = currentBBoxes;
  }, [changes, currentBBoxes]);

  // Update current bboxes when initial data changes (only if no local changes exist)
  useEffect(() => {
    // Only sync if there are no pending changes and arrays are actually different
    if (changesRef.current.size === 0 && currentBBoxesRef.current !== initialBBoxes) {
      setCurrentBBoxes(initialBBoxes);
    }
  }, [initialBBoxes]);

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

    setChanges((prevChanges) => {
      const newChanges = new Map(prevChanges);
      newChanges.set(id, {
        type: 'add',
        bbox,
      });
      return newChanges;
    });

    setCurrentBBoxes((prev) => [...prev, bbox]);
  }, [getBBoxId]);

  const modifyBBox = useCallback((index: number, newBBox: BoundingBox) => {
    setCurrentBBoxes((prev) => {
      const currentBbox = prev[index];
      if (!currentBbox) return prev;

      const id = getBBoxId(currentBbox);
      const originalBbox = initialBBoxes[index];

      setChanges((prevChanges) => {
        const newChanges = new Map(prevChanges);

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

        return newChanges;
      });

      const updated = [...prev];
      updated[index] = newBBox;
      return updated;
    });
  }, [initialBBoxes, getBBoxId]);

  const deleteBBox = useCallback((index: number) => {
    setCurrentBBoxes((prev) => {
      const bbox = prev[index];
      if (!bbox) return prev;

      const id = getBBoxId(bbox);

      setChanges((prevChanges) => {
        const newChanges = new Map(prevChanges);

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

        return newChanges;
      });

      return prev.filter((_, i) => i !== index);
    });
  }, [initialBBoxes, getBBoxId]);

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
