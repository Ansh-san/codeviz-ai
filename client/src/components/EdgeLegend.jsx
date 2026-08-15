import { useState, useMemo } from 'react';

/**
 * EdgeLegend — collapsible legend panel for the ReactFlow canvas.
 *
 * Shows only the edge types actually present in the current graph so it
 * never lists stale / irrelevant types. Collapses to a small pill to stay
 * out of the way on complex graphs.
 */

const EDGE_TYPE_META = {
  'membership': {
    label: 'Contains / nested',
    color: '#06b6d4',
    dash: false,
    desc: 'Class → method, or function → nested function'
  },
  'call': {
    label: 'Call',
    color: '#f59e0b',
    dash: false,
    desc: 'Function calls another function'
  },

  'inheritance': {
    label: 'Inherits',
    color: '#8b5cf6',
    dash: true,
    desc: 'Class inherits from another class'
  },
  'implementation': {
    label: 'Implements',
    color: '#a78bfa',
    dash: true,
    desc: 'Class implements an interface'
  },
  'import': {
    label: 'Import',
    color: '#7c3aed',
    dash: true,
    desc: 'Module import reference'
  },
  'cross-import': {
    label: 'Cross-file import',
    color: '#7c3aed',
    dash: true,
    desc: 'Import edge across files (repo view)'
  },
  'file-containment': {
    label: 'File contains',
    color: '#334155',
    dash: false,
    desc: 'File node → child definition'
  }
};

export default function EdgeLegend({ edges, nodes }) {
  const [collapsed, setCollapsed] = useState(false);

  // Derive the set of edge types actually in the current graph
  const presentTypes = useMemo(() => {
    const types = new Set();
    edges.forEach(e => {
      if (e.data?.edgeType) types.add(e.data.edgeType);
    });
    return types;
  }, [edges]);

  const hasRecursive = useMemo(() => {
    return nodes?.some(n => n.data?.isRecursive) || false;
  }, [nodes]);

  if (presentTypes.size === 0 && !hasRecursive) return null;

  return (
    <div className="edge-legend" role="complementary" aria-label="Edge type legend">
      <button
        className="edge-legend__toggle"
        onClick={() => setCollapsed(c => !c)}
        aria-expanded={!collapsed}
        title={collapsed ? 'Expand legend' : 'Collapse legend'}
      >
        <span className="edge-legend__toggle-icon">{collapsed ? '\u25b8' : '\u25be'}</span>
        Legend
      </button>

      {!collapsed && (
        <ul className="edge-legend__list" role="list">
          {Object.entries(EDGE_TYPE_META).map(([type, meta]) => {
            if (!presentTypes.has(type)) return null;
            return (
              <li key={type} className="edge-legend__item" title={meta.desc}>
                <span
                  className="edge-legend__swatch"
                  style={{
                    display: 'inline-block',
                    width: 28,
                    height: 0,
                    borderTop: `2px ${meta.dash ? 'dashed' : 'solid'} ${meta.color}`,
                    verticalAlign: 'middle',
                    flexShrink: 0
                  }}
                />
                <span className="edge-legend__label">{meta.label}</span>
              </li>
            );
          })}
          {hasRecursive && (
            <li key="recursive-badge" className="edge-legend__item" title="Function calls itself (self-loop)">
              <span className="fn-node__badge fn-node__badge--recursive" style={{ display: 'inline-block', margin: '0 8px 0 0', transform: 'scale(0.9)', transformOrigin: 'left' }}>
                <span className="recursive-icon">↺</span> recursive
              </span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
