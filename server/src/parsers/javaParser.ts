/**
 * Java AST Parser — tree-sitter based
 *
 * Uses the tree-sitter native Node bindings (tree-sitter + tree-sitter-java).
 * Correctly handles:
 *   - class / interface / enum declarations
 *   - method declarations and constructor declarations
 *   - extends + implements (multiple interfaces) edges
 *   - Generic type parameters with commas (Map<String, Integer>) — no regex split issues
 *   - Multi-line method signatures (resolved via AST, not line scanning)
 *   - Import statements
 *
 * Output contract is identical to the legacy regex parser so the client needs
 * zero changes.
 */

import type { ParseResult, GraphNode, GraphEdge } from '../types';

// tree-sitter types are not perfectly typed; use loose anys for the AST nodes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TSNode = any;

let Parser: any;       // eslint-disable-line @typescript-eslint/no-explicit-any
let JavaLanguage: any; // eslint-disable-line @typescript-eslint/no-explicit-any

function loadTreeSitter(): boolean {
  if (Parser) return true;
  try {
    Parser = require('tree-sitter');
    JavaLanguage = require('tree-sitter-java');
    return true;
  } catch {
    return false;
  }
}

let _nodeIdCounter = 0;
const getId = (prefix = 'java'): string => `${prefix}_node_${_nodeIdCounter++}`;

function nodeText(tsNode: TSNode, code: string): string {
  return code.slice(tsNode.startIndex, tsNode.endIndex);
}

function startLine(tsNode: TSNode): number {
  return tsNode.startPosition.row + 1;
}

/**
 * Recursively walk named children, invoking visitor(child, depth).
 * If visitor returns false, children of that node are not visited.
 */
function walk(tsNode: TSNode, visitor: (child: TSNode, depth: number) => boolean | void | undefined, depth = 0): void {
  for (const child of tsNode.namedChildren) {
    const descend = visitor(child, depth);
    if (descend !== false) {
      walk(child, visitor, depth + 1);
    }
  }
}

/**
 * Extract formal parameter names from a tree-sitter `formal_parameters` node.
 * Handles: typed params, varargs, generics — returns just the identifier names.
 */
function parseJavaParams(paramsNode: TSNode | null, code: string): string[] {
  if (!paramsNode) return [];
  const names: string[] = [];
  for (const child of paramsNode.namedChildren) {
    if (child.type === 'formal_parameter' || child.type === 'spread_parameter') {
      const ids = child.namedChildren.filter((c: TSNode) => c.type === 'identifier');
      if (ids.length > 0) names.push(nodeText(ids[ids.length - 1], code));
    }
    // 'receiver_parameter' ('this' receiver) — skip
  }
  return names;
}

/**
 * Collect all method call names inside a given tree-sitter node.
 * Returns a Set<string>.
 */
function collectCallees(tsNode: TSNode, code: string): Set<string> {
  const callees = new Set<string>();
  walk(tsNode, child => {
    if (child.type === 'method_invocation') {
      const nameChild = child.namedChildren.find((c: TSNode) => c.type === 'identifier');
      if (nameChild) callees.add(nodeText(nameChild, code));
    }
  });
  return callees;
}

/**
 * Main entry point. Parses Java source code and returns { nodes, edges }.
 */
