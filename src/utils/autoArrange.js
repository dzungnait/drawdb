/**
 * Auto-arrange tables in a diagram using hierarchical/layered layout
 * Groups tables by relationship depth and arranges them in layers
 */

import { tableWidth as DEFAULT_TABLE_WIDTH, tableHeaderHeight, tableFieldHeight, tableColorStripHeight } from "../data/constants";

const H_GAP = 60;      // horizontal gap between tables
const V_GAP = 80;      // vertical gap between rows
const MAX_COLS = 5;    // max tables per row before wrapping
const START_X = 80;
const START_Y = 80;

/** Calculate the pixel height of a table based on its fields */
function calcTableHeight(table) {
  return tableHeaderHeight + tableColorStripHeight + table.fields.length * tableFieldHeight;
}

/**
 * Build adjacency graph: for each table, track incoming and outgoing FK connections
 */
function buildGraph(tables, relationships) {
  const graph = new Map();
  tables.forEach(t => graph.set(t.id, { incoming: new Set(), outgoing: new Set() }));

  relationships.forEach(rel => {
    if (graph.has(rel.startTableId) && graph.has(rel.endTableId)) {
      graph.get(rel.startTableId).outgoing.add(rel.endTableId);
      graph.get(rel.endTableId).incoming.add(rel.startTableId);
    }
  });

  return graph;
}

/**
 * Assign a topological "layer" (depth) to each table via BFS from roots.
 * Roots = tables with no incoming FK edges.
 */
function assignLayers(tables, graph) {
  const layers = new Map();

  // Seed roots: tables with no incoming edges
  let roots = tables.filter(t => graph.get(t.id).incoming.size === 0);

  // If every table is part of a cycle, pick most-connected tables as roots
  if (roots.length === 0) {
    const sorted = [...tables].sort(
      (a, b) => graph.get(b.id).outgoing.size - graph.get(a.id).outgoing.size
    );
    roots = sorted.slice(0, Math.max(1, Math.ceil(tables.length / 4)));
  }

  const queue = [];
  roots.forEach(t => {
    layers.set(t.id, 0);
    queue.push(t.id);
  });

  while (queue.length > 0) {
    const id = queue.shift();
    const layer = layers.get(id);
    graph.get(id).outgoing.forEach(childId => {
      const proposed = layer + 1;
      if (!layers.has(childId) || layers.get(childId) < proposed) {
        layers.set(childId, proposed);
        queue.push(childId);
      }
    });
  }

  // Place any remaining tables (from cycles not reachable from roots)
  tables.forEach(t => {
    if (!layers.has(t.id)) {
      const incoming = Array.from(graph.get(t.id).incoming);
      const maxIn = incoming.reduce((m, id) => Math.max(m, layers.get(id) ?? 0), 0);
      layers.set(t.id, maxIn + 1);
    }
  });

  return layers;
}

/**
 * Within a layer, sort tables so that those connected to the previous layer
 * appear close to their parents (reduces crossing lines).
 */
function sortLayerByConnections(tableIds, prevLayerPositions, graph) {
  return [...tableIds].sort((a, b) => {
    const aParents = Array.from(graph.get(a).incoming);
    const bParents = Array.from(graph.get(b).incoming);

    const aAvg = aParents.length
      ? aParents.reduce((s, id) => s + (prevLayerPositions.get(id) ?? 0), 0) / aParents.length
      : Infinity;
    const bAvg = bParents.length
      ? bParents.reduce((s, id) => s + (prevLayerPositions.get(id) ?? 0), 0) / bParents.length
      : Infinity;

    return aAvg - bAvg;
  });
}

/**
 * Main function to calculate new positions for all tables.
 * Uses a layered layout (top = roots, bottom = leaves) with:
 *  - max MAX_COLS tables per row (wraps to next row if more)
 *  - actual table heights for vertical spacing
 *  - connection-aware column ordering to reduce line crossings
 */
export function calculateAutoArrangePositions(tables, relationships, areas = []) {
  if (tables.length === 0) return new Map();

  const unlockedTables = tables.filter(t => !t.locked);
  const lockedTables = tables.filter(t => t.locked);
  if (unlockedTables.length === 0) return new Map();

  const tableMap = new Map(tables.map(t => [t.id, t]));
  const graph = buildGraph(unlockedTables, relationships);
  const layers = assignLayers(unlockedTables, graph);

  // Group table ids by layer number
  const layerGroups = new Map();
  unlockedTables.forEach(t => {
    const l = layers.get(t.id) ?? 0;
    if (!layerGroups.has(l)) layerGroups.set(l, []);
    layerGroups.get(l).push(t.id);
  });

  const positions = new Map();
  // Track x-index for each table (used for cross-reduction sorting)
  const colOrder = new Map(); // tableId -> x position
  let currentY = START_Y;
  const maxLayer = Math.max(...Array.from(layers.values()));

  for (let layerNum = 0; layerNum <= maxLayer; layerNum++) {
    let tableIds = layerGroups.get(layerNum) || [];
    if (tableIds.length === 0) continue;

    // Sort tables in this layer to reduce line crossings with prev layer
    const prevColOrder = layerNum > 0 ? colOrder : new Map();
    tableIds = sortLayerByConnections(tableIds, prevColOrder, graph);

    // Split into rows of MAX_COLS
    for (let rowStart = 0; rowStart < tableIds.length; rowStart += MAX_COLS) {
      const rowIds = tableIds.slice(rowStart, rowStart + MAX_COLS);

      // Height of this row = tallest table in it
      const rowHeight = rowIds.reduce((max, id) => {
        const t = tableMap.get(id);
        return Math.max(max, t ? calcTableHeight(t) : tableHeaderHeight + tableColorStripHeight);
      }, 0);

      rowIds.forEach((id, col) => {
        const x = START_X + col * (DEFAULT_TABLE_WIDTH + H_GAP);
        positions.set(id, { x, y: currentY });
        colOrder.set(id, x);
      });

      currentY += rowHeight + V_GAP;
    }
  }

  // Keep locked tables in their original positions
  lockedTables.forEach(t => positions.set(t.id, { x: t.x, y: t.y }));

  return positions;
}

/**
 * Convert position map to table updates
 */
export function generateTableUpdates(tables, positions) {
  const updates = [];
  
  tables.forEach(table => {
    const newPos = positions.get(table.id);
    if (newPos && (table.x !== newPos.x || table.y !== newPos.y)) {
      updates.push({
        id: table.id,
        updates: {
          x: Math.round(newPos.x),
          y: Math.round(newPos.y),
        },
      });
    }
  });

  return updates;
}
