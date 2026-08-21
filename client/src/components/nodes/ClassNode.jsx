import { memo, useCallback } from 'react';
import { Handle, Position } from 'reactflow';
import { Box, GitBranch, Layers, ChevronDown, ChevronRight, Code2 } from 'lucide-react';

const ClassNode = memo(({ data, selected, id }) => {
  const isInterface  = data.nodeType === 'interface';
  const isEnum       = data.nodeType === 'enum';
  const isGroupParent = data.isGroupParent;
  const isCollapsed  = data.isCollapsed;
  const childCount   = data.childCount || 0;

  const getTypeIcon = () => {
    if (isInterface) return <GitBranch size={13} />;
    if (isEnum)      return <Layers size={13} />;
    return <Box size={13} />;
  };

  const getTypeLabel = () => {
    if (isInterface) return 'interface';
    if (isEnum)      return 'enum';
    return 'class';
  };

  const handleToggle = useCallback((e) => {
    e.stopPropagation();
    if (data.onToggleCollapse) data.onToggleCollapse(id);
  }, [data, id]);

  // Language color accents
  const langColor = data.language === 'java' ? '#f59e0b' : '#3b82f6';

  return (
    <div className={[
      'cls-node',
      selected      ? 'cls-node--selected'   : '',
      isInterface   ? 'cls-node--interface'  : '',
      isEnum        ? 'cls-node--enum'       : '',
      isGroupParent ? 'cls-node--group'      : '',
      isCollapsed   ? 'cls-node--collapsed'  : '',
    ].filter(Boolean).join(' ')}>
      <Handle type="target" position={Position.Top} className="node-handle node-handle--target" />

      {/* Header */}
      <div className="cls-node__header">
        {childCount > 0 && (
          <button
            className="cls-node__toggle"
            onClick={handleToggle}
            title={isCollapsed ? 'Expand' : 'Collapse'}
            id={`toggle-${id}`}
          >
            {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </button>
        )}
        <div className="cls-node__icon">{getTypeIcon()}</div>
        <span className="cls-node__type-badge">{getTypeLabel()}</span>

        <div className="cls-node__header-right">
          {data.language && (
            <span className="cls-node__lang-badge" style={{ color: langColor, borderColor: langColor }}>
              {data.language}
            </span>
          )}
          {childCount > 0 && (
            <span className="cls-node__method-count">
              <Code2 size={9} /> {childCount}
            </span>
          )}
        </div>
      </div>

      {/* Class name */}
      <div className="cls-node__title" title={data.label}>
        {data.label}
      </div>

      {/* Inheritance / implements */}
      {(data.parentClass || data.extendsClass) && (
        <div className="cls-node__relation cls-node__relation--extends">
          <GitBranch size={9} />
          <span>extends <strong>{data.parentClass || data.extendsClass}</strong></span>
        </div>
      )}
      {data.implementsList && data.implementsList.length > 0 && (
        <div className="cls-node__relation cls-node__relation--implements">
          <Layers size={9} />
          <span>implements <strong>{data.implementsList.join(', ')}</strong></span>
        </div>
      )}

      {/* Collapsed badge */}
      {isCollapsed && childCount > 0 && (
        <div className="cls-node__collapsed-badge">
          {childCount} {childCount === 1 ? 'member' : 'members'} hidden
        </div>
      )}

      {/* Footer */}
      <div className="cls-node__footer">
        <span className="cls-node__line">L{data.lineNumber}</span>
      </div>

      <Handle type="source" position={Position.Bottom} className="node-handle node-handle--source" />
    </div>
  );
});

ClassNode.displayName = 'ClassNode';
export default ClassNode;
