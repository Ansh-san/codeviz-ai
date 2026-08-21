import { memo, useMemo } from 'react';
import { Handle, Position } from 'reactflow';
import { Code2, Zap, CornerDownRight, ArrowUpRight, RefreshCw } from 'lucide-react';

const FunctionNode = memo(({ data, selected }) => {
  const isMethod    = data.nodeType === 'method';
  const isImport    = data.nodeType === 'import';
  const isRecursive = data.isRecursive;

  // Derive line count from code
  const lineCount = useMemo(() => {
    if (!data.code) return null;
    return data.code.split('\n').length;
  }, [data.code]);

  const getBadgeClass = () => {
    if (isImport) return 'badge-import';
    if (isMethod) return 'badge-method';
    return 'badge-function';
  };

  const getBadgeLabel = () => {
    if (isImport) return 'import';
    if (isMethod) return 'method';
    return 'function';
  };

  // Show at most 4 params as chips, then +N more
  const params      = data.params || [];
  const shownParams = params.slice(0, 4);
  const extraParams = params.length - shownParams.length;

  return (
    <div className={`fn-node ${selected ? 'fn-node--selected' : ''} ${isImport ? 'fn-node--import' : ''} ${isRecursive ? 'fn-node--recursive' : ''}`}>
      <Handle type="target" position={Position.Top}    className="node-handle node-handle--target" />

      {/* Header row */}
      <div className="fn-node__header">
        <div className="fn-node__icon">
          {isImport ? <Zap size={12} /> : <Code2 size={12} />}
        </div>
        <span className={`fn-node__badge ${getBadgeClass()}`}>{getBadgeLabel()}</span>
        {isRecursive && (
          <span className="fn-node__badge fn-node__badge--recursive" title="Calls itself recursively">
            <RefreshCw size={9} className="recursive-spin" /> recursive
          </span>
        )}
        {lineCount && (
          <span className="fn-node__lines">{lineCount}L</span>
        )}
      </div>

      {/* Function name */}
      <div className="fn-node__title" title={data.label}>
        {data.label}
      </div>

      {/* Parameter chips */}
      {shownParams.length > 0 && (
        <div className="fn-node__params-row">
          {shownParams.map((p, i) => (
            <span key={i} className="fn-node__param-chip">{p}</span>
          ))}
          {extraParams > 0 && (
            <span className="fn-node__param-chip fn-node__param-chip--more">+{extraParams}</span>
          )}
        </div>
      )}

      {/* Return type */}
      {data.returnType && (
        <div className="fn-node__return">
          <CornerDownRight size={10} />
          <span>{data.returnType}</span>
        </div>
      )}

      {/* Footer */}
      <div className="fn-node__footer">
        <div className="fn-node__footer-left">
          {data.containingClass && (
            <span className="fn-node__class-badge">
              <ArrowUpRight size={9} />
              {data.containingClass}
            </span>
          )}
        </div>
        <span className="fn-node__line">L{data.lineNumber}</span>
      </div>

      <Handle type="source" position={Position.Bottom} className="node-handle node-handle--source" />
    </div>
  );
});

FunctionNode.displayName = 'FunctionNode';
export default FunctionNode;
