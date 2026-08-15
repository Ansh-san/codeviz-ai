/**
 * Dagre auto-layout utility for React Flow graphs
 * Converts flat nodes+edges into positioned nodes with clean hierarchical layout
 * Supports parent-child clustering and collapsible class groups
 */
import dagre from 'dagre';

const NODE_WIDTH = 220;
const NODE_HEIGHT = 120;
const CLASS_BASE_WIDTH = 280;
const CLASS_BASE_HEIGHT = 200;
const CHILD_PADDING_TOP = 60;
const CHILD_PADDING_X = 16;
const CHILD_SPACING_Y = 12;
const CHILD_NODE_HEIGHT = 100;

/**
 * Build a map of childNodeId → parentClassNodeId
 * by matching functionNode.data.containingClass to classNode.data.label
 */
export function buildParentChildMap(nodes) {
  const classLabelToId = {};
  const childToParent = {};

  // First pass: index class nodes by their label
  nodes.forEach(node => {
    if (node.type === 'classNode') {
      classLabelToId[node.data.label] = node.id;
    }
  });

  // Second pass: map children to parents
  nodes.forEach(node => {
    if (node.data.containingParent) {
      childToParent[node.id] = node.data.containingParent;
    } else if (
      node.type === 'functionNode' &&
      node.data.containingClass &&
      classLabelToId[node.data.containingClass]
    ) {
      childToParent[node.id] = classLabelToId[node.data.containingClass];
    }
  });

  return childToParent;
}

/**
 * Calculate the dimensions a class node needs based on its visible children count
 */
function getClassNodeDimensions(childCount) {
  if (childCount === 0) {
    return { width: 240, height: 140 };
  }
  const width = CLASS_BASE_WIDTH;
  const height = CHILD_PADDING_TOP + childCount * (CHILD_NODE_HEIGHT + CHILD_SPACING_Y) + 20;
  return { width, height: Math.max(CLASS_BASE_HEIGHT, height) };
}

/**
 * Main layout function with parent-child grouping and collapse support
 *
 * @param {Array} nodes - React Flow nodes
 * @param {Array} edges - React Flow edges
 * @param {string} direction - Dagre direction ('TB' | 'LR')
 * @param {Set} collapsedIds - Set of class node IDs that are collapsed
 * @returns {{ nodes: Array, edges: Array }}
 */
