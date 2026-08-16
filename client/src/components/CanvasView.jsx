import { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  addEdge,
  BackgroundVariant
} from 'reactflow';
import 'reactflow/dist/style.css';
import FunctionNode from './nodes/FunctionNode';
import ClassNode from './nodes/ClassNode';
import EdgeLegend from './EdgeLegend';
import { getLayoutedElements } from '../utils/layoutGraph';
import { GitBranch, LayoutGrid } from 'lucide-react';

const nodeTypes = {
  functionNode: FunctionNode,
  classNode: ClassNode
};

const edgeOptions = {
  animated: false,
  style: { stroke: '#475569', strokeWidth: 1.5 }
};

export default function CanvasView({ graphData, onNodeClick, selectedNodeId }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [collapsedIds, setCollapsedIds] = useState(new Set());
  const [hoveredNodeId, setHoveredNodeId] = useState(null);
  const { fitView } = useReactFlow();

  // Store raw graph data so we can re-layout on collapse toggle / re-layout button
  const rawDataRef = useRef({ nodes: [], edges: [] });

  // ── helpers ────────────────────────────────────────────────────────────────

  /**
   * Inject the toggle callback into class nodes and apply the selected-node class.
   * Returns a new array — does not mutate input.
   */
  const injectCallbacks = useCallback((rfNodes, toggleFn, currentSelectedId) => {
    return rfNodes.map(n => ({
      ...n,
      className: currentSelectedId === n.id ? 'selected-node' : '',
      data: n.type === 'classNode'
        ? { ...n.data, onToggleCollapse: toggleFn }
        : n.data,
    }));
  }, []);

  // ── Toggle collapse ────────────────────────────────────────────────────────

  // Forward-declared via ref so handleToggleCollapse can reference itself in
  // injectCallbacks without a stale-closure problem.
  const handleToggleCollapseRef = useRef(null);

  const handleToggleCollapse = useCallback(async (classNodeId) => {
    const next = new Set(collapsedIds);
    if (next.has(classNodeId)) {
      next.delete(classNodeId);
    } else {
      next.add(classNodeId);
    }
    setCollapsedIds(next);

    const { nodes: ln, edges: le } = await getLayoutedElements(
      rawDataRef.current.nodes,
      rawDataRef.current.edges,
      'TB',
      next
    );

    setNodes(injectCallbacks(ln, handleToggleCollapseRef.current, selectedNodeId));
    setEdges(le);
  }, [collapsedIds, selectedNodeId, injectCallbacks, setNodes, setEdges]);

  // Keep ref in sync
  handleToggleCollapseRef.current = handleToggleCollapse;

  // ── Load new graph data via useEffect (handles async ELK layout) ───────────

  useEffect(() => {
    if (!graphData) return;

    // Store raw data for re-layout on collapse / re-layout button
    rawDataRef.current = { nodes: graphData.nodes, edges: graphData.edges };

    // Reset collapse state whenever new graph data arrives
    setCollapsedIds(new Set());

    let cancelled = false;

    getLayoutedElements(graphData.nodes, graphData.edges, 'TB', new Set())
      .then(({ nodes: ln, edges: le }) => {
        if (cancelled) return;

        const visibleCount = ln.filter(n => !n.hidden).length;
        const fitPadding = visibleCount <= 3 ? 0.4 : 0.18;
        const fitMaxZoom = visibleCount <= 3 ? 0.9 : 1.5;

        setNodes(injectCallbacks(ln, handleToggleCollapseRef.current, selectedNodeId));
        setEdges(le);

        requestAnimationFrame(() => {
          if (!cancelled) {
            fitView({ padding: fitPadding, maxZoom: fitMaxZoom, duration: 350 });
          }
        });
      })
      .catch(err => {
        if (!cancelled) console.error('[ELK layout error]', err);
      });

    return () => { cancelled = true; };
    // selectedNodeId intentionally omitted — we re-apply it via injectCallbacks
    // inside the then() using the ref, so we don't need to re-run layout on click
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphData]);

  const onConnect = useCallback(
    params => setEdges(eds => addEdge({ ...params, animated: true }, eds)),
    [setEdges]
  );

  const handleNodeClick = useCallback((event, node) => {
    onNodeClick(node);
    setNodes(nds => nds.map(n => ({
      ...n,
      className: n.id === node.id ? 'selected-node' : ''
    })));
  }, [onNodeClick, setNodes]);

  // ── Re-layout button ───────────────────────────────────────────────────────

  const handleReLayout = useCallback(async () => {
    const { nodes: ln, edges: le } = await getLayoutedElements(
      rawDataRef.current.nodes,
      rawDataRef.current.edges,
      'TB',
      collapsedIds
    );

    setNodes(injectCallbacks(ln, handleToggleCollapseRef.current, selectedNodeId));
    setEdges(le);
  }, [collapsedIds, selectedNodeId, injectCallbacks, setNodes, setEdges]);

  // ── Hover highlighting logic ───────────────────────────────────────────────

  /**
   * Given a nodeId and current edges, return the set of directly connected node IDs
   * (including the hovered node itself).
   */
  const getConnectedIds = useCallback((nodeId, currentEdges) => {
    const connected = new Set([nodeId]);
    currentEdges.forEach(edge => {
      if (edge.source === nodeId) connected.add(edge.target);
      if (edge.target === nodeId) connected.add(edge.source);
    });
    return connected;
  }, []);

  const handleNodeMouseEnter = useCallback((_event, node) => {
    setHoveredNodeId(node.id);
  }, []);

  const handleNodeMouseLeave = useCallback(() => {
    setHoveredNodeId(null);
  }, []);

  // Compute highlighted nodes and styled edges based on hover state
  const { displayNodes, displayEdges } = useMemo(() => {
    if (!hoveredNodeId) {
      return { displayNodes: nodes, displayEdges: edges };
    }

    const connectedIds = getConnectedIds(hoveredNodeId, edges);

    const displayNodes = nodes.map(node => {
      const isConnected = connectedIds.has(node.id);
      const isHovered = node.id === hoveredNodeId;

      // Build className: preserve existing classes, add hover state
      const existingClass = node.className || '';
      const hoverClass = isHovered
        ? 'node--hovered'
        : isConnected
          ? 'node--connected'
          : 'node--dimmed';

      return {
        ...node,
        className: `${existingClass} ${hoverClass}`.trim()
      };
    });

    const displayEdges = edges.map(edge => {
      const isActiveEdge =
        (edge.source === hoveredNodeId || edge.target === hoveredNodeId);

      if (isActiveEdge) {
        // Determine accent color based on edge type
        let accentColor = '#67e8f9'; // cyan-light default
        if (edge.data?.edgeType === 'call') accentColor = '#fbbf24';           // amber
        if (edge.data?.edgeType === 'recursive-call') accentColor = '#fb923c'; // orange
        if (edge.data?.edgeType === 'inheritance') accentColor = '#a78bfa';    // violet

        return {
          ...edge,
          animated: true,
          className: 'edge--highlighted',
          style: {
            ...edge.style,
            stroke: accentColor,
            strokeWidth: 3,
            opacity: 1
          },
          markerEnd: edge.markerEnd
            ? { ...edge.markerEnd, color: accentColor }
            : edge.markerEnd
        };
      }

      return {
        ...edge,
        className: 'edge--dimmed',
        style: {
          ...edge.style,
          opacity: 0.12
        }
      };
    });

    return { displayNodes, displayEdges };
  }, [hoveredNodeId, nodes, edges, getConnectedIds]);

  const isEmpty = nodes.length === 0;
  // Count only what ReactFlow actually renders (not hidden nodes/membership edges)
  const visibleNodeCount = displayNodes.filter(n => !n.hidden).length;
  const visibleEdgeCount = displayEdges.length;

  return (
    <div className="canvas-container">
      {/* Canvas Toolbar */}
      <div className="canvas-toolbar">
        <div className="canvas-toolbar__left">
          <GitBranch size={14} className="canvas-toolbar__icon" />
          <span className="canvas-toolbar__label">
            {isEmpty ? 'Parse code to generate graph' : `${visibleNodeCount} nodes · ${visibleEdgeCount} edges`}
          </span>
        </div>
        <div className="canvas-toolbar__right">
          {!isEmpty && (
            <>
              <button
                className="canvas-btn"
                onClick={handleReLayout}
                title="Re-run auto layout"
                id="btn-relayout"
              >
                <LayoutGrid size={14} />
                Re-layout
              </button>
            </>
          )}
        </div>
      </div>

      {/* React Flow Canvas */}
      <ReactFlow
        nodes={displayNodes}
        edges={displayEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={handleNodeClick}
        onNodeMouseEnter={handleNodeMouseEnter}
        onNodeMouseLeave={handleNodeMouseLeave}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={edgeOptions}
        fitView
        fitViewOptions={{ padding: 0.15, maxZoom: 1.5 }}
        minZoom={0.1}
        maxZoom={3}
        attributionPosition="bottom-right"
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1.2}
          color="#1e293b"
        />
        <Controls
          className="canvas-controls"
          showInteractive={false}
        />
        <MiniMap
          className="canvas-minimap"
          nodeColor={node => {
            if (node.type === 'classNode') return '#0e7490';
            if (node.data?.nodeType === 'import') return '#7c3aed';
            return '#4338ca';
          }}
          maskColor="rgba(0,0,0,0.6)"
          style={{ background: '#0f172a', border: '1px solid #1e293b' }}
        />
      </ReactFlow>

      {/* Edge-type legend — bottom-left, only edge types present in current graph */}
      {!isEmpty && <EdgeLegend edges={edges} />}

      {/* Empty State */}
      {isEmpty && (
        <div className="canvas-empty">
          <div className="canvas-empty__content">
            <div className="canvas-empty__icon-wrap">
              <GitBranch size={48} />
            </div>
            <h3 className="canvas-empty__title">No Graph Yet</h3>
            <p className="canvas-empty__desc">
              Paste Python or Java code in the editor,<br />
              then click <strong>Parse Code</strong> to generate the AST graph.
            </p>
            <div className="canvas-empty__hints">
              <span className="hint-chip hint-chip--fn">⬡ Function nodes</span>
              <span className="hint-chip hint-chip--cls">⬡ Class nodes</span>
              <span className="hint-chip hint-chip--call">→ Call edges</span>
              <span className="hint-chip hint-chip--inherit">⤷ Inheritance edges</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
