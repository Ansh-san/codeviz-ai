/**
 * Python AST Parser — tree-sitter based
 *
 * Uses the tree-sitter native Node bindings (tree-sitter + tree-sitter-python).
 * Traverses the concrete syntax tree to extract classes, functions, and their
 * relationships with full support for:
 *   - async def, decorated functions, nested functions (scope-aware)
 *   - Multi-line function signatures (no line-by-line regex needed)
 *   - Multiple inheritance / mixin lists
 *   - Import statements
 *
 * Output contract is identical to the legacy regex parser so the client needs
 * zero changes.
 */

import type { ParseResult, GraphNode, GraphEdge } from '../types';

// tree-sitter types are not perfectly typed; use loose anys for the AST nodes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TSNode = any;

let Parser: any;         // eslint-disable-line @typescript-eslint/no-explicit-any
let PythonLanguage: any; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Lazy-load tree-sitter so the module can still be imported even if the native
 * bindings haven't been installed yet (the route layer handles the error).
 */
function loadTreeSitter(): boolean {
  if (Parser) return true;
  try {
    Parser = require('tree-sitter');
    PythonLanguage = require('tree-sitter-python');
    return true;
  } catch {
    return false;
  }
}

let _nodeIdCounter = 0;
const getId = (prefix = 'py'): string => `${prefix}_node_${_nodeIdCounter++}`;

/** Extract the raw source text for a tree-sitter node from the original code string. */
function nodeText(tsNode: TSNode, code: string): string {
  return code.slice(tsNode.startIndex, tsNode.endIndex);
}

/** Extract the 1-based start line number of a tree-sitter node. */
function startLine(tsNode: TSNode): number {
  return tsNode.startPosition.row + 1;
}

/**
 * Walk named children of a tree-sitter node, calling visitor for each.
 * The visitor receives (child, depth). Returning false stops descent.
 */
function walk(tsNode: TSNode, visitor: (child: TSNode, depth: number) => boolean | void, depth = 0): void {
  for (const child of tsNode.namedChildren) {
    const descend = visitor(child, depth);
    if (descend !== false) {
      walk(child, visitor, depth + 1);
    }
  }
}

/**
 * Parse parameters from a tree-sitter `parameters` node.
 * Returns an array of parameter name strings (no type annotations, no defaults).
 */
function parseParams(paramsNode: TSNode | null, code: string): string[] {
  if (!paramsNode) return [];
  const paramNames: string[] = [];
  for (const child of paramsNode.namedChildren) {
    const t: string = child.type;
    if (t === 'identifier') {
      const name = nodeText(child, code);
      if (name !== 'self' && name !== 'cls') paramNames.push(name);
    } else if (
      t === 'typed_parameter' ||
      t === 'default_parameter' ||
      t === 'typed_default_parameter'
    ) {
      const idChild = child.namedChildren.find((c: TSNode) => c.type === 'identifier');
      if (idChild) {
        const name = nodeText(idChild, code);
        if (name !== 'self' && name !== 'cls') paramNames.push(name);
      }
    } else if (t === 'list_splat_pattern' || t === 'dictionary_splat_pattern') {
      const idChild = child.namedChildren.find((c: TSNode) => c.type === 'identifier');
      if (idChild) paramNames.push(nodeText(idChild, code));
    }
  }
  return paramNames;
}

/**
 * Extract a docstring from the first expression_statement in a block, if it is
 * a string literal.
 */
