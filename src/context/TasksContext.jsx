import { createContext, useState } from "react";

export const TasksContext = createContext(null);

export default function TasksContextProvider({ children }) {
  const [tasks, setTasks] = useState([]);

  return (
    <TasksContext.Provider value={{ tasks, setTasks }}>
      {children}
    </TasksContext.Provider>
  );
}
