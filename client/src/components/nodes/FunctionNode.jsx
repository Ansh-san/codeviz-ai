import { memo } from 'react';
import { Handle, Position } from 'reactflow';
import { Code2, Zap } from 'lucide-react';

const FunctionNode = memo(({ data, selected }) => {
  const isMethod = data.nodeType === 'method';
  const isImport = data.nodeType === 'import';

  const getBadgeColor = () => {
    if (isImport) return 'badge-import';
    if (isMethod) return 'badge-method';
    return 'badge-function';
  };

  const getBadgeLabel = () => {
    if (isImport) return 'import';
    if (isMethod) return 'method';
    return 'function';
  };

  return (
    <div className={`fn-node ${selected ? 'fn-node--selected' : ''} ${isImport ? 'fn-node--import' : ''}`}>
      <Handle type="target" position={Position.Top} className="node-handle node-handle--target" />

      <div className="fn-node__header">
        <div className="fn-node__icon">
          {isImport ? <Zap size={12} /> : <Code2 size={12} />}
        </div>
        <span className={`fn-node__badge ${getBadgeColor()}`}>{getBadgeLabel()}</span>
        {data.isRecursive && (
          <span className="fn-node__badge fn-node__badge--recursive" title="Function calls itself (self-loop)">
            <span className="recursive-icon">↺</span> recursive
          </span>
        )}
      </div>

      <div className="fn-node__title" title={data.label}>
        {data.label}
      </div>

      {data.params && data.params.length > 0 && (
        <div className="fn-node__params">
          ({data.params.slice(0, 3).join(', ')}{data.params.length > 3 ? ', ...' : ''})
        </div>
      )}

      {data.returnType && (
        <div className="fn-node__return">→ {data.returnType}</div>
      )}

      <div className="fn-node__footer">
        {data.containingClass && (
          <span className="fn-node__class-badge">in {data.containingClass}</span>
        )}
        <span className="fn-node__line">L{data.lineNumber}</span>
      </div>

      <Handle type="source" position={Position.Bottom} className="node-handle node-handle--source" />
    </div>
  );
});

FunctionNode.displayName = 'FunctionNode';
export default FunctionNode;
