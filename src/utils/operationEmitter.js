const listeners = new Set();

export const emitOperation = (op) => {
  listeners.forEach((fn) => fn(op));
};

export const onOperation = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
