import { cloneElement, createContext, isValidElement, useContext } from "react";

const ExtensionsContext = createContext({});

export function useExtensions() {
  return useContext(ExtensionsContext);
}

/** Renders an extension element; `props` are passed on to it. */
export function Slot({ name, props }) {
  const extensions = useExtensions();
  const element = extensions[name] ?? null;
  return props && isValidElement(element)
    ? cloneElement(element, props)
    : element;
}

export default ExtensionsContext;
