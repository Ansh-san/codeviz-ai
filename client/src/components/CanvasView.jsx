import { useCallback, useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  BackgroundVariant
} from 'reactflow';
import 'reactflow/dist/style.css';
import FunctionNode from './nodes/FunctionNode';
import ClassNode from './nodes/ClassNode';
import { getLayoutedElements } from '../utils/layoutGraph';
import { GitBranch, LayoutGrid, Maximize2 } from 'lucide-react';

const nodeTypes = {
  functionNode: FunctionNode,
  classNode: ClassNode
};

const edgeOptions = {
  animated: false,
  style: { stroke: '#475569', strokeWidth: 1.5 }
};

export default function CanvasView({ graphData, onNodeClick, selectedNodeId, onReLayout }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Apply new graph data when it changes
  const prevDataRef = useMemo(() => ({ data: null }), []);
  if (graphData && graphData !== prevDataRef.data) {
    prevDataRef.data = graphData;
    const { nodes: ln, edges: le } = getLayoutedElements(graphData.nodes, graphData.edges);
    // Use setTimeout to avoid React render-cycle warnings
    setTimeout(() => {
      setNodes(ln.map(n => ({
        ...n,
        className: selectedNodeId === n.id ? 'selected-node' : ''
      })));
      setEdges(le);
    }, 0);
  }

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

  const handleReLayout = useCallback(() => {
    setNodes(nds => {
      const { nodes: ln } = getLayoutedElements(nds, edges);
      return ln;
    });
  }, [edges]);

  const isEmpty = nodes.length === 0;

  return (
    <div className="canvas-container">
      {/* Canvas Toolbar */}
      <div className="canvas-toolbar">
        <div className="canvas-toolbar__left">
          <GitBranch size={14} className="canvas-toolbar__icon" />
          <span className="canvas-toolbar__label">
            {isEmpty ? 'Parse code to generate graph' : `${nodes.length} nodes · ${edges.length} edges`}
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
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={handleNodeClick}
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
