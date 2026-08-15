/**
 * Vitest fixture-based tests for the tree-sitter Python parser.
 *
 * Tests assert on the *shape* of the output (which fields exist and what
 * values they hold) rather than exact object equality, so they stay robust
 * against minor formatting or ordering changes.
 */

import { describe, it, expect } from 'vitest';
import { parsePython } from '../pythonParser.ts';

// ── helpers ──────────────────────────────────────────────────────────────────

const getNodes = (result, type) =>
  result.nodes.filter(n => n.type === type);

const getFnNodes = result =>
  result.nodes.filter(n => n.type === 'functionNode' && n.data.nodeType !== 'import');

const getClassNodes = result =>
  result.nodes.filter(n => n.type === 'classNode');

const getEdgesByType = (result, edgeType) =>
  result.edges.filter(e => e.data?.edgeType === edgeType);

// ── 1. Plain function ─────────────────────────────────────────────────────────

describe('plain function', () => {
  const code = `
def greet(name, greeting):
    return greeting + " " + name
`.trim();

  it('produces one functionNode', () => {
    const r = parsePython(code);
    const fns = getFnNodes(r);
    expect(fns).toHaveLength(1);
  });

  it('has correct label and nodeType', () => {
    const r = parsePython(code);
    const fn = getFnNodes(r)[0];
    expect(fn.data.label).toBe('greet');
    expect(fn.data.nodeType).toBe('function');
  });

  it('extracts params (excluding self/cls)', () => {
    const r = parsePython(code);
    const fn = getFnNodes(r)[0];
    expect(fn.data.params).toEqual(['name', 'greeting']);
  });

  it('includes a lineNumber', () => {
    const r = parsePython(code);
    const fn = getFnNodes(r)[0];
    expect(fn.data.lineNumber).toBeGreaterThan(0);
  });
});

// ── 2. async def ─────────────────────────────────────────────────────────────

describe('async function', () => {
  const code = `
async def fetch_data(url, timeout=30):
    pass
`.trim();

  it('produces one functionNode', () => {
    const r = parsePython(code);
    expect(getFnNodes(r)).toHaveLength(1);
  });

  it('has correct label', () => {
    const r = parsePython(code);
    expect(getFnNodes(r)[0].data.label).toBe('fetch_data');
  });

  it('marks the function as async', () => {
    const r = parsePython(code);
    expect(getFnNodes(r)[0].data.isAsync).toBe(true);
  });

  it('extracts params', () => {
    const r = parsePython(code);
    expect(getFnNodes(r)[0].data.params).toContain('url');
  });
});

// ── 3. Decorated function ─────────────────────────────────────────────────────

describe('decorated function', () => {
  const code = `
@staticmethod
def utility(x, y):
    return x + y
`.trim();

  it('produces one functionNode', () => {
    const r = parsePython(code);
    expect(getFnNodes(r)).toHaveLength(1);
  });

  it('has correct label despite decorator', () => {
    const r = parsePython(code);
    expect(getFnNodes(r)[0].data.label).toBe('utility');
  });
});

// ── 4. Nested function — inner IS emitted with containingParent ───────────────
//
// Previous behaviour: inner was silently skipped.
// New behaviour: inner is emitted as its own functionNode with containingParent
// set to the outer function's node ID (so the layout can nest it correctly).

describe('nested function', () => {
  const code = `
def outer(x):
    def inner(y):
        return y * 2
    return inner(x)
`.trim();

  it('captures the outer function', () => {
    const r = parsePython(code);
    const fns = getFnNodes(r);
    const outer = fns.find(f => f.data.label === 'outer');
    expect(outer).toBeDefined();
  });

  it('emits inner as a functionNode with containingParent set', () => {
    const r = parsePython(code);
    const fns = getFnNodes(r);
    const outer = fns.find(f => f.data.label === 'outer');
    const inner = fns.find(f => f.data.label === 'inner');
    // inner is now emitted — it has containingParent pointing to outer
    expect(inner).toBeDefined();
    expect(inner.data.containingParent).toBe(outer.id);
  });

  it('emits a membership edge from outer to inner', () => {
    const r = parsePython(code);
    const fns = getFnNodes(r);
    const outer = fns.find(f => f.data.label === 'outer');
    const inner = fns.find(f => f.data.label === 'inner');
    const membership = getEdgesByType(r, 'membership');
    const edge = membership.find(e => e.source === outer.id && e.target === inner.id);
    expect(edge).toBeDefined();
  });
});

// ── 5. Class with single inheritance ─────────────────────────────────────────

describe('class with single inheritance', () => {
  const code = `
class Animal:
    def speak(self):
        pass

class Dog(Animal):
    def bark(self):
        pass
`.trim();

  it('produces two classNodes', () => {
    const r = parsePython(code);
    expect(getClassNodes(r)).toHaveLength(2);
  });

  it('has an inheritance edge from Animal to Dog', () => {
    const r = parsePython(code);
    const inherits = getEdgesByType(r, 'inheritance');
    expect(inherits).toHaveLength(1);
    const animalNode = getClassNodes(r).find(n => n.data.label === 'Animal');
    const dogNode = getClassNodes(r).find(n => n.data.label === 'Dog');
    expect(inherits[0].source).toBe(animalNode.id);
    expect(inherits[0].target).toBe(dogNode.id);
  });

  it('class node has correct label and nodeType', () => {
    const r = parsePython(code);
    const cls = getClassNodes(r).find(n => n.data.label === 'Dog');
    expect(cls.data.nodeType).toBe('class');
  });
});

