import { createContext, useCallback, useRef, useState } from "react";

export const TransformContext = createContext(null);

// A function returning the current transform, which never changes: for code
// that reads it when acting (e.g. where to place a new table) and so needn't
// re-render on every pan and zoom
export const GetTransformContext = createContext(() => ({
  zoom: 1,
  pan: { x: 0, y: 0 },
}));

export default function TransformContextProvider({ children }) {
  const [transform, setTransformInternal] = useState({
    zoom: 1,
    pan: { x: 0, y: 0 },
  });
  const transformRef = useRef(transform);
  transformRef.current = transform;
  const getTransform = useCallback(() => transformRef.current, []);

  /**
   * @type {typeof DrawDB.TransformContext["setTransform"]}
   */
  const setTransform = useCallback(
    (actionOrValue) => {
      const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
      const findFirstNumber = (...values) =>
        values.find((value) => typeof value === "number" && !isNaN(value));

      setTransformInternal((prev) => {
        if (typeof actionOrValue === "function") {
          actionOrValue = actionOrValue(prev);
        }

        return {
          zoom: clamp(
            findFirstNumber(actionOrValue.zoom, prev.zoom, 1),
            0.02,
            5,
          ),
          pan: {
            x: findFirstNumber(actionOrValue.pan?.x, prev.pan?.x, 0),
            y: findFirstNumber(actionOrValue.pan?.y, prev.pan?.y, 0),
          },
        };
      });
    },
    [setTransformInternal],
  );

  return (
    <GetTransformContext.Provider value={getTransform}>
      <TransformContext.Provider value={{ transform, setTransform }}>
        {children}
      </TransformContext.Provider>
    </GetTransformContext.Provider>
  );
}
