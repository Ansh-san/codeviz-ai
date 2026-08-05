import { memo } from 'react';
import { Handle, Position } from 'reactflow';
import { Box, GitBranch, Layers } from 'lucide-react';

const ClassNode = memo(({ data, selected }) => {
  const isInterface = data.nodeType === 'interface';
  const isEnum = data.nodeType === 'enum';

  const getTypeIcon = () => {
    if (isInterface) return <GitBranch size={13} />;
    if (isEnum) return <Layers size={13} />;
    return <Box size={13} />;
  };

  const getTypeLabel = () => {
    if (isInterface) return 'interface';
    if (isEnum) return 'enum';
    return 'class';
  };

  return (
    <div className={`cls-node ${selected ? 'cls-node--selected' : ''} ${isInterface ? 'cls-node--interface' : ''} ${isEnum ? 'cls-node--enum' : ''}`}>
      <Handle type="target" position={Position.Top} className="node-handle node-handle--target" />

      <div className="cls-node__header">
        <div className="cls-node__icon">{getTypeIcon()}</div>
        <span className="cls-node__type-badge">{getTypeLabel()}</span>
        {data.methodCount > 0 && (
          <span className="cls-node__method-count">{data.methodCount} methods</span>
        )}
      </div>

      <div className="cls-node__title" title={data.label}>
        {data.label}
      </div>

      {(data.parentClass || data.extendsClass) && (
        <div className="cls-node__extends">
          extends {data.parentClass || data.extendsClass}
        </div>
      )}

      {data.implementsList && data.implementsList.length > 0 && (
        <div className="cls-node__implements">
          implements {data.implementsList.join(', ')}
        </div>
      )}

      <div className="cls-node__footer">
        {data.language && <span className="cls-node__lang">{data.language}</span>}
        <span className="cls-node__line">L{data.lineNumber}</span>
      </div>

      <Handle type="source" position={Position.Bottom} className="node-handle node-handle--source" />
    </div>
  );
});

ClassNode.displayName = 'ClassNode';
export default ClassNode;
