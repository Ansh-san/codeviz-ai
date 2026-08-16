/**
 * ELK-based auto-layout utility for React Flow graphs
 *
 * Uses Eclipse Layout Kernel (elkjs) to compute hierarchical / nested layouts.
 * ELK natively understands parent-child nesting, so child nodes are placed
 * within their parent's bounds automatically — no manual position math needed.
 *
 * Reference: React Flow official "Elkjs Tree" example
 * https://reactflow.dev/examples/layout/elkjs
 */
import ELK from 'elkjs/lib/elk.bundled.js';

const elk = new ELK();

// Set to true temporarily to log ELK output to the browser console for verification.
// Flip back to false once confirmed.
const DEBUG_LAYOUT = false;

// Default sizes used when ELK needs a node footprint to work with.
// ELK will expand parent nodes to fit their children automatically.
const DEFAULT_NODE_WIDTH = 220;
const DEFAULT_NODE_HEIGHT = 120;

// ELK layout options applied to the root graph.
const ELK_OPTIONS = {
  'elk.algorithm': 'layered',
  'elk.direction': 'DOWN',
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
  // Generous padding so children are never flush with the parent border
  'elk.padding': '[top=60,left=20,bottom=24,right=20]',
  // Space between sibling nodes at the same level
  'elk.spacing.nodeNode': '40',
  // Space between layers (parent rows)
  'elk.layered.spacing.nodeNodeBetweenLayers': '80',
  // Edge routing within and between hierarchy levels
  'elk.edgeRouting': 'ORTHOGONAL',
};

/**
 * Build a map of childNodeId → parentNodeId.
 *
 * Supports two kinds of parent relationships:
 *   1. node.data.containingParent  — nested function inside another function/method
 *   2. node.data.containingClass   — method inside a class (matched by class label)
 *
 * @param {Array} nodes - Raw React Flow nodes from the parser
 * @returns {Object} { [childId]: parentId }
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
      // Explicit parent link (nested function / nested method)
      childToParent[node.id] = node.data.containingParent;
    } else if (
      node.type === 'functionNode' &&
      node.data.containingClass &&
      classLabelToId[node.data.containingClass]
    ) {
      // Method inside a class
      childToParent[node.id] = classLabelToId[node.data.containingClass];
    }
  });

  return childToParent;
}

/**
 * Convert React Flow nodes into the nested structure ELK expects.
 *
 * ELK requires children to be nested *inside* their parent node object,
 * not as flat siblings with a parentNode field. This function builds that
 * nested tree, grouping children under their parents recursively.
 *
 * @param {Array} rfNodes - React Flow nodes (may include hidden/collapsed ones)
 * @param {Object} childToParent - Map from buildParentChildMap
 * @param {Set} hiddenIds - IDs of nodes to exclude (collapsed children)
 * @returns {Array} Top-level ELK node objects (each may have .children)
 */
function buildElkNodes(rfNodes, childToParent, hiddenIds) {
  const elkNodeMap = {};

  // First pass: create ELK node stubs for every visible node
  rfNodes.forEach(node => {
    if (hiddenIds.has(node.id)) return;
    elkNodeMap[node.id] = {
      id: node.id,
      width: node.width || DEFAULT_NODE_WIDTH,
      height: node.height || DEFAULT_NODE_HEIGHT,
      children: [],
      // Preserve the original RF node for reconstruction later
      _rfNode: node,
    };
  });

  // Second pass: nest children inside their parents
  const topLevel = [];
  Object.values(elkNodeMap).forEach(elkNode => {
    const parentId = childToParent[elkNode.id];
    if (parentId && elkNodeMap[parentId]) {
      elkNodeMap[parentId].children.push(elkNode);
    } else {
      topLevel.push(elkNode);
    }
  });

  // Prune empty children arrays (ELK prefers them absent for leaf nodes)
  function pruneChildren(elkNode) {
    if (elkNode.children.length === 0) {
      delete elkNode.children;
    } else {
      elkNode.children.forEach(pruneChildren);
    }
    return elkNode;
  }
  topLevel.forEach(pruneChildren);

  return topLevel;
}

