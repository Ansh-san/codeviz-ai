import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  X, Copy, Check, Bot, AlertTriangle, Code2, Sparkles,
  Zap, Lightbulb, ArrowRight, ArrowLeft, RefreshCw,
  CornerDownRight, Hash, Layers, GitBranch, FileCode
} from 'lucide-react';
import { useState, useMemo } from 'react';

export default function AIPanel({
  isOpen,
  onClose,
  selectedNode,
  analysis,
  loading,
  error,
  isMock,
  analysisMode,
  onModeChange,
  allNodes = [],
  allEdges = [],
}) {
  const [copied,       setCopied]       = useState(false);
  const [codeExpanded, setCodeExpanded] = useState(false);

  const handleCopy = async () => {
    if (analysis) {
      await navigator.clipboard.writeText(analysis);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // ── Derive call-context from edges ─────────────────────────────────────────
  const { callers, callees } = useMemo(() => {
    if (!selectedNode) return { callers: [], callees: [] };
    const id = selectedNode.id;
    const nodeById = Object.fromEntries(allNodes.map(n => [n.id, n]));
    const callers = allEdges
      .filter(e => e.target === id && e.data?.edgeType === 'call')
      .map(e => nodeById[e.source])
      .filter(Boolean);
    const callees = allEdges
      .filter(e => e.source === id && e.data?.edgeType === 'call')
      .map(e => nodeById[e.target])
      .filter(Boolean);
    return { callers, callees };
  }, [selectedNode, allNodes, allEdges]);

  // ── Derived node stats ──────────────────────────────────────────────────────
  const lineCount = useMemo(() => {
    if (!selectedNode?.data?.code) return null;
    return selectedNode.data.code.split('\n').length;
  }, [selectedNode]);

  if (!isOpen) return null;

  const data = selectedNode?.data || {};
  const isClass     = selectedNode?.type === 'classNode';
  const isRecursive = data.isRecursive;
  const params      = data.params || [];

  return (
    <div className={`ai-panel ${isOpen ? 'ai-panel--open' : ''}`}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="ai-panel__header">
        <div className="ai-panel__header-left">
          <div className={`ai-panel__icon ${isClass ? 'ai-panel__icon--class' : ''}`}>
            {isClass ? <Layers size={17} /> : <Code2 size={17} />}
          </div>
          <div className="ai-panel__header-info">
            <h2 className="ai-panel__title">Node Inspector</h2>
            {selectedNode && (
              <span className="ai-panel__subtitle">{data.label}</span>
            )}
          </div>
        </div>
        <div className="ai-panel__header-actions">
          {analysis && (
            <button className="ai-panel__action-btn" onClick={handleCopy} title="Copy analysis" id="btn-copy-analysis">
              {copied ? <Check size={15} /> : <Copy size={15} />}
            </button>
          )}
          <button className="ai-panel__close-btn" onClick={onClose} id="btn-close-ai-panel">
            <X size={16} />
          </button>
        </div>
      </div>

      {selectedNode ? (
        <div className="ai-panel__body">

          {/* ── Signature card ──────────────────────────────────────────────── */}
          <div className="inspector-card inspector-card--signature">
            <div className="inspector-card__label">
              <FileCode size={11} /> Signature
            </div>
            <div className="inspector-sig">
              <span className="sig-name">{data.label}</span>
              {params.length > 0 && (
                <>
                  <span className="sig-paren">(</span>
                  {params.map((p, i) => (
                    <span key={i}>
                      <span className="sig-param">{p}</span>
                      {i < params.length - 1 && <span className="sig-comma">, </span>}
                    </span>
                  ))}
                  <span className="sig-paren">)</span>
                </>
              )}
              {params.length === 0 && <span className="sig-paren">()</span>}
              {data.returnType && (
                <>
                  <span className="sig-arrow"> → </span>
                  <span className="sig-return">{data.returnType}</span>
                </>
              )}
            </div>
          </div>

          {/* ── Metadata chips ──────────────────────────────────────────────── */}
          <div className="inspector-chips">
            <span className={`inspector-chip inspector-chip--type ${isClass ? 'chip-class' : 'chip-fn'}`}>
              {isClass ? <Layers size={10} /> : <Code2 size={10} />}
              {data.nodeType}
            </span>
            {data.language && (
              <span className="inspector-chip chip-lang">
                <Hash size={10} /> {data.language}
              </span>
            )}
            {data.lineNumber && (
              <span className="inspector-chip chip-line">
                <GitBranch size={10} /> L{data.lineNumber}
              </span>
            )}
            {lineCount && (
              <span className="inspector-chip chip-lines">
                {lineCount} lines
              </span>
            )}
            {isRecursive && (
              <span className="inspector-chip chip-recursive">
                <RefreshCw size={10} /> recursive
              </span>
            )}
            {data.containingClass && (
              <span className="inspector-chip chip-class-ref">
                in {data.containingClass}
              </span>
            )}
          </div>

          {/* ── Call context ────────────────────────────────────────────────── */}
          {(callers.length > 0 || callees.length > 0) && (
            <div className="inspector-card">
              <div className="inspector-card__label">
                <Zap size={11} /> Call Context
              </div>
              {callers.length > 0 && (
                <div className="call-ctx-row">
                  <span className="call-ctx-dir call-ctx-dir--in">
                    <ArrowLeft size={10} /> called by
                  </span>
                  <div className="call-ctx-nodes">
                    {callers.map(n => (
                      <span key={n.id} className="call-ctx-chip call-ctx-chip--caller">
                        {n.data.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {callees.length > 0 && (
                <div className="call-ctx-row">
                  <span className="call-ctx-dir call-ctx-dir--out">
                    <ArrowRight size={10} /> calls
                  </span>
                  <div className="call-ctx-nodes">
                    {callees.map(n => (
                      <span key={n.id} className="call-ctx-chip call-ctx-chip--callee">
                        {n.data.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Code snippet ─────────────────────────────────────────────────── */}
          {data.code && (
            <div className="inspector-card inspector-card--code">
              <div className="inspector-card__label" style={{ cursor: 'pointer' }} onClick={() => setCodeExpanded(v => !v)}>
                <Code2 size={11} /> Source Code
                <span className="code-toggle-hint">
                  {codeExpanded ? '▲ collapse' : '▼ expand'}
                </span>
              </div>
              <pre className={`inspector-code ${codeExpanded ? 'inspector-code--expanded' : ''}`}>
                <code>{data.code}</code>
              </pre>
            </div>
          )}

          {/* ── AI Mode toggle ──────────────────────────────────────────────── */}
          <div className="ai-panel__mode-toggle">
            <button
              className={`mode-btn ${analysisMode === 'tech' ? 'mode-btn--active' : ''}`}
              onClick={() => onModeChange('tech')}
              id="btn-mode-tech"
              title="Technical analysis: complexity, invariants, refactoring"
            >
              <Zap size={13} /> <span>Technical</span>
            </button>
            <button
              className={`mode-btn ${analysisMode === 'layman' ? 'mode-btn--active' : ''}`}
              onClick={() => onModeChange('layman')}
              id="btn-mode-layman"
              title="Plain English explanation with analogies"
            >
              <Lightbulb size={13} /> <span>Plain English</span>
            </button>
          </div>

          {/* ── AI Analysis ─────────────────────────────────────────────────── */}
          <div className="ai-panel__content">
            {loading && (
              <div className="ai-panel__loading">
                <div className="loading-pulse">
                  <Sparkles size={22} className="loading-icon" />
                  <p className="loading-text">
                    {analysisMode === 'layman'
                      ? 'Crafting a plain-English explanation...'
                      : 'Analyzing with CodeViz AI...'}
                  </p>
                  <div className="skeleton-lines">
                    {[100, 75, 88, 55, 80, 65].map((w, i) => (
                      <div key={i} className="skeleton-line" style={{ width: `${w}%` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {error && !loading && (
              <div className="ai-panel__error">
                <AlertTriangle size={18} />
                <p>{error}</p>
              </div>
            )}

            {analysis && !loading && (
              <>
                {isMock && (
                  <div className="ai-panel__mock-warning">
                    <AlertTriangle size={12} />
                    <span>Mock — add <code>GEMINI_API_KEY</code> for real AI</span>
                  </div>
                )}
                <div className="ai-panel__markdown">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{analysis}</ReactMarkdown>
                </div>
              </>
            )}

            {!loading && !error && !analysis && (
              <div className="ai-panel__placeholder">
                <Bot size={32} className="placeholder-icon" />
                <p>Select a mode above to get an AI explanation of <strong>{data.label}</strong></p>
              </div>
            )}
          </div>

        </div>
      ) : (
        /* No node selected yet */
        <div className="ai-panel__body">
          <div className="ai-panel__placeholder ai-panel__placeholder--centered">
            <Bot size={40} className="placeholder-icon" />
            <p>Click any node on the canvas</p>
            <p className="placeholder-sub">The camera will zoom to it and show its details here</p>
          </div>
        </div>
      )}
    </div>
  );
}
