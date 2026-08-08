import { memo, useCallback } from 'react';
import { Handle, Position } from 'reactflow';
import { Box, GitBranch, Layers, ChevronDown, ChevronRight } from 'lucide-react';

const ClassNode = memo(({ data, selected, id }) => {
  const isInterface = data.nodeType === 'interface';
  const isEnum = data.nodeType === 'enum';
  const isGroupParent = data.isGroupParent;
  const isCollapsed = data.isCollapsed;
  const childCount = data.childCount || 0;

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

  const handleToggle = useCallback((e) => {
    e.stopPropagation();
    if (data.onToggleCollapse) {
      data.onToggleCollapse(id);
    }
  }, [data, id]);

  return (
    <div className={`cls-node ${selected ? 'cls-node--selected' : ''} ${isInterface ? 'cls-node--interface' : ''} ${isEnum ? 'cls-node--enum' : ''} ${isGroupParent ? 'cls-node--group' : ''} ${isCollapsed ? 'cls-node--collapsed' : ''}`}>
      <Handle type="target" position={Position.Top} className="node-handle node-handle--target" />

      <div className="cls-node__header">
        {childCount > 0 && (
          <button
            className="cls-node__toggle"
            onClick={handleToggle}
            title={isCollapsed ? 'Expand children' : 'Collapse children'}
            id={`toggle-${id}`}
          >
            {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </button>
        )}
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

      {isCollapsed && childCount > 0 && (
        <div className="cls-node__collapsed-badge">
          {childCount} {childCount === 1 ? 'member' : 'members'} hidden
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