/**
 * Convert React Flow edges into the format ELK expects.
 *
 * ELK uses `sources` and `targets` arrays (not `source`/`target`).
 * Membership edges are filtered out — containment is expressed via nesting,
 * not via edges, in the ELK model.
 *
 * @param {Array} rfEdges - React Flow edges
 * @param {Set} hiddenIds - IDs to exclude
 * @returns {Array} ELK-format edges
 */
function buildElkEdges(rfEdges, hiddenIds) {
  const seen = new Set();
  return rfEdges
    .filter(e => {
      // Drop membership edges — ELK nesting replaces them visually
      if (e.data?.edgeType === 'membership') return false;
      // Drop edges to/from hidden (collapsed) nodes
      if (hiddenIds.has(e.source) || hiddenIds.has(e.target)) return false;
      // Drop self-loops (recursive call self-edges are flagged on the node)
      if (e.source === e.target) return false;
      return true;
    })
    .filter(e => {
      // Deduplicate by source→target pair
      const key = `${e.source}→${e.target}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(e => ({
      id: e.id,
      sources: [e.source],
      targets: [e.target],
    }));
}

/**
 * Walk ELK's nested result and reconstruct flat React Flow nodes with
 * absolute positions. ELK returns positions relative to the parent, but
 * React Flow's `parentNode` prop already handles that coordinate space
 * correctly when `extent: 'parent'` is set — so we can use ELK's x/y
 * directly as the React Flow position for child nodes.
 *
 * @param {Array} elkNodes - ELK result nodes (nested)
 * @param {Object} childToParent
 * @param {Object} collapsedState - { childCount, isCollapsed } keyed by nodeId
 * @param {string|null} parentId - parent RF nodeId (null for top-level)
 * @returns {Array} Flat array of positioned React Flow nodes
 */
function extractPositionedNodes(elkNodes, childToParent, collapsedState, parentId = null) {
  const result = [];

  (elkNodes || []).forEach(elkNode => {
    const rfNode = elkNode._rfNode;
    const state = collapsedState[rfNode.id] || {};
    const hasChildren = (elkNode.children?.length ?? 0) > 0;

    const positionedNode = {
      ...rfNode,
      position: { x: elkNode.x ?? 0, y: elkNode.y ?? 0 },
      draggable: true,
      hidden: false,
      // Set style dimensions on parent nodes so React Flow renders the container
      style: hasChildren
        ? { width: elkNode.width, height: elkNode.height }
        : rfNode.style,
      data: {
        ...rfNode.data,
        isCollapsed: state.isCollapsed || false,
        childCount: state.childCount || 0,
        isGroupParent: hasChildren || (state.isCollapsed && (state.childCount || 0) > 0),
      },
    };

    // Wire up parentNode for React Flow's sub-flow rendering
    if (parentId) {
      positionedNode.parentNode = parentId;
      positionedNode.extent = 'parent';
      // Do NOT set expandParent — ELK already sized the parent correctly
    }

    result.push(positionedNode);

    // Recurse into children
    if (elkNode.children?.length) {
      const childNodes = extractPositionedNodes(
        elkNode.children,
        childToParent,
        collapsedState,
        rfNode.id
      );
      result.push(...childNodes);
    }
  });

  return result;
}

/**
 * Main layout function — async, ELK-powered.
 *
 * Replaces the previous dagre-based implementation entirely. Supports:
 *   - Arbitrary nesting depth (class → method → nested fn)
 *   - Collapse/expand of any parent node
 *   - Cross-level call edges (ELK routes them automatically)
 *
 * @param {Array}  nodes        - Raw React Flow nodes from the parser
 * @param {Array}  edges        - Raw React Flow edges from the parser
 * @param {string} _direction   - Ignored (direction is set via ELK options above);
 *                                kept for API compatibility with old callers
 * @param {Set}    collapsedIds - Set of nodeIds that are currently collapsed
 * @returns {Promise<{ nodes: Array, edges: Array }>}
 */
export async function getLayoutedElements(nodes, edges, _direction = 'TB', collapsedIds = new Set()) {
  const childToParent = buildParentChildMap(nodes);

  // Work out which nodes are hidden (children of collapsed parents)
  const hiddenChildIds = new Set();
  Object.entries(childToParent).forEach(([childId, parentId]) => {
    if (collapsedIds.has(parentId)) {
      hiddenChildIds.add(childId);
    }
  });

  // Count total children (including hidden) per parent — needed for UI badges
  const childCountMap = {};
  Object.entries(childToParent).forEach(([childId, parentId]) => {
    childCountMap[parentId] = (childCountMap[parentId] || 0) + 1;
  });

  // Build the nested ELK graph
  const elkGraph = {
    id: 'root',
    layoutOptions: ELK_OPTIONS,
    children: buildElkNodes(nodes, childToParent, hiddenChildIds),
    edges: buildElkEdges(edges, hiddenChildIds),
  };

  // Run ELK layout
  const elkResult = await elk.layout(elkGraph);

  // ── Debug logging (remove / set DEBUG_LAYOUT=false when done) ──────────────
  if (DEBUG_LAYOUT) {
    const allElkNodes = elkResult.children || [];
    console.group('[ELK] Layout complete');
    console.log('Input node count:', nodes.length, '| ELK top-level nodes:', allElkNodes.length);
    const sample = allElkNodes.slice(0, 3);
    sample.forEach((n, i) => {
      console.log(
        `  node[${i}] id=${n.id}`,
        `x=${n.x?.toFixed(1)} y=${n.y?.toFixed(1)}`,
        `w=${n.width?.toFixed(1)} h=${n.height?.toFixed(1)}`,
        n.children?.length ? `children=${n.children.length}` : ''
      );
      (n.children || []).slice(0, 2).forEach((c, j) => {
        console.log(
          `    child[${j}] id=${c.id}`,
          `x=${c.x?.toFixed(1)} y=${c.y?.toFixed(1)}`,
          `w=${c.width?.toFixed(1)} h=${c.height?.toFixed(1)}`
        );
      });
    });
    console.groupEnd();
  }
  // ───────────────────────────────────────────────────────────────────────

  const collapsedState = {};
  nodes.forEach(n => {
    collapsedState[n.id] = {
      isCollapsed: collapsedIds.has(n.id),
      childCount: childCountMap[n.id] || 0,
    };
  });

  // Reconstruct flat React Flow nodes from ELK's nested result
  const positionedNodes = extractPositionedNodes(
    elkResult.children || [],
    childToParent,
    collapsedState,
    null
  );

  // Append hidden nodes (collapsed children) — React Flow needs them in the
  // array but with hidden: true so they don't render
  nodes.forEach(node => {
    if (hiddenChildIds.has(node.id)) {
      positionedNodes.push({
        ...node,
        hidden: true,
        draggable: true,
        parentNode: childToParent[node.id],
        extent: 'parent',
      });
    }
  });

  // Sort: parents must appear before their children in the RF nodes array
  positionedNodes.sort((a, b) => {
    const aHasParent = !!a.parentNode;
    const bHasParent = !!b.parentNode;
    if (aHasParent === bHasParent) return 0;
    return aHasParent ? 1 : -1; // parents (no parentNode) first
  });

  // Filter visible edges (membership already removed in buildElkEdges)
  const visibleEdges = edges.filter(e => {
    if (e.data?.edgeType === 'membership') return false;
    if (hiddenChildIds.has(e.source) || hiddenChildIds.has(e.target)) return false;
    return true;
  });

  return { nodes: positionedNodes, edges: visibleEdges };
}
