import { createContext } from "react";

export const IdContext = createContext({
  gistId: "",
  setGistId: () => {},
  version: "",
  setVersion: () => {},
  syncToServer: async () => {},
  createManualSnapshot: async () => {},
});