/**
 * Python AST Parser using regex-based analysis
 * Extracts functions, classes, and their relationships from Python code
 */

let nodeIdCounter = 0;
const getId = () => `node_${nodeIdCounter++}`;

function parsePython(code) {
  nodeIdCounter = 0;
  const nodes = [];
  const edges = [];
  const lines = code.split('\n');

  const functionMap = {}; // name -> nodeId
  const classMap = {};    // name -> nodeId

  // ── Pass 1: Extract class definitions ─────────────────────────────────────
  const classRegex = /^class\s+(\w+)(?:\(([^)]*)\))?:/;
  lines.forEach((line, idx) => {
    const match = classRegex.exec(line);
    if (match) {
      const className = match[1];
      const parentClass = match[2] ? match[2].trim() : null;
      const nodeId = getId();
      classMap[className] = nodeId;

      // Extract class body (docstring + methods up to next class)
      const bodyLines = [];
      let i = idx + 1;
      while (i < lines.length && (lines[i].startsWith('    ') || lines[i].startsWith('\t') || lines[i].trim() === '')) {
        bodyLines.push(lines[i]);
        i++;
      }
      const methodCount = (bodyLines.join('\n').match(/def\s+\w+/g) || []).length;
      const docstring = extractDocstring(bodyLines);

      nodes.push({
        id: nodeId,
        type: 'classNode',
        data: {
          label: className,
          nodeType: 'class',
          parentClass: parentClass || null,
          methodCount,
          docstring,
          lineNumber: idx + 1,
          code: extractBlock(lines, idx),
          language: 'python'
        },
        position: { x: 0, y: 0 }
      });

      // Inheritance edge
      if (parentClass && parentClass !== 'object') {
        const parentNames = parentClass.split(',').map(s => s.trim()).filter(Boolean);
        parentNames.forEach(pname => {
          if (classMap[pname]) {
            edges.push({
              id: `edge_${classMap[pname]}_${nodeId}`,
              source: classMap[pname],
              target: nodeId,
              label: 'inherits',
              type: 'smoothstep',
              animated: false,
              style: { stroke: '#8b5cf6', strokeDasharray: '6 3' },
              markerEnd: { type: 'ArrowClosed', color: '#8b5cf6' },
              data: { edgeType: 'inheritance' }
            });
          }
        });
      }
    }
  });

  // ── Pass 2: Extract function / method definitions ──────────────────────────
  const funcRegex = /^(\s*)def\s+(\w+)\s*\(([^)]*)\)\s*(?:->\s*([^:]+))?:/;
  lines.forEach((line, idx) => {
    const match = funcRegex.exec(line);
    if (match) {
      const indent = match[1].length;
      const funcName = match[2];
      const params = match[3].trim();
      const returnType = match[4] ? match[4].trim() : null;
      const nodeId = getId();
      functionMap[funcName] = nodeId;

      // Find containing class (look backwards for nearest class at lower indent)
      let containingClass = null;
      for (let i = idx - 1; i >= 0; i--) {
        const cMatch = classRegex.exec(lines[i]);
        if (cMatch && lines[i].length - lines[i].trimStart().length < indent) {
          containingClass = cMatch[1];
          break;
        }
      }

      const bodyLines = [];
      let i = idx + 1;
      const bodyIndent = indent + 4;
      while (i < lines.length) {
        const li = lines[i];
        if (li.trim() === '') { bodyLines.push(li); i++; continue; }
        if (li.length - li.trimStart().length >= bodyIndent) { bodyLines.push(li); i++; }
        else break;
      }
      const docstring = extractDocstring(bodyLines);
      const paramList = params ? params.split(',').map(p => p.trim().split(':')[0].split('=')[0].trim()).filter(Boolean) : [];

      nodes.push({
        id: nodeId,
        type: 'functionNode',
        data: {
          label: funcName,
          nodeType: indent === 0 ? 'function' : 'method',
          containingClass,
          params: paramList,
          returnType,
          docstring,
          lineNumber: idx + 1,
          code: [line, ...bodyLines].join('\n'),
          language: 'python'
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
    }
  });

  // ── Pass 3: Extract function call edges ───────────────────────────────────
  const callRegex = /(\w+)\s*\(/g;
  Object.entries(functionMap).forEach(([callerName, callerId]) => {
    const callerNode = nodes.find(n => n.id === callerId);
    if (!callerNode || !callerNode.data.code) return;
    const codeBody = callerNode.data.code;
    let m;
    const seen = new Set();
    while ((m = callRegex.exec(codeBody)) !== null) {
      const callee = m[1];
      if (callee === callerName) continue;
      if (seen.has(callee)) continue;
      if (functionMap[callee] && functionMap[callee] !== callerId) {
        seen.add(callee);
        edges.push({
          id: `edge_${callerId}_${functionMap[callee]}_call`,
          source: callerId,
          target: functionMap[callee],
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

  // ── Pass 4: Extract import edges ──────────────────────────────────────────
  const importRegex = /^(?:from\s+(\S+)\s+)?import\s+(.+)/;
  lines.forEach((line, idx) => {
    const match = importRegex.exec(line.trim());
    if (match) {
      const source = match[1] || null;
      const imported = match[2];
      const nodeId = getId();
      nodes.push({
        id: nodeId,
        type: 'functionNode',
        data: {
          label: source ? `${source}.${imported.split(',')[0].trim()}` : imported.split(',')[0].trim(),
          nodeType: 'import',
          params: [],
          lineNumber: idx + 1,
          code: line.trim(),
          language: 'python'
        },
        position: { x: 0, y: 0 }
      });
    }
  });

  return { nodes, edges };
}

function extractDocstring(bodyLines) {
  const joined = bodyLines.join('\n').trim();
  const tripleMatch = joined.match(/^"""([\s\S]*?)"""/);
  if (tripleMatch) return tripleMatch[1].trim();
  const singleMatch = joined.match(/^'''([\s\S]*?)'''/);
  if (singleMatch) return singleMatch[1].trim();
  return null;
}

function extractBlock(lines, startIdx) {
  const result = [lines[startIdx]];
  let i = startIdx + 1;
  while (i < lines.length && (lines[i].startsWith('    ') || lines[i].startsWith('\t') || lines[i].trim() === '')) {
    result.push(lines[i]);
    i++;
    if (result.length > 50) { result.push('    # ... truncated'); break; }
  }
  return result.join('\n');
}

module.exports = { parsePython };
