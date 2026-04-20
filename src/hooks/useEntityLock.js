import { useRef, useCallback } from "react";
import useCollaboration from "./useCollaboration";

/**
 * Hook that manages entity locking for collaborative editing.
 * Returns onFocus/onBlur handlers to wrap on input elements.
 * Locks the entity when any input gains focus, unlocks when all inputs blur
 * (with a small delay to allow tabbing between fields).
 */
export function useEntityLock(entityKey) {
  const collab = useCollaboration();
  const lockEntity = collab?.lockEntity;
  const unlockEntity = collab?.unlockEntity;
  const isLockedRef = useRef(false);
  const unlockTimerRef = useRef(null);

  const handleFocus = useCallback(() => {
    if (!lockEntity || !entityKey) return;
    // Cancel any pending unlock (user tabbed to another field in same entity)
    if (unlockTimerRef.current) {
      clearTimeout(unlockTimerRef.current);
      unlockTimerRef.current = null;
    }
    if (!isLockedRef.current) {
      lockEntity(entityKey);
      isLockedRef.current = true;
    }
  }, [lockEntity, entityKey]);

  const handleBlur = useCallback(() => {
    if (!unlockEntity || !entityKey) return;
    // Delay unlock to allow tabbing between fields
    unlockTimerRef.current = setTimeout(() => {
      if (isLockedRef.current) {
        unlockEntity(entityKey);
        isLockedRef.current = false;
      }
      unlockTimerRef.current = null;
    }, 200);
  }, [unlockEntity, entityKey]);

  return { handleFocus, handleBlur };
}
