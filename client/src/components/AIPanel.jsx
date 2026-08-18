import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { X, Copy, Check, Bot, AlertTriangle, Code2, Sparkles, Zap, Lightbulb } from 'lucide-react';
import { useState } from 'react';

export default function AIPanel({
  isOpen,
  onClose,
  selectedNode,
  analysis,
  loading,
  error,
  isMock,
  analysisMode,
  onModeChange
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (analysis) {
      await navigator.clipboard.writeText(analysis);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={`ai-panel ${isOpen ? 'ai-panel--open' : ''}`}>
      {/* Panel Header */}
      <div className="ai-panel__header">
        <div className="ai-panel__header-left">
          <div className="ai-panel__icon">
            <Bot size={18} />
          </div>
          <div className="ai-panel__header-info">
            <h2 className="ai-panel__title">AI Inspector</h2>
            {selectedNode && (
              <span className="ai-panel__subtitle">{selectedNode.data.label}</span>
            )}
          </div>
        </div>
        <div className="ai-panel__header-actions">
          {analysis && (
            <button
              className="ai-panel__action-btn"
              onClick={handleCopy}
              title="Copy analysis"
              id="btn-copy-analysis"
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
            </button>
          )}
          <button
            className="ai-panel__close-btn"
            onClick={onClose}
            id="btn-close-ai-panel"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Mode Toggle */}
      {selectedNode && (
        <div className="ai-panel__mode-toggle">
          <button
            className={`mode-btn ${analysisMode === 'tech' ? 'mode-btn--active' : ''}`}
            onClick={() => onModeChange('tech')}
            id="btn-mode-tech"
            title="Technical analysis with complexity, invariants, and refactoring"
          >
            <Zap size={13} />
            <span>Technical</span>
          </button>
          <button
            className={`mode-btn ${analysisMode === 'layman' ? 'mode-btn--active' : ''}`}
            onClick={() => onModeChange('layman')}
            id="btn-mode-layman"
            title="Plain English explanation with analogies"
          >
            <Lightbulb size={13} />
            <span>Plain English</span>
          </button>
        </div>
      )}

      {/* Selected Node Info */}
      {selectedNode && (
        <div className="ai-panel__node-info">
          <div className="node-info-row">
            <Code2 size={13} />
            <span className="node-info-label">Type:</span>
            <span className="node-info-value">{selectedNode.data.nodeType}</span>
          </div>
          {selectedNode.data.containingClass && (
            <div className="node-info-row">
              <span className="node-info-label">Class:</span>
              <span className="node-info-value">{selectedNode.data.containingClass}</span>
            </div>
          )}
          {selectedNode.data.params && selectedNode.data.params.length > 0 && (
            <div className="node-info-row">
              <span className="node-info-label">Params:</span>
              <span className="node-info-value">{selectedNode.data.params.join(', ')}</span>
            </div>
          )}
          <div className="node-info-row">
            <span className="node-info-label">Line:</span>
            <span className="node-info-value">{selectedNode.data.lineNumber}</span>
          </div>
        </div>
      )}

      {/* Code Snippet */}
      {selectedNode?.data.code && (
        <div className="ai-panel__code-snippet">
          <div className="snippet-header">
            <Code2 size={12} />
            <span>Code Snippet</span>
          </div>
          <pre className="snippet-body">
            <code>{selectedNode.data.code.slice(0, 500)}{selectedNode.data.code.length > 500 ? '\n...' : ''}</code>
          </pre>
        </div>
      )}

      {/* Analysis Content */}
      <div className="ai-panel__content">
        {loading && (
          <div className="ai-panel__loading">
            <div className="loading-pulse">
              <Sparkles size={24} className="loading-icon" />
              <p className="loading-text">
                {analysisMode === 'layman'
                  ? 'Crafting a plain-English explanation...'
                  : 'Analyzing with CodeViz AI...'}
              </p>
              <div className="skeleton-lines">
                {[100, 80, 90, 60, 85, 70].map((w, i) => (
                  <div key={i} className="skeleton-line" style={{ width: `${w}%` }} />
                ))}
              </div>
            </div>
          </div>
        )}

        {error && !loading && (
          <div className="ai-panel__error">
            <AlertTriangle size={20} />
            <p>{error}</p>
          </div>
        )}

        {analysis && !loading && (
          <>
            {isMock && (
              <div className="ai-panel__mock-warning">
                <AlertTriangle size={13} />
                <span>Mock analysis — add <code>GEMINI_API_KEY</code> for real AI insights</span>
              </div>
            )}
            <div className="ai-panel__markdown">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{analysis}</ReactMarkdown>
            </div>
          </>
        )}

        {!loading && !error && !analysis && selectedNode && (
          <div className="ai-panel__placeholder">
            <Bot size={36} className="placeholder-icon" />
            <p>Click <strong>Analyze</strong> below to inspect this {selectedNode.data.nodeType}</p>
          </div>
        )}

        {!selectedNode && !loading && (
          <div className="ai-panel__placeholder">
            <Bot size={36} className="placeholder-icon" />
            <p>Click any node on the canvas to inspect it with AI</p>
          </div>
        )}
      </div>
    </div>
  );
}
