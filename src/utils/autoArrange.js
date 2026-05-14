/**
 * Auto-arrange tables in a diagram using hierarchical/layered layout
 * Groups tables by relationship depth and arranges them in layers
 */

const TABLE_WIDTH = 150;
const TABLE_HEIGHT = 100;
const HORIZONTAL_SPACING = 200; // Space between tables horizontally
const VERTICAL_SPACING = 200; // Space between layers vertically
const PADDING = 50; // Padding from edges

/**
 * Build relationship graph from relationships
 */
function buildRelationshipGraph(tables, relationships) {
  const graph = new Map();
  
  tables.forEach(table => {
    if (!graph.has(table.id)) {
      graph.set(table.id, { incoming: new Set(), outgoing: new Set() });
    }
  });

  relationships.forEach(rel => {
    const start = graph.get(rel.startTableId) || { incoming: new Set(), outgoing: new Set() };
    const end = graph.get(rel.endTableId) || { incoming: new Set(), outgoing: new Set() };
    
    start.outgoing.add(rel.endTableId);
    end.incoming.add(rel.startTableId);
    
    graph.set(rel.startTableId, start);
    graph.set(rel.endTableId, end);
  });

  return graph;
}

/**
 * Calculate layer/depth for each table based on relationship distance
 */
function calculateLayers(tables, graph) {
  const layers = new Map(); // table.id -> layer number
  const visited = new Set();
  
  // Find root tables (tables with no incoming relationships or only self-references)
  const rootTables = tables.filter(t => {
    const info = graph.get(t.id);
    return info.incoming.size === 0;
  });

  // If no root tables, use tables with highest outgoing count
  if (rootTables.length === 0) {
    const sorted = tables.sort((a, b) => {
      const aOut = graph.get(a.id).outgoing.size;
      const bOut = graph.get(b.id).outgoing.size;
      return bOut - aOut;
    });
    rootTables.push(...sorted.slice(0, Math.max(1, Math.ceil(tables.length / 3))));
  }

  // BFS to assign layers
  const queue = [];
  rootTables.forEach(t => {
    layers.set(t.id, 0);
    queue.push(t.id);
    visited.add(t.id);
  });

  while (queue.length > 0) {
    const tableId = queue.shift();
    const currentLayer = layers.get(tableId);
    const info = graph.get(tableId);

    // Assign next layer to outgoing tables
    info.outgoing.forEach(nextId => {
      if (!visited.has(nextId)) {
        visited.add(nextId);
        const nextInfo = graph.get(nextId);
        const incomingLayers = Array.from(nextInfo.incoming)
          .map(id => layers.get(id) ?? -1)
          .filter(l => l >= 0);
        
        const nextLayer = Math.max(currentLayer + 1, ...incomingLayers.map(l => l + 1));
        layers.set(nextId, nextLayer);
        queue.push(nextId);
      }
    });
  }

  // Assign remaining unvisited tables to a layer based on their connections
  tables.forEach(t => {
    if (!layers.has(t.id)) {
      const info = graph.get(t.id);
      if (info.incoming.size > 0) {
        const maxIncomingLayer = Math.max(
          ...Array.from(info.incoming)
            .map(id => layers.get(id) ?? 0)
        );
        layers.set(t.id, maxIncomingLayer + 1);
      } else {
        layers.set(t.id, Math.max(...Array.from(layers.values()).filter(l => typeof l === 'number'), 0) + 1);
      }
    }
  });

  return layers;
}

/**
 * Organize tables by layer
 */
function organizeByLayers(tables, layers) {
  const layerGroups = new Map();
  
  tables.forEach(table => {
    const layer = layers.get(table.id) ?? 0;
    if (!layerGroups.has(layer)) {
      layerGroups.set(layer, []);
    }
    layerGroups.get(layer).push(table.id);
  });

  return layerGroups;
}

/**
 * Main function to calculate new positions for all tables using hierarchical layout
 * Respects locked tables and areas
 */
export function calculateAutoArrangePositions(tables, relationships, areas = []) {
  if (tables.length === 0) return new Map();

  // Separate locked and unlocked tables
  const unlockedTables = tables.filter(t => !t.locked);
  const lockedTables = tables.filter(t => t.locked);
  
  if (unlockedTables.length === 0) {
    return new Map(); // Nothing to arrange
  }

  // Build relationship graph
  const graph = buildRelationshipGraph(unlockedTables, relationships);

  // Calculate layers based on relationships
  const layers = calculateLayers(unlockedTables, graph);

  // Organize tables by layer
  const layerGroups = organizeByLayers(unlockedTables, layers);

  // Calculate positions for each layer
  const positions = new Map();
  let currentY = PADDING;
  const maxLayer = Math.max(...Array.from(layers.values()));

  for (let layerNum = 0; layerNum <= maxLayer; layerNum++) {
    const tableIds = layerGroups.get(layerNum) || [];
    
    if (tableIds.length === 0) continue;

    // Calculate horizontal spacing for this layer
    const layerWidth = tableIds.length * HORIZONTAL_SPACING;
    const startX = Math.max(PADDING, (1920 - layerWidth) / 2); // Center layer (assuming ~1920px width)

    // Position tables in this layer
    tableIds.forEach((tableId, index) => {
      const x = startX + index * HORIZONTAL_SPACING;
      const y = currentY;
      positions.set(tableId, { x, y });
    });

    // Move to next layer
    currentY += VERTICAL_SPACING;
  }

  // Keep locked tables in their original positions
  lockedTables.forEach(table => {
    positions.set(table.id, { x: table.x, y: table.y });
  });

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