export function getLayoutedElements(nodes, edges, direction = 'TB', collapsedIds = new Set()) {
  const childToParent = buildParentChildMap(nodes);

  // Count visible children per class
  const childrenPerClass = {};
  Object.entries(childToParent).forEach(([childId, parentId]) => {
    if (!collapsedIds.has(parentId)) {
      childrenPerClass[parentId] = (childrenPerClass[parentId] || 0) + 1;
    }
  });

  // Filter out membership edges — visual containment replaces them
  const filteredEdges = edges.filter(e => e.data?.edgeType !== 'membership');

  // Determine which nodes are hidden (collapsed children)
  const hiddenChildIds = new Set();
  Object.entries(childToParent).forEach(([childId, parentId]) => {
    if (collapsedIds.has(parentId)) {
      hiddenChildIds.add(childId);
    }
  });

  // Separate parent (class) nodes and child nodes from top-level nodes
  const topLevelNodes = nodes.filter(n => !childToParent[n.id] || hiddenChildIds.has(n.id));
  const visibleChildNodes = nodes.filter(n => childToParent[n.id] && !hiddenChildIds.has(n.id));

  // Build dagre graph with only top-level + hidden-child-excluded nodes
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir: direction,
    nodesep: 60,
    ranksep: 100,
    edgesep: 20,
    marginx: 40,
    marginy: 40,
    acyclicer: 'greedy',
    ranker: 'network-simplex'
  });

  // Add top-level nodes to dagre (parents use dynamic sizing)
  topLevelNodes.forEach(node => {
    if (hiddenChildIds.has(node.id)) {
      // Hidden children are excluded from dagre entirely
      return;
    }
    let w, h;
    const count = childrenPerClass[node.id] || 0;
    if (node.type === 'classNode' || count > 0) {
      ({ width: w, height: h } = getClassNodeDimensions(count));
    } else {
      w = NODE_WIDTH;
      h = NODE_HEIGHT;
    }
    dagreGraph.setNode(node.id, { width: w, height: h });
  });

  // Add edges (only between visible top-level nodes)
  const visibleTopIds = new Set();
  topLevelNodes.forEach(n => {
    if (!hiddenChildIds.has(n.id)) visibleTopIds.add(n.id);
  });

  filteredEdges.forEach(edge => {
    // Map edges from children to their parent when child is visible inside a group
    let source = edge.source;
    let target = edge.target;

    // If source is a visible child, the edge still connects in dagre from the parent
    if (childToParent[source] && !hiddenChildIds.has(source)) {
      source = childToParent[source];
    }
    if (childToParent[target] && !hiddenChildIds.has(target)) {
      target = childToParent[target];
    }

    // Skip self-loops and hidden endpoints
    if (source === target) return;
    if (hiddenChildIds.has(edge.source) || hiddenChildIds.has(edge.target)) return;

    if (visibleTopIds.has(source) && visibleTopIds.has(target)) {
      try {
        dagreGraph.setEdge(source, target);
      } catch (_) {
        // Ignore duplicate edge errors
      }
    }
  });

  dagre.layout(dagreGraph);

  // Position top-level nodes using dagre output
  const positionedNodes = [];

  topLevelNodes.forEach(node => {
    if (hiddenChildIds.has(node.id)) {
      // Hidden child: mark hidden, keep original position
      positionedNodes.push({
        ...node,
        hidden: true,
        draggable: true
      });
      return;
    }

    const nodeWithPosition = dagreGraph.node(node.id);
    let w, h;
    const count = childrenPerClass[node.id] || 0;
    if (node.type === 'classNode' || count > 0) {
      ({ width: w, height: h } = getClassNodeDimensions(count));
    } else {
      w = NODE_WIDTH;
      h = NODE_HEIGHT;
    }

    const isGroupParent = (childrenPerClass[node.id] || 0) > 0;
    const isCollapsed = collapsedIds.has(node.id);
    const childCount = Object.values(childToParent).filter(pid => pid === node.id).length;

    positionedNodes.push({
      ...node,
      position: {
        x: nodeWithPosition ? nodeWithPosition.x - w / 2 : Math.random() * 600,
        y: nodeWithPosition ? nodeWithPosition.y - h / 2 : Math.random() * 400
      },
      draggable: true,
      hidden: false,
      style: isGroupParent ? { width: w, height: h } : undefined,
      data: {
        ...node.data,
        isCollapsed,
        childCount,
        isGroupParent: isGroupParent || (isCollapsed && childCount > 0)
      }
    });
  });

  // Position child nodes relative to their parent
  const childIndexPerParent = {};
  visibleChildNodes.forEach(node => {
    const parentId = childToParent[node.id];
    if (!childIndexPerParent[parentId]) childIndexPerParent[parentId] = 0;
    const idx = childIndexPerParent[parentId]++;

    positionedNodes.push({
      ...node,
      parentNode: parentId,
      extent: 'parent',
      expandParent: false,
      draggable: true,
      hidden: false,
      position: {
        x: CHILD_PADDING_X,
        y: CHILD_PADDING_TOP + idx * (CHILD_NODE_HEIGHT + CHILD_SPACING_Y)
      },
      style: { width: CLASS_BASE_WIDTH - CHILD_PADDING_X * 2 }
    });
  });

  // Filter edges: hide edges to/from hidden nodes
  const visibleEdges = filteredEdges.filter(edge => {
    return !hiddenChildIds.has(edge.source) && !hiddenChildIds.has(edge.target);
  });

  // Sort: parents must come before children in the array for React Flow
  positionedNodes.sort((a, b) => {
    const aIsParent = childrenPerClass[a.id] ? 1 : 0;
    const bIsParent = childrenPerClass[b.id] ? 1 : 0;
    if (aIsParent !== bIsParent) return bIsParent - aIsParent; // parents first
    if (a.parentNode && !b.parentNode) return 1;
    if (!a.parentNode && b.parentNode) return -1;
    return 0;
  });

  return { nodes: positionedNodes, edges: visibleEdges };
}
