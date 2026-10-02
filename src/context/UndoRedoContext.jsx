import { createContext, useMemo, useState } from "react";

export const UndoRedoContext = createContext({
  undoStack: [],
  setUndoStack: () => {},
  redoStack: [],
  setRedoStack: () => {},
});

// Just the setters, which never change: canvas objects that only record
// actions use this, so they don't re-render on every edit
export const UndoRedoActionsContext = createContext({
  setUndoStack: () => {},
  setRedoStack: () => {},
});

export default function UndoRedoContextProvider({ children }) {
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const actions = useMemo(() => ({ setUndoStack, setRedoStack }), []);

  return (
    <UndoRedoActionsContext.Provider value={actions}>
      <UndoRedoContext.Provider
        value={{ undoStack, redoStack, setUndoStack, setRedoStack }}
      >
        {children}
      </UndoRedoContext.Provider>
    </UndoRedoActionsContext.Provider>
  );
}
