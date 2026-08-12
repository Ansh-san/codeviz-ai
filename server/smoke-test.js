/**
 * Quick smoke test for the tree-sitter parsers.
 * Run with: npx tsx smoke-test.js
 */
const { parsePython } = require('./src/parsers/pythonParser');
const { parseJava } = require('./src/parsers/javaParser');

const pyCode = `class BinarySearchTree:
    def __init__(self):
        self.root = None
    def insert(self, value):
        if self.root is None:
            self.root = value
        else:
            self._insert_recursive(self.root, value)
    def _insert_recursive(self, node, value):
        return node

class Node:
    def __init__(self, value):
        self.value = value`;

const r1 = parsePython(pyCode);
console.log('Python:', r1.nodes.length, 'nodes,', r1.edges.length, 'edges');
const classes = r1.nodes.filter(n => n.type === 'classNode');
console.log('  Classes:', classes.map(c => c.data.label).join(', '));
const methods = r1.nodes.filter(n => n.type === 'functionNode' && n.data.nodeType !== 'import');
console.log('  Methods:', methods.map(m => m.data.label).join(', '));

const javaCode = `public class LinkedList {
    private Object head;
    public void addFirst(Object data) {
        head = data;
    }
    public Object removeFirst() {
        return head;
    }
    public boolean contains(Object data) {
        return false;
    }
    public int size() { return 0; }
}`;

const r2 = parseJava(javaCode);
console.log('Java:', r2.nodes.length, 'nodes,', r2.edges.length, 'edges');
const jclasses = r2.nodes.filter(n => n.type === 'classNode');
console.log('  Classes:', jclasses.map(c => c.data.label).join(', '));
const jmethods = r2.nodes.filter(n => n.type === 'functionNode' && n.data.nodeType !== 'import');
console.log('  Methods:', jmethods.map(m => m.data.label).join(', '));
console.log('All good!');