function extractDocstring(blockNode: TSNode | null, code: string): string | null {
  if (!blockNode) return null;
  const firstStmt = blockNode.namedChildren.find(
    (c: TSNode) => c.type === 'expression_statement'
  );
  if (!firstStmt) return null;
  const inner = firstStmt.namedChildren[0];
  if (!inner) return null;
  if (inner.type === 'string') {
    const raw = nodeText(inner, code);
    return raw.replace(/^["']{1,3}|["']{1,3}$/g, '').trim();
  }
  return null;
}

/**
 * Collect all call names (identifiers immediately followed by a call) within
 * the given tree-sitter node. Returns a Set<string>.
 */
function collectCallees(tsNode: TSNode, code: string): Set<string> {
  const callees = new Set<string>();
  walk(tsNode, child => {
    if (child.type === 'call') {
      const funcChild = child.namedChildren.find(
        (c: TSNode) => c.fieldName === 'function' || c === child.namedChildren[0]
      );
      if (funcChild) {
        if (funcChild.type === 'identifier') {
          callees.add(nodeText(funcChild, code));
        } else if (funcChild.type === 'attribute') {
          const attr = funcChild.namedChildren.find(
            (c: TSNode) => c.fieldName === 'attribute' || c === funcChild.namedChildren[funcChild.namedChildren.length - 1]
          );
          if (attr && attr.type === 'identifier') callees.add(nodeText(attr, code));
        }
      }
    }
  });
  return callees;
}

/**
 * Main entry point. Parses Python source code and returns { nodes, edges }
 * in the CodeViz graph contract.
 */
export function parsePython(code: string): ParseResult {
  _nodeIdCounter = 0;

  if (!loadTreeSitter()) {
    throw new Error(
      'tree-sitter native bindings not available. ' +
      'Run: npm install tree-sitter tree-sitter-python'
    );
  }

  const parser = new Parser();
  parser.setLanguage(PythonLanguage);
  const tree = parser.parse(code);

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const classMap: Record<string, string> = {};   // className → nodeId
  const functionMap: Record<string, string> = {}; // funcName → nodeId
  const nodeAstMap: Record<string, TSNode> = {};  // nodeId → tree-sitter node

  // ── Pass 1: Extract class definitions (top-level only) ────────────────────
  //
  // We only visit direct children of the module root for class definitions,
  // so nested classes are not misidentified as top-level.
  for (const child of tree.rootNode.namedChildren) {
    if (child.type !== 'class_definition') continue;

    const nameNode = child.namedChildren.find((c: TSNode) => c.type === 'identifier');
    if (!nameNode) continue;

    const className = nodeText(nameNode, code);
    const nodeId = getId('py_cls');
    classMap[className] = nodeId;

    const argList = child.namedChildren.find((c: TSNode) => c.type === 'argument_list');
    const parentNames: string[] = argList
      ? argList.namedChildren
          .filter((c: TSNode) => c.type === 'identifier')
          .map((c: TSNode) => nodeText(c, code))
          .filter((n: string) => n !== 'object')
      : [];

    const bodyNode = child.namedChildren.find((c: TSNode) => c.type === 'block');
    const docstring = extractDocstring(bodyNode, code);

    let methodCount = 0;
    if (bodyNode) {
      for (const stmt of bodyNode.namedChildren) {
        if (
          stmt.type === 'function_definition' ||
          stmt.type === 'async_function_definition' ||
          stmt.type === 'decorated_definition'
        ) methodCount++;
      }
    }

    const classCode = nodeText(child, code).slice(0, 3000);

    nodes.push({
      id: nodeId,
      type: 'classNode',
      data: {
        label: className,
        nodeType: 'class',
        parentClass: parentNames[0] || null,
        methodCount,
        docstring,
        lineNumber: startLine(child),
        code: classCode,
        language: 'python'
      },
      position: { x: 0, y: 0 }
    });

    parentNames.forEach(pname => {
      if (classMap[pname]) {
        edges.push({
          id: `edge_${classMap[pname]}_${nodeId}_inherits`,
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

  // ── Pass 2: Extract functions and methods ─────────────────────────────────
  //
  // Strategy:
  //   - Top-level functions: direct children of the module root
  //   - Methods: direct children of a class body block
  //   - Nested functions (inside another function body) are SKIPPED so they
  //     don't pollute the top-level graph.

  function extractFunctionNode(fnNode: TSNode, containingClass: string | null): void {
    let actualFn = fnNode;
    let decoratorNames: string[] = [];
    if (fnNode.type === 'decorated_definition') {
      decoratorNames = fnNode.namedChildren
        .filter((c: TSNode) => c.type === 'decorator')
        .map((c: TSNode) => nodeText(c, code).replace(/^@/, '').trim());
      actualFn = fnNode.namedChildren.find(
        (c: TSNode) =>
          c.type === 'function_definition' ||
          c.type === 'async_function_definition'
      );
      if (!actualFn) return;
    }

    // In tree-sitter-python@0.21 async functions are typed 'function_definition',
    // with 'async' appearing as a non-named child token before 'def'.
    // Newer grammars may use 'async_function_definition' — handle both.
    const isAsync: boolean =
      actualFn.type === 'async_function_definition' ||
      actualFn.children.some((c: TSNode) => c.type === 'async');

    const nameNode = actualFn.namedChildren.find((c: TSNode) => c.type === 'identifier');
    if (!nameNode) return;

    const funcName = nodeText(nameNode, code);
    const nodeId = getId('py_fn');
    functionMap[funcName] = nodeId;

    const paramsNode = actualFn.namedChildren.find(
      (c: TSNode) => c.type === 'parameters'
    );
    const paramList = parseParams(paramsNode, code);

    const returnTypeNode = actualFn.namedChildren.find(
      (c: TSNode) => c.type === 'type'
    );
    const returnType: string | null = returnTypeNode ? nodeText(returnTypeNode, code) : null;

    const bodyNode = actualFn.namedChildren.find((c: TSNode) => c.type === 'block');
    const docstring = extractDocstring(bodyNode, code);

    const fnCode = nodeText(fnNode, code).slice(0, 3000);
    const nodeType = containingClass ? 'method' : 'function';

    nodes.push({
      id: nodeId,
      type: 'functionNode',
      data: {
        label: funcName,
        nodeType: nodeType as 'method' | 'function',
        containingClass: containingClass || null,
        params: paramList,
        returnType,
        isAsync,
        decorators: decoratorNames,
        docstring,
        lineNumber: startLine(fnNode),
        code: fnCode,
        language: 'python'
      },
      position: { x: 0, y: 0 }
    });

    nodeAstMap[nodeId] = actualFn;

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

  // Top-level functions
  for (const child of tree.rootNode.namedChildren) {
    if (
      child.type === 'function_definition' ||
      child.type === 'async_function_definition' ||
      child.type === 'decorated_definition'
    ) {
      extractFunctionNode(child, null);
    }

    // Methods inside top-level classes
    if (child.type === 'class_definition') {
      const classNameNode = child.namedChildren.find((c: TSNode) => c.type === 'identifier');
      if (!classNameNode) continue;
      const className = nodeText(classNameNode, code);
      const bodyNode = child.namedChildren.find((c: TSNode) => c.type === 'block');
      if (!bodyNode) continue;
      for (const stmt of bodyNode.namedChildren) {
        if (
          stmt.type === 'function_definition' ||
          stmt.type === 'async_function_definition' ||
          stmt.type === 'decorated_definition'
        ) {
          extractFunctionNode(stmt, className);
        }
      }
    }
  }

  // ── Pass 3: Call edges ─────────────────────────────────────────────────────
  Object.entries(functionMap).forEach(([callerName, callerId]) => {
    const astNode = nodeAstMap[callerId];
    if (!astNode) return;
    const callees = collectCallees(astNode, code);
    const seen = new Set<string>();
    callees.forEach(callee => {
      if (callee === callerName) return;
      if (seen.has(callee)) return;
      const calleeId = functionMap[callee];
      if (calleeId && calleeId !== callerId) {
        seen.add(callee);
        edges.push({
          id: `edge_${callerId}_${calleeId}_call`,
          source: callerId,
          target: calleeId,
          label: 'calls',
          type: 'bezier',
          animated: true,
          style: { stroke: '#f59e0b', strokeWidth: 1.5 },
          markerEnd: { type: 'ArrowClosed', color: '#f59e0b' },
          data: { edgeType: 'call' }
        });
      }
    });
  });

  // ── Pass 4: Import nodes ───────────────────────────────────────────────────
  for (const child of tree.rootNode.namedChildren) {
    if (child.type === 'import_statement') {
      const names: string[] = child.namedChildren
        .filter((c: TSNode) => c.type === 'dotted_name' || c.type === 'aliased_import')
        .map((c: TSNode) => {
          if (c.type === 'aliased_import') {
            return nodeText(c.namedChildren[0], code);
          }
          return nodeText(c, code);
        });
      names.forEach(name => {
        const nid = getId('py_imp');
        nodes.push({
          id: nid,
          type: 'functionNode',
          data: {
            label: name.split('.').pop() ?? name,
            nodeType: 'import',
            params: [],
            lineNumber: startLine(child),
            code: nodeText(child, code),
            language: 'python'
          },
          position: { x: 0, y: 0 }
        });
      });
    } else if (child.type === 'import_from_statement') {
      const moduleNode = child.namedChildren.find(
        (c: TSNode) => c.type === 'dotted_name' || c.type === 'relative_import'
      );
      const moduleName: string = moduleNode ? nodeText(moduleNode, code) : '';
      const imported: string[] = child.namedChildren
        .filter(
          (c: TSNode) =>
            c.type === 'dotted_name' ||
            c.type === 'aliased_import' ||
            c.type === 'wildcard_import'
        )
        .slice(1)
        .map((c: TSNode) => {
          if (c.type === 'aliased_import') return nodeText(c.namedChildren[0], code);
          return nodeText(c, code);
        });

      const first = imported[0] || '*';
      const nid = getId('py_imp');
      nodes.push({
        id: nid,
        type: 'functionNode',
        data: {
          label: moduleName ? `${moduleName}.${first}` : first,
          nodeType: 'import',
          params: [],
          lineNumber: startLine(child),
          code: nodeText(child, code),
          language: 'python'
        },
        position: { x: 0, y: 0 }
      });
    }
  }

  return { nodes, edges };
}

module.exports = { parsePython };
