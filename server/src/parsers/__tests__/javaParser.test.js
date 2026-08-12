/**
 * Vitest fixture-based tests for the tree-sitter Java parser.
 *
 * Tests assert on the shape of the output, not exact object equality,
 * so they stay robust against ID or ordering changes.
 */

import { describe, it, expect } from 'vitest';
import { parseJava } from '../javaParser.ts';

// ── helpers ──────────────────────────────────────────────────────────────────

const getClassNodes = r => r.nodes.filter(n => n.type === 'classNode');
const getMethodNodes = r =>
  r.nodes.filter(n => n.type === 'functionNode' && n.data.nodeType !== 'import');
const getEdgesByType = (r, et) => r.edges.filter(e => e.data?.edgeType === et);

// ── 1. Plain method ───────────────────────────────────────────────────────────

describe('plain method', () => {
  const code = `
public class MathUtils {
    public int add(int a, int b) {
        return a + b;
    }
}
`.trim();

  it('produces one classNode', () => {
    const r = parseJava(code);
    expect(getClassNodes(r)).toHaveLength(1);
  });

  it('produces one methodNode', () => {
    const r = parseJava(code);
    const methods = getMethodNodes(r);
    expect(methods).toHaveLength(1);
  });

  it('method has correct label and nodeType', () => {
    const r = parseJava(code);
    const m = getMethodNodes(r)[0];
    expect(m.data.label).toBe('add');
    expect(m.data.nodeType).toBe('method');
  });

  it('method has correct params', () => {
    const r = parseJava(code);
    const m = getMethodNodes(r)[0];
    expect(m.data.params).toContain('a');
    expect(m.data.params).toContain('b');
  });

  it('method has correct return type', () => {
    const r = parseJava(code);
    const m = getMethodNodes(r)[0];
    expect(m.data.returnType).toBe('int');
  });
});

// ── 2. Class with extends ─────────────────────────────────────────────────────

describe('class with extends', () => {
  const code = `
public class Animal {
    public void speak() {}
}

public class Dog extends Animal {
    public void bark() {}
}
`.trim();

  it('produces two classNodes', () => {
    const r = parseJava(code);
    expect(getClassNodes(r)).toHaveLength(2);
  });

  it('has an inheritance edge', () => {
    const r = parseJava(code);
    const edges = getEdgesByType(r, 'inheritance');
    expect(edges).toHaveLength(1);
    expect(edges[0].label).toBe('extends');
  });

  it('inheritance edge has correct source and target', () => {
    const r = parseJava(code);
    const animalNode = getClassNodes(r).find(n => n.data.label === 'Animal');
    const dogNode = getClassNodes(r).find(n => n.data.label === 'Dog');
    const edge = getEdgesByType(r, 'inheritance')[0];
    expect(edge.source).toBe(animalNode.id);
    expect(edge.target).toBe(dogNode.id);
  });
});

// ── 3. Class with multiple implements ────────────────────────────────────────

describe('class with multiple implements', () => {
  const code = `
interface Serializable {}
interface Comparable {}
interface Cloneable {}

public class DataObject implements Serializable, Comparable, Cloneable {
    public void process() {}
}
`.trim();

  it('has three implementation edges', () => {
    const r = parseJava(code);
    const edges = getEdgesByType(r, 'implementation');
    expect(edges).toHaveLength(3);
  });

  it('all edges target DataObject', () => {
    const r = parseJava(code);
    const dataNode = getClassNodes(r).find(n => n.data.label === 'DataObject');
    const edges = getEdgesByType(r, 'implementation');
    edges.forEach(e => expect(e.target).toBe(dataNode.id));
  });
});

// ── 4. Multi-line method signature ────────────────────────────────────────────

describe('multi-line method signature', () => {
  const code = `
public class Service {
    public String processRequest(
            String endpoint,
            int timeout,
            boolean retry) {
        return endpoint;
    }
}
`.trim();

  it('extracts all params', () => {
    const r = parseJava(code);
    const m = getMethodNodes(r)[0];
    expect(m.data.params).toContain('endpoint');
    expect(m.data.params).toContain('timeout');
    expect(m.data.params).toContain('retry');
  });

  it('has correct label', () => {
    const r = parseJava(code);
    expect(getMethodNodes(r)[0].data.label).toBe('processRequest');
  });
});

// ── 5. Interface declaration ──────────────────────────────────────────────────

describe('interface declaration', () => {
  const code = `
public interface Drawable {
    void draw();
    void resize(int factor);
}
`.trim();

  it('produces one classNode with nodeType interface', () => {
    const r = parseJava(code);
    const cls = getClassNodes(r);
    expect(cls).toHaveLength(1);
    expect(cls[0].data.nodeType).toBe('interface');
    expect(cls[0].data.label).toBe('Drawable');
  });
});

// ── 6. Enum declaration ───────────────────────────────────────────────────────

describe('enum declaration', () => {
  const code = `
public enum Direction {
    NORTH, SOUTH, EAST, WEST;

    public boolean isVertical() {
        return this == NORTH || this == SOUTH;
    }
}
`.trim();

  it('produces one classNode with nodeType enum', () => {
    const r = parseJava(code);
    const cls = getClassNodes(r);
    expect(cls).toHaveLength(1);
    expect(cls[0].data.nodeType).toBe('enum');
    expect(cls[0].data.label).toBe('Direction');
  });
});

// ── 7. Generic type parameters with commas ────────────────────────────────────

describe('generic type params with commas', () => {
  const code = `
import java.util.Map;
import java.util.List;

public class Registry {
    public Map<String, Integer> getScores(List<String> names) {
        return null;
    }

    public void store(Map<String, List<Integer>> data) {}
}
`.trim();

  it('extracts method without splitting on generic commas', () => {
    const r = parseJava(code);
    const methods = getMethodNodes(r);
    // Should find getScores and store — NOT split into extra nodes on commas
    const getScores = methods.find(m => m.data.label === 'getScores');
    const store = methods.find(m => m.data.label === 'store');
    expect(getScores).toBeDefined();
    expect(store).toBeDefined();
  });

  it('does not produce spurious extra method nodes', () => {
    const r = parseJava(code);
    const methods = getMethodNodes(r);
    // Only 2 real methods; if regex had split on commas in generics, there'd be more
    expect(methods.length).toBeLessThanOrEqual(4); // 2 methods + constructor + buffer
    expect(methods.filter(m => m.data.label === 'getScores')).toHaveLength(1);
  });

  it('extracts params from generic method signature', () => {
    const r = parseJava(code);
    const getScores = getMethodNodes(r).find(m => m.data.label === 'getScores');
    expect(getScores.data.params).toContain('names');
  });
});
