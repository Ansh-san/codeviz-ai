/**
 * Dagre auto-layout utility for React Flow graphs
 * Converts flat nodes+edges into positioned nodes with clean hierarchical layout
 */
import dagre from 'dagre';

const NODE_WIDTH = 220;
const NODE_HEIGHT = 120;

export function getLayoutedElements(nodes, edges, direction = 'TB') {
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

  // Add nodes to dagre
  nodes.forEach(node => {
    const w = node.type === 'classNode' ? 240 : NODE_WIDTH;
    const h = node.type === 'classNode' ? 140 : NODE_HEIGHT;
    dagreGraph.setNode(node.id, { width: w, height: h });
  });

  // Add edges to dagre (only valid edges)
  const nodeIds = new Set(nodes.map(n => n.id));
  edges.forEach(edge => {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
      dagreGraph.setEdge(edge.source, edge.target);
    }
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map(node => {
    const nodeWithPosition = dagreGraph.node(node.id);
    const w = node.type === 'classNode' ? 240 : NODE_WIDTH;
    const h = node.type === 'classNode' ? 140 : NODE_HEIGHT;
    return {
      ...node,
      position: {
        x: nodeWithPosition ? nodeWithPosition.x - w / 2 : Math.random() * 600,
        y: nodeWithPosition ? nodeWithPosition.y - h / 2 : Math.random() * 400
      },
      draggable: true
    };
  });

  return { nodes: layoutedNodes, edges };
}
