/**
 * Java AST Parser using regex-based analysis
 * Extracts classes, methods, interfaces, and their relationships from Java code
 */

let nodeIdCounter = 0;
const getId = () => `node_${nodeIdCounter++}`;

function parseJava(code) {
  nodeIdCounter = 0;
  const nodes = [];
  const edges = [];
  const lines = code.split('\n');

  const classMap = {};    // name -> nodeId
  const methodMap = {};   // name -> nodeId

  // ── Pass 1: Extract class and interface declarations ───────────────────────
  const classRegex = /^\s*(?:public\s+|private\s+|protected\s+)?(?:abstract\s+|final\s+)?(?:class|interface|enum)\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w,\s]+))?/;
  lines.forEach((line, idx) => {
    const match = classRegex.exec(line);
    if (match) {
      const className = match[1];
      const extendsClass = match[2] || null;
      const implementsList = match[3] ? match[3].split(',').map(s => s.trim()) : [];
      const isInterface = line.includes('interface');
      const isEnum = line.includes('enum');
      const nodeId = getId();
      classMap[className] = nodeId;

      // Count methods in block
      const startBrace = findOpenBrace(lines, idx);
      const endBrace = findClosingBrace(lines, startBrace);
      const bodyLines = lines.slice(startBrace + 1, endBrace);
      const methodCount = (bodyLines.join('\n').match(/(?:public|private|protected|static|void|\w+)\s+\w+\s*\([^)]*\)\s*\{/g) || []).length;

      nodes.push({
        id: nodeId,
        type: 'classNode',
        data: {
          label: className,
          nodeType: isInterface ? 'interface' : isEnum ? 'enum' : 'class',
          extendsClass,
          implementsList,
          methodCount,
          lineNumber: idx + 1,
          code: bodyLines.slice(0, 40).join('\n'),
          language: 'java'
        },
        position: { x: 0, y: 0 }
      });

      // Extends edge
      if (extendsClass && classMap[extendsClass]) {
        edges.push({
          id: `edge_${classMap[extendsClass]}_${nodeId}_extends`,
          source: classMap[extendsClass],
          target: nodeId,
          label: 'extends',
          type: 'smoothstep',
          style: { stroke: '#8b5cf6', strokeDasharray: '6 3' },
          markerEnd: { type: 'ArrowClosed', color: '#8b5cf6' },
          data: { edgeType: 'inheritance' }
        });
      }

      // Implements edges
      implementsList.forEach(iface => {
        if (classMap[iface]) {
          edges.push({
            id: `edge_${classMap[iface]}_${nodeId}_impl`,
            source: classMap[iface],
            target: nodeId,
            label: 'implements',
            type: 'smoothstep',
            style: { stroke: '#10b981', strokeDasharray: '4 2' },
            markerEnd: { type: 'ArrowClosed', color: '#10b981' },
            data: { edgeType: 'implementation' }
          });
        }
      });
    }
  });

  // ── Pass 2: Extract method declarations ───────────────────────────────────
  const methodRegex = /^\s*(?:@\w+\s*)*(?:public|private|protected|static|final|synchronized|abstract|native|\s)+\s+(\w+(?:<[^>]+>)?)\s+(\w+)\s*\(([^)]*)\)\s*(?:throws\s+[\w,\s]+)?\s*\{?/;
  lines.forEach((line, idx) => {
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) return;
    const match = methodRegex.exec(line);
    if (!match) return;
    const returnType = match[1];
    const methodName = match[2];
    // Skip keywords that look like methods
    if (['if', 'while', 'for', 'switch', 'catch', 'new', 'return', 'class'].includes(methodName)) return;
    if (returnType === 'class') return;

    const params = match[3].trim();
    const nodeId = getId();
    methodMap[methodName] = nodeId;

    // Find containing class
    let containingClass = null;
    const indent = line.length - line.trimStart().length;
    for (let i = idx - 1; i >= 0; i--) {
      const cMatch = classRegex.exec(lines[i]);
      if (cMatch) {
        const cIndent = lines[i].length - lines[i].trimStart().length;
        if (cIndent < indent) { containingClass = cMatch[1]; break; }
      }
    }

    // Extract method body
    const startBrace = line.includes('{') ? idx : findOpenBrace(lines, idx);
    const endBrace = startBrace >= 0 ? findClosingBrace(lines, startBrace) : idx + 5;
    const bodyLines = lines.slice(startBrace + 1, Math.min(endBrace, startBrace + 40));
    const paramList = params ? params.split(',').map(p => {
      const parts = p.trim().split(/\s+/);
      return parts[parts.length - 1];
    }).filter(Boolean) : [];

    nodes.push({
      id: nodeId,
      type: 'functionNode',
      data: {
        label: methodName,
        nodeType: 'method',
        returnType,
        params: paramList,
        containingClass,
        lineNumber: idx + 1,
        code: [line.trim(), ...bodyLines].join('\n'),
        language: 'java'
      },
      position: { x: 0, y: 0 }
    });

    // Class membership edge
    if (containingClass && classMap[containingClass]) {
      edges.push({
        id: `edge_${classMap[containingClass]}_${nodeId}_member`,
        source: classMap[containingClass],
        target: nodeId,
        label: 'contains',
        type: 'smoothstep',
        style: { stroke: '#06b6d4', strokeWidth: 1.5 },
        markerEnd: { type: 'ArrowClosed', color: '#06b6d4' },
        data: { edgeType: 'membership' }
      });
    }
  });

  // ── Pass 3: Extract method call edges ─────────────────────────────────────
  const callRegex = /(\w+)\s*\(/g;
  Object.entries(methodMap).forEach(([callerName, callerId]) => {
    const callerNode = nodes.find(n => n.id === callerId);
    if (!callerNode || !callerNode.data.code) return;
    let m;
    const seen = new Set();
    while ((m = callRegex.exec(callerNode.data.code)) !== null) {
      const callee = m[1];
      if (callee === callerName) continue;
      if (seen.has(callee)) continue;
      if (methodMap[callee] && methodMap[callee] !== callerId) {
        seen.add(callee);
        edges.push({
          id: `edge_${callerId}_${methodMap[callee]}_call`,
          source: callerId,
          target: methodMap[callee],
          label: 'calls',
          type: 'bezier',
          animated: true,
          style: { stroke: '#f59e0b', strokeWidth: 1.5 },
          markerEnd: { type: 'ArrowClosed', color: '#f59e0b' },
          data: { edgeType: 'call' }
        });
      }
    }
    callRegex.lastIndex = 0;
  });

  // ── Pass 4: Import statements ──────────────────────────────────────────────
  const importRegex = /^\s*import\s+([\w.]+);/;
  lines.forEach((line, idx) => {
    const match = importRegex.exec(line);
    if (match) {
      const parts = match[1].split('.');
      const shortName = parts[parts.length - 1];
      const nodeId = getId();
      nodes.push({
        id: nodeId,
        type: 'functionNode',
        data: {
          label: shortName,
          nodeType: 'import',
          params: [],
          lineNumber: idx + 1,
          code: line.trim(),
          language: 'java'
        },
        position: { x: 0, y: 0 }
      });
    }
  });

  return { nodes, edges };
}

function findOpenBrace(lines, startIdx) {
  for (let i = startIdx; i < lines.length && i < startIdx + 5; i++) {
    if (lines[i].includes('{')) return i;
  }
  return startIdx;
}

function findClosingBrace(lines, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '{') depth++;
      if (ch === '}') { depth--; if (depth === 0) return i; }
    }
  }
  return lines.length - 1;
}

module.exports = { parseJava };
