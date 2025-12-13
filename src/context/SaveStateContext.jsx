import { createContext, useState, useEffect } from "react";
import { State } from "../data/constants";

export const SaveStateContext = createContext(State.NONE);

export default function SaveStateContextProvider({ children }) {
  const [saveState, setSaveState] = useState(State.NONE);
  const [sessionId, setSessionId] = useState(null);

  // Generate and store sessionId on mount
  useEffect(() => {
    const storedSessionId = localStorage.getItem("drawdb-session-id");
    if (storedSessionId) {
      setSessionId(storedSessionId);
    } else {
      const newSessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem("drawdb-session-id", newSessionId);
      setSessionId(newSessionId);
    }
  }, []);

  return (
    <SaveStateContext.Provider value={{ saveState, setSaveState, sessionId }}>
      {children}
    </SaveStateContext.Provider>
  );
}
