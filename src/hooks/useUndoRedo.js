import { useContext } from "react";
import {
  UndoRedoActionsContext,
  UndoRedoContext,
} from "../context/UndoRedoContext";

export default function useUndoRedo() {
  return useContext(UndoRedoContext);
}

/** setUndoStack and setRedoStack, without re-rendering on every edit. */
export function useUndoRedoActions() {
  return useContext(UndoRedoActionsContext);
}
