/**
 * Auto-arrange tables in a diagram to minimize crossings and group related tables
 * Uses a simple force-directed layout approach
 */

const GRID_SIZE = 280; // Base spacing between tables
const PADDING = 50; // Padding from edges
const FORCE_STRENGTH = 0.5; // Force magnitude for repulsion
const ITERATIONS = 50; // Number of layout iterations

/**
 * Build adjacency map from relationships
 */
function buildAdjacencyMap(tables, relationships) {
  const map = new Map();
  
  tables.forEach(table => {
    if (!map.has(table.id)) {
      map.set(table.id, new Set());
    }
  });

  relationships.forEach(rel => {
    const startSet = map.get(rel.startTableId) || new Set();
    const endSet = map.get(rel.endTableId) || new Set();
    
    startSet.add(rel.endTableId);
    endSet.add(rel.startTableId);
    
    map.set(rel.startTableId, startSet);
    map.set(rel.endTableId, endSet);
  });

  return map;
}

/**
 * Find connected components (clusters of related tables)
 */
function findConnectedComponents(tables, adjacencyMap) {
  const visited = new Set();
  const components = [];

  tables.forEach(table => {
    if (!visited.has(table.id)) {
      const component = [];
      const queue = [table.id];

      while (queue.length > 0) {
        const tableId = queue.shift();
        if (visited.has(tableId)) continue;

        visited.add(tableId);
        component.push(tableId);

        const neighbors = adjacencyMap.get(tableId) || new Set();
        neighbors.forEach(neighborId => {
          if (!visited.has(neighborId)) {
            queue.push(neighborId);
          }
        });
      }

      components.push(component);
    }
  });

  return components;
}

/**
 * Calculate initial positions based on components
 */
function calculateInitialPositions(tableIds, componentIndex) {
  const positions = new Map();
  const tablesPerRow = Math.ceil(Math.sqrt(tableIds.length));
  
  tableIds.forEach((tableId, index) => {
    const row = Math.floor(index / tablesPerRow);
    const col = index % tablesPerRow;
    
    const x = PADDING + col * GRID_SIZE + componentIndex * (GRID_SIZE * tablesPerRow);
    const y = PADDING + row * GRID_SIZE;
    
    positions.set(tableId, { x, y });
  });

  return positions;
}

/**
 * Apply force-directed layout to minimize crossings
 */
function applyForceDirectedLayout(tables, adjacencyMap, initialPositions) {
  const positions = new Map(initialPositions);
  const velocity = new Map();
  const DAMPING = 0.85;
  const MIN_DISTANCE = 150;

  // Initialize velocities
  tables.forEach(table => {
    velocity.set(table.id, { vx: 0, vy: 0 });
  });

  // Iterate to find better layout
  for (let iter = 0; iter < ITERATIONS; iter++) {
    tables.forEach(table => {
      let fx = 0;
      let fy = 0;

      // Repulsive forces from all other tables
      tables.forEach(other => {
        if (table.id === other.id) return;

        const pos1 = positions.get(table.id);
        const pos2 = positions.get(other.id);
        
        const dx = pos1.x - pos2.x;
        const dy = pos1.y - pos2.y;
        const distance = Math.sqrt(dx * dx + dy * dy) || 1;
        
        if (distance < MIN_DISTANCE * 2) {
          const force = (MIN_DISTANCE - distance) * FORCE_STRENGTH;
          fx += (dx / distance) * force;
          fy += (dy / distance) * force;
        }
      });

      // Attractive forces to connected tables
      const neighbors = adjacencyMap.get(table.id) || new Set();
      neighbors.forEach(neighborId => {
        const pos1 = positions.get(table.id);
        const pos2 = positions.get(neighborId);
        
        const dx = pos2.x - pos1.x;
        const dy = pos2.y - pos1.y;
        const distance = Math.sqrt(dx * dx + dy * dy) || 1;
        
        const force = distance * 0.1;
        fx += (dx / distance) * force;
        fy += (dy / distance) * force;
      });

      // Update velocity and position
      let vel = velocity.get(table.id);
      vel.vx = (vel.vx + fx) * DAMPING;
      vel.vy = (vel.vy + fy) * DAMPING;

      const pos = positions.get(table.id);
      pos.x += vel.vx;
      pos.y += vel.vy;
      
      // Boundary constraints
      pos.x = Math.max(PADDING, pos.x);
      pos.y = Math.max(PADDING, pos.y);
    });
  }

  return positions;
}

/**
 * Main function to calculate new positions for all tables
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

  // Build adjacency map only for unlocked tables
  const adjacencyMap = buildAdjacencyMap(unlockedTables, relationships);

  // Find connected components
  const components = findConnectedComponents(unlockedTables, adjacencyMap);

  // Calculate positions for each component
  const positions = new Map();
  let componentIndex = 0;

  components.forEach(componentTableIds => {
    const initialPositions = calculateInitialPositions(componentTableIds, componentIndex);
    const optimizedPositions = applyForceDirectedLayout(
      unlockedTables.filter(t => componentTableIds.includes(t.id)),
      adjacencyMap,
      initialPositions
    );

    optimizedPositions.forEach((pos, tableId) => {
      positions.set(tableId, pos);
    });

    componentIndex++;
  });

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
