import { memo } from 'react';
import { BaseEdge } from 'reactflow';

const SelfLoopEdge = memo(({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style = {},
  markerEnd,
  label,
  animated
}) => {
  // To make it look like a loop on the same node, we'll draw a bezier curve
  // that goes out to the right side of the node.
  // source is bottom center, target is top center.
  // We'll curve rightwards.
  
  const nodeWidth = 200; // rough width of fn node
  const controlPointOffset = 120;
  const loopWidth = 80;

  // Path: Start at bottom (source), curve down and right, up to the right side, curve up and left to top (target).
  const cp1X = sourceX + loopWidth;
  const cp1Y = sourceY + controlPointOffset;
  const cp2X = targetX + loopWidth;
  const cp2Y = targetY - controlPointOffset;

  const path = `M ${sourceX} ${sourceY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${targetX} ${targetY}`;

  // Approximate midpoint for label
  const labelX = sourceX + loopWidth - 10;
  const labelY = targetY + (sourceY - targetY) / 2;

  // Render BaseEdge to get the default React Flow path element styling (with hover effects, etc.)
  return (
    <>
      <BaseEdge
        path={path}
        markerEnd={markerEnd}
        style={style}
        className={animated ? 'animated' : ''}
      />
      {label && (
        <g transform={`translate(${labelX}, ${labelY})`}>
          <rect
            x={-35}
            y={-10}
            width={70}
            height={20}
            fill="#1e293b"
            rx={4}
            stroke={style.stroke || '#fbbf24'}
            strokeWidth={1}
          />
          <text
            x={0}
            y={4}
            fill={style.stroke || '#fbbf24'}
            textAnchor="middle"
            style={{ fontSize: 10, fontWeight: 600, fontFamily: 'monospace' }}
          >
            {label}
          </text>
        </g>
      )}
    </>
  );
});

SelfLoopEdge.displayName = 'SelfLoopEdge';
export default SelfLoopEdge;
