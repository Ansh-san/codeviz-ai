/**
 * Shared graph-node/edge types for CodeViz AI.
 *
 * These types describe the output contract of both parsers and are consumed
 * by every route that deals with graph data. Keep this file the single source
 * of truth for the graph schema — if you add a new field to a parser output,
 * add it here first.
 */

// ── Node Data ─────────────────────────────────────────────────────────────────

/** Fields shared by every node's `data` object. */
export interface BaseNodeData {
  label: string;
  nodeType: 'class' | 'interface' | 'enum' | 'function' | 'method' | 'constructor' | 'import' | 'file';
  code?: string;
  language?: string;
  lineNumber?: number;
}

/** Additional fields on class-like nodes. */
export interface ClassNodeData extends BaseNodeData {
  nodeType: 'class' | 'interface' | 'enum' | 'file';
  /** Python: first base class name */
  parentClass?: string | null;
  /** Java: extends target */
  extendsClass?: string | null;
  /** Java: implements list */
  implementsList?: string[];
  methodCount?: number;
  docstring?: string | null;
  /** Used by repo-level file nodes */
  filePath?: string;
}

/** Additional fields on function/method nodes. */
export interface FunctionNodeData extends BaseNodeData {
  nodeType: 'function' | 'method' | 'constructor' | 'import';
  params?: string[];
  returnType?: string | null;
  isAsync?: boolean;
  decorators?: string[];
  docstring?: string | null;
  containingClass?: string | null;
  /** Set when this function is nested inside another function (not a class method). */
  containingParent?: string | null;
}

export type NodeData = ClassNodeData | FunctionNodeData;

// ── Graph Nodes & Edges ───────────────────────────────────────────────────────

export interface GraphNode {
  id: string;
  /** 'classNode' renders with ClassNode component; 'functionNode' with FunctionNode */
  type: 'classNode' | 'functionNode';
  data: NodeData;
  position: { x: number; y: number };
}

export type EdgeType =
  | 'inheritance'
  | 'implementation'
  | 'membership'
  | 'call'
  | 'recursive-call'
  | 'import'
  | 'cross-import'
  | 'file-containment';

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  type: string;
  animated?: boolean;
  style?: Record<string, string | number>;
  markerEnd?: { type: string; color: string };
  data: { edgeType: EdgeType };
}

// ── Parser output ─────────────────────────────────────────────────────────────

export interface ParseResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ── Repo analysis ─────────────────────────────────────────────────────────────

export interface RepoStats {
  files: number;
  filesSkipped: number;
  nodes: number;
  edges: number;
  totalBytes: number;
  durationMs: number;
}

export interface RepoAnalysisResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: RepoStats;
}
