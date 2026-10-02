/**
 * Changes to a diagram as small operations, so concurrent edits to
 * different things don't overwrite each other.
 *
 * A path walks the diagram: string segments are object keys, `{ i: id }`
 * picks the element with that id from an array of objects with ids
 * (tables, fields, relationships...). Anything else is replaced whole.
 *
 * Same algorithm as the server's src/collab/ops.ts; keep both in step.
 *
 * Operations:
 *   { t: "set", p, v }       set a value
 *   { t: "rm", p }           remove an object key
 *   { t: "ins", p, v, a }    insert v into the array at p, after id a (null: first)
 *   { t: "del", p, id }      remove the element with this id
 *   { t: "ord", p, ids }     reorder the elements
 */

const isObject = (v) =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const hasId = (v) =>
  isObject(v) && (typeof v.id === "string" || typeof v.id === "number");

const isIdArray = (v) => Array.isArray(v) && v.every(hasId);

export function equal(a, b) {
  if (a === b) return true;
  if (Array.isArray(a)) {
    return (
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((x, i) => equal(x, b[i]))
    );
  }
  if (isObject(a) && isObject(b)) {
    const ka = Object.keys(a).filter((k) => a[k] !== undefined);
    const kb = Object.keys(b).filter((k) => b[k] !== undefined);
    return ka.length === kb.length && ka.every((k) => equal(a[k], b[k]));
  }
  return false;
}

/** The operations that turn `a` into `b`. */
export function diff(a, b, path = [], ops = []) {
  if (equal(a, b)) return ops;

  if (isIdArray(a) && isIdArray(b)) {
    const before = new Map(a.map((x) => [x.id, x]));
    const after = new Set(b.map((x) => x.id));
    for (const x of a) {
      if (!after.has(x.id)) ops.push({ t: "del", p: path, id: x.id });
    }
    let previous = null;
    for (const x of b) {
      const old = before.get(x.id);
      if (old === undefined) ops.push({ t: "ins", p: path, v: x, a: previous });
      else diff(old, x, [...path, { i: x.id }], ops);
      previous = x.id;
    }
    const kept = a.map((x) => x.id).filter((id) => after.has(id));
    const keptAfter = b.map((x) => x.id).filter((id) => before.has(id));
    if (!equal(kept, keptAfter)) {
      ops.push({ t: "ord", p: path, ids: b.map((x) => x.id) });
    }
    return ops;
  }

  if (isObject(a) && isObject(b)) {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (b[key] === undefined) {
        if (a[key] !== undefined) ops.push({ t: "rm", p: [...path, key] });
      } else {
        diff(a[key], b[key], [...path, key], ops);
      }
    }
    return ops;
  }

  ops.push({ t: "set", p: path, v: b });
  return ops;
}

const NOT_FOUND = Symbol("not found");

function update(value, path, fn) {
  if (path.length === 0) return fn(value);
  const [head, ...rest] = path;
  if (typeof head === "string") {
    if (!isObject(value)) return NOT_FOUND;
    const next = update(value[head], rest, fn);
    return next === NOT_FOUND ? NOT_FOUND : { ...value, [head]: next };
  }
  if (!Array.isArray(value)) return NOT_FOUND;
  const index = value.findIndex((x) => hasId(x) && x.id === head.i);
  if (index === -1) return NOT_FOUND;
  const next = update(value[index], rest, fn);
  if (next === NOT_FOUND) return NOT_FOUND;
  const copy = value.slice();
  copy[index] = next;
  return copy;
}

function setIn(parent, key, value) {
  if (typeof key === "string") {
    return isObject(parent) ? { ...parent, [key]: value } : NOT_FOUND;
  }
  if (!Array.isArray(parent)) return NOT_FOUND;
  const index = parent.findIndex((x) => hasId(x) && x.id === key.i);
  if (index === -1) return NOT_FOUND;
  const copy = parent.slice();
  copy[index] = value;
  return copy;
}

function applyToArray(list, op) {
  const items = Array.isArray(list) ? list : list === undefined ? [] : null;
  if (!items) return NOT_FOUND;
  switch (op.t) {
    case "ins": {
      let item = op.v;
      if (items.some((x) => x.id === item.id)) {
        // Added by two people at once: index-like numeric ids (notes,
        // areas) take the next free number; string ids mean a replay
        if (typeof item.id !== "number") return NOT_FOUND;
        const max = Math.max(
          ...items.map((x) => (typeof x.id === "number" ? x.id : -1)),
        );
        item = { ...item, id: max + 1 };
      }
      const copy = items.slice();
      const at = op.a === null ? 0 : copy.findIndex((x) => x.id === op.a) + 1;
      copy.splice(op.a !== null && at === 0 ? copy.length : at, 0, item);
      return copy;
    }
    case "del": {
      const copy = items.filter((x) => x.id !== op.id);
      return copy.length === items.length ? NOT_FOUND : copy;
    }
    case "ord": {
      const rank = new Map(op.ids.map((id, i) => [id, i]));
      return items
        .map((x, i) => ({ x, key: rank.get(x.id) ?? op.ids.length + i }))
        .sort((p, q) => p.key - q.key)
        .map((p) => p.x);
    }
    default:
      return NOT_FOUND;
  }
}

/** Applies one operation; on things deleted meanwhile it does nothing. */
export function apply(state, op) {
  let result;
  if (op.t === "set") {
    result =
      op.p.length === 0
        ? op.v
        : update(state, op.p.slice(0, -1), (parent) =>
            setIn(parent, op.p[op.p.length - 1], op.v),
          );
  } else if (op.t === "rm") {
    result = update(state, op.p.slice(0, -1), (parent) => {
      const key = op.p[op.p.length - 1];
      if (!isObject(parent) || typeof key !== "string" || !(key in parent)) {
        return NOT_FOUND;
      }
      const copy = { ...parent };
      delete copy[key];
      return copy;
    });
  } else {
    result = update(state, op.p, (list) => applyToArray(list, op));
  }
  return result === NOT_FOUND ? state : result;
}

export const applyAll = (state, ops) =>
  ops.reduce((s, op) => apply(s, op), state);