// ── 6. Multi-line function signature ─────────────────────────────────────────

describe('multi-line function signature', () => {
  const code = `
def complex_function(
    first_arg,
    second_arg,
    third_arg="default",
    *args,
    **kwargs
):
    pass
`.trim();

  it('extracts all positional params', () => {
    const r = parsePython(code);
    const fn = getFnNodes(r)[0];
    expect(fn.data.params).toContain('first_arg');
    expect(fn.data.params).toContain('second_arg');
    expect(fn.data.params).toContain('third_arg');
  });

  it('has correct label', () => {
    const r = parsePython(code);
    expect(getFnNodes(r)[0].data.label).toBe('complex_function');
  });
});

// ── 7. Class methods get membership edges ────────────────────────────────────

describe('class method membership', () => {
  const code = `
class Calculator:
    def add(self, a, b):
        return a + b

    def subtract(self, a, b):
        return a - b
`.trim();

  it('emits membership edges for methods', () => {
    const r = parsePython(code);
    const membership = getEdgesByType(r, 'membership');
    expect(membership.length).toBeGreaterThanOrEqual(2);
  });

  it('methods have containingClass set', () => {
    const r = parsePython(code);
    const methods = getFnNodes(r).filter(n => n.data.containingClass === 'Calculator');
    expect(methods.length).toBeGreaterThanOrEqual(2);
  });
});

// ── 8. Nested function inside a method ───────────────────────────────────────
//
// Mirrors the Solution.allPathsSourceTarget snippet from the bug report.
// Verifies that:
//   - The nested function `dfs` gets its own functionNode
//   - A membership edge exists from `allPathsSourceTarget` → `dfs`
//   - A recursive-call (self-loop) edge exists on `dfs`

describe('nested function inside a method', () => {
  const code = `
class Solution:
    def allPathsSourceTarget(self, graph):
        res = []
        n = len(graph)

        def dfs(node, path):
            if node == n - 1:
                res.append(path[:])
                return
            for nei in graph[node]:
                path.append(nei)
                dfs(nei, path)
                path.pop()

        dfs(0, [0])
        return res
`.trim();

  it('emits a functionNode for the nested dfs function', () => {
    const r = parsePython(code);
    const dfsNode = getFnNodes(r).find(n => n.data.label === 'dfs');
    expect(dfsNode).toBeDefined();
  });

  it('emits the parent allPathsSourceTarget as a functionNode', () => {
    const r = parsePython(code);
    const parentNode = getFnNodes(r).find(n => n.data.label === 'allPathsSourceTarget');
    expect(parentNode).toBeDefined();
  });

  it('emits a membership edge from allPathsSourceTarget to dfs', () => {
    const r = parsePython(code);
    const parentNode = getFnNodes(r).find(n => n.data.label === 'allPathsSourceTarget');
    const dfsNode = getFnNodes(r).find(n => n.data.label === 'dfs');
    expect(parentNode).toBeDefined();
    expect(dfsNode).toBeDefined();
    const containmentEdges = getEdgesByType(r, 'membership');
    const parentToDfs = containmentEdges.find(
      e => e.source === parentNode.id && e.target === dfsNode.id
    );
    expect(parentToDfs).toBeDefined();
  });

  it('flags the dfs node as recursive instead of emitting a recursive-call edge', () => {
    const r = parsePython(code);
    const dfsNode = r.nodes.find(n => n.data.label === 'dfs');
    expect(dfsNode).toBeDefined();
    expect(dfsNode.data.isRecursive).toBe(true);
  });

  it('dfs node has containingParent set to allPathsSourceTarget node id', () => {
    const r = parsePython(code);
    const parentNode = getFnNodes(r).find(n => n.data.label === 'allPathsSourceTarget');
    const dfsNode = getFnNodes(r).find(n => n.data.label === 'dfs');
    // containingParent links back to parent fn nodeId (not className)
    expect(dfsNode.data.containingParent).toBe(parentNode.id);
  });
});

// ── 9. Sibling top-level functions calling each other ─────────────────────────
//
// Confirms normal call edges between sibling (non-nested) functions work
// after the nested-function changes.

describe('sibling functions with call edges', () => {
  const code = `
def helper(x):
    return x * 2

def main(data):
    return helper(data) + 1
`.trim();

  it('emits both function nodes', () => {
    const r = parsePython(code);
    const fns = getFnNodes(r);
    expect(fns.find(n => n.data.label === 'helper')).toBeDefined();
    expect(fns.find(n => n.data.label === 'main')).toBeDefined();
  });

  it('emits a call edge from main to helper', () => {
    const r = parsePython(code);
    const helperNode = getFnNodes(r).find(n => n.data.label === 'helper');
    const mainNode = getFnNodes(r).find(n => n.data.label === 'main');
    const callEdges = getEdgesByType(r, 'call');
    const edge = callEdges.find(
      e => e.source === mainNode.id && e.target === helperNode.id
    );
    expect(edge).toBeDefined();
  });

  it('does not flag these functions as recursive', () => {
    const r = parsePython(code);
    expect(r.nodes.some(n => n.data.isRecursive)).toBe(false);
  });
});