export function parseJava(code: string): ParseResult {
  _nodeIdCounter = 0;

  if (!loadTreeSitter()) {
    throw new Error(
      'tree-sitter native bindings not available. ' +
      'Run: npm install tree-sitter tree-sitter-java'
    );
  }

  const parser = new Parser();
  parser.setLanguage(JavaLanguage);
  const tree = parser.parse(code);

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const classMap: Record<string, string> = {};  // className → nodeId
  const methodMap: Record<string, string> = {}; // methodName → nodeId
  const methodAstMap: Record<string, TSNode> = {}; // nodeId → tree-sitter node

  // ── Pass 1: Extract class / interface / enum declarations ─────────────────
  //
  // We only collect type declarations at the top level or nested directly
  // inside another type. In tree-sitter-java the top-level structure is
  // program → {package_declaration, import_declaration, class_declaration, …}

  const typeMap: Record<string, 'class' | 'interface' | 'enum'> = {
    class_declaration: 'class',
    interface_declaration: 'interface',
    enum_declaration: 'enum',
    annotation_type_declaration: 'interface'
  };

  function extractTypeDeclaration(tsNode: TSNode, depth = 0): void {
    if (!(tsNode.type in typeMap)) return;

    const nodeType = typeMap[tsNode.type];

    const nameNode = tsNode.namedChildren.find((c: TSNode) => c.type === 'identifier');
    if (!nameNode) return;
    const className: string = nodeText(nameNode, code);
    const nodeId = getId('java_cls');
    classMap[className] = nodeId;

    const superclassNode = tsNode.namedChildren.find(
      (c: TSNode) => c.type === 'superclass'
    );
    let extendsClass: string | null = null;
    if (superclassNode) {
      const typeNode = superclassNode.namedChildren.find(
        (c: TSNode) => c.type === 'type_identifier'
      );
      if (typeNode) extendsClass = nodeText(typeNode, code);
    }

    const superInterfacesNode = tsNode.namedChildren.find(
      (c: TSNode) => c.type === 'super_interfaces'
    );
    const implementsList: string[] = [];
    if (superInterfacesNode) {
      walk(superInterfacesNode, child => {
        if (child.type === 'type_identifier') {
          implementsList.push(nodeText(child, code));
          return false; // don't recurse into generic arguments
        }
        return undefined;
      });
    }

    const bodyNode = tsNode.namedChildren.find(
      (c: TSNode) => c.type === 'class_body' || c.type === 'interface_body' || c.type === 'enum_body'
    );
    let methodCount = 0;
    if (bodyNode) {
      for (const stmt of bodyNode.namedChildren) {
        if (stmt.type === 'method_declaration' || stmt.type === 'constructor_declaration') {
          methodCount++;
        }
      }
    }

    const classCode = nodeText(tsNode, code).slice(0, 3000);

    nodes.push({
      id: nodeId,
      type: 'classNode',
      data: {
        label: className,
        nodeType,
        extendsClass,
        implementsList,
        methodCount,
        lineNumber: startLine(tsNode),
        code: classCode,
        language: 'java'
      },
      position: { x: 0, y: 0 }
    });

    if (extendsClass && classMap[extendsClass]) {
      edges.push({
        id: `edge_${classMap[extendsClass]}_${nodeId}_extends`,
        source: classMap[extendsClass],
        target: nodeId,
        label: 'extends',
        type: 'smoothstep',
        style: { stroke: '#8b5cf6', strokeDasharray: '6 3' },
        markerEnd: { type: 'arrowclosed', color: '#8b5cf6' },
        data: { edgeType: 'inheritance' }
      });
    }

    implementsList.forEach(iface => {
      if (classMap[iface]) {
        edges.push({
          id: `edge_${classMap[iface]}_${nodeId}_impl`,
          source: classMap[iface],
          target: nodeId,
          label: 'implements',
          type: 'smoothstep',
          style: { stroke: '#10b981', strokeDasharray: '4 2' },
          markerEnd: { type: 'arrowclosed', color: '#10b981' },
          data: { edgeType: 'implementation' }
        });
      }
    });

    if (bodyNode && depth < 2) {
      for (const stmt of bodyNode.namedChildren) {
        if (stmt.type in typeMap) {
          extractTypeDeclaration(stmt, depth + 1);
        }
      }
    }
  }

  for (const child of tree.rootNode.namedChildren) {
    extractTypeDeclaration(child, 0);
  }

  // ── Pass 2: Extract methods and constructors ───────────────────────────────

  function extractMethod(methodNode: TSNode, containingClass: string | null): void {
    const isConstructor = methodNode.type === 'constructor_declaration';

    const nameNode = methodNode.namedChildren.find((c: TSNode) => c.type === 'identifier');
    if (!nameNode) return;
    const methodName: string = nodeText(nameNode, code);

    let returnType: string | null = null;
    if (!isConstructor) {
      const typeNode = methodNode.namedChildren.find(
        (c: TSNode) =>
          c.type === 'void_type' ||
          c.type === 'integral_type' ||
          c.type === 'floating_point_type' ||
          c.type === 'boolean_type' ||
          c.type === 'type_identifier' ||
          c.type === 'generic_type' ||
          c.type === 'array_type'
      );
      if (typeNode) returnType = nodeText(typeNode, code);
    }

    const paramsNode = methodNode.namedChildren.find(
      (c: TSNode) => c.type === 'formal_parameters'
    );
    const paramList = parseJavaParams(paramsNode, code);

    const nodeId = getId('java_fn');
    // Use name as key for call-edge resolution (simplified — doesn't handle overloads)
    methodMap[methodName] = nodeId;

    const methodCode = nodeText(methodNode, code).slice(0, 3000);

    nodes.push({
      id: nodeId,
      type: 'functionNode',
      data: {
        label: methodName,
        nodeType: isConstructor ? 'constructor' : 'method',
        returnType,
        params: paramList,
        containingClass: containingClass || null,
        lineNumber: startLine(methodNode),
        code: methodCode,
        language: 'java'
      },
      position: { x: 0, y: 0 }
    });

    methodAstMap[nodeId] = methodNode;

    if (containingClass && classMap[containingClass]) {
      edges.push({
        id: `edge_${classMap[containingClass]}_${nodeId}_member`,
        source: classMap[containingClass],
        target: nodeId,
        label: 'contains',
        type: 'smoothstep',
        style: { stroke: '#06b6d4', strokeWidth: 1.5 },
        markerEnd: { type: 'arrowclosed', color: '#06b6d4' },
        data: { edgeType: 'membership' }
      });
    }
  }

  function walkForMethods(tsNode: TSNode, containingClass: string | null): void {
    const bodyTypes = ['class_body', 'interface_body', 'enum_body'];
    for (const child of tsNode.namedChildren) {
      if (child.type === 'method_declaration' || child.type === 'constructor_declaration') {
        extractMethod(child, containingClass);
      } else if (bodyTypes.includes(child.type)) {
        const parentName = tsNode.namedChildren.find((c: TSNode) => c.type === 'identifier');
        walkForMethods(child, parentName ? nodeText(parentName, code) : containingClass);
      } else if (
        child.type === 'class_declaration' ||
        child.type === 'interface_declaration' ||
        child.type === 'enum_declaration'
      ) {
        const innerName = child.namedChildren.find((c: TSNode) => c.type === 'identifier');
        walkForMethods(child, innerName ? nodeText(innerName, code) : containingClass);
      }
    }
  }

  for (const child of tree.rootNode.namedChildren) {
    walkForMethods(child, null);
  }

  // ── Pass 3: Call edges ─────────────────────────────────────────────────────
  Object.entries(methodMap).forEach(([callerName, callerId]) => {
    const astNode = methodAstMap[callerId];
    if (!astNode) return;
    const callees = collectCallees(astNode, code);
    const seen = new Set<string>();
    callees.forEach(callee => {
      if (callee === callerName) return;
      if (seen.has(callee)) return;
      const calleeId = methodMap[callee];
      if (calleeId && calleeId !== callerId) {
        seen.add(callee);
        edges.push({
          id: `edge_${callerId}_${calleeId}_call`,
          source: callerId,
          target: calleeId,
          label: 'calls',
          type: 'default',
          animated: true,
          style: { stroke: '#f59e0b', strokeWidth: 1.5 },
          markerEnd: { type: 'arrowclosed', color: '#f59e0b' },
          data: { edgeType: 'call' }
        });
      }
    });
  });

  // ── Pass 4: Import nodes ───────────────────────────────────────────────────
  for (const child of tree.rootNode.namedChildren) {
    if (child.type === 'import_declaration') {
      const importText = nodeText(child, code).replace(/^import\s+|;$/g, '').trim();
      const parts = importText.split('.');
      const shortName =
        parts[parts.length - 1] === '*'
          ? parts[parts.length - 2] + '.*'
          : parts[parts.length - 1];
      const nid = getId('java_imp');
      nodes.push({
        id: nid,
        type: 'functionNode',
        data: {
          label: shortName,
          nodeType: 'import',
          params: [],
          lineNumber: startLine(child),
          code: nodeText(child, code).trim(),
          language: 'java'
        },
        position: { x: 0, y: 0 }
      });
    }
  }

  return { nodes, edges };
}

module.exports = { parseJava };
