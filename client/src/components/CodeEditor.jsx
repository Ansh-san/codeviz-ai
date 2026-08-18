import { useState } from 'react';
import { ChevronDown, Code2, Trash2, Play, LayoutGrid, Layers } from 'lucide-react';

const PYTHON_SAMPLE = `class BinarySearchTree:
    """A Binary Search Tree implementation."""
    
    def __init__(self):
        self.root = None

    def insert(self, value):
        """Insert a value into the BST."""
        if self.root is None:
            self.root = Node(value)
        else:
            self._insert_recursive(self.root, value)

    def _insert_recursive(self, node, value):
        if value < node.value:
            if node.left is None:
                node.left = Node(value)
            else:
                self._insert_recursive(node.left, value)
        else:
            if node.right is None:
                node.right = Node(value)
            else:
                self._insert_recursive(node.right, value)

    def search(self, value):
        """Search for a value in the BST."""
        return self._search_recursive(self.root, value)

    def _search_recursive(self, node, value):
        if node is None or node.value == value:
            return node
        if value < node.value:
            return self._search_recursive(node.left, value)
        return self._search_recursive(node.right, value)

    def inorder_traversal(self):
        """Return sorted list via in-order traversal."""
        result = []
        self._inorder(self.root, result)
        return result

    def _inorder(self, node, result):
        if node:
            self._inorder(node.left, result)
            result.append(node.value)
            self._inorder(node.right, result)

    def delete(self, value):
        """Delete a node from the BST."""
        self.root = self._delete_recursive(self.root, value)

    def _delete_recursive(self, node, value):
        if node is None:
            return node
        if value < node.value:
            node.left = self._delete_recursive(node.left, value)
        elif value > node.value:
            node.right = self._delete_recursive(node.right, value)
        else:
            if node.left is None:
                return node.right
            elif node.right is None:
                return node.left
            min_node = self._find_min(node.right)
            node.value = min_node.value
            node.right = self._delete_recursive(node.right, min_node.value)
        return node

    def _find_min(self, node):
        current = node
        while current.left is not None:
            current = current.left
        return current


class Node:
    def __init__(self, value):
        self.value = value
        self.left = None
        self.right = None
`;

const JAVA_SAMPLE = `import java.util.NoSuchElementException;

public class LinkedList<T> {
    
    private Node<T> head;
    private int size;
    
    public LinkedList() {
        this.head = null;
        this.size = 0;
    }
    
    public void addFirst(T data) {
        Node<T> newNode = new Node<>(data);
        newNode.next = head;
        head = newNode;
        size++;
    }
    
    public void addLast(T data) {
        Node<T> newNode = new Node<>(data);
        if (head == null) {
            head = newNode;
        } else {
            Node<T> current = head;
            while (current.next != null) {
                current = current.next;
            }
            current.next = newNode;
        }
        size++;
    }
    
    public T removeFirst() {
        if (head == null) throw new NoSuchElementException();
        T data = head.data;
        head = head.next;
        size--;
        return data;
    }
    
    public boolean contains(T data) {
        Node<T> current = head;
        while (current != null) {
            if (current.data.equals(data)) return true;
            current = current.next;
        }
        return false;
    }
    
    public int size() {
        return size;
    }
    
    public void reverse() {
        Node<T> prev = null;
        Node<T> current = head;
        while (current != null) {
            Node<T> next = current.next;
            current.next = prev;
            prev = current;
            current = next;
        }
        head = prev;
    }
    
    private static class Node<T> {
        T data;
        Node<T> next;
        Node(T data) { this.data = data; }
    }
}
`;

const SAMPLES = {
  python: PYTHON_SAMPLE,
  java: JAVA_SAMPLE
};

export default function CodeEditor({ code, language, onCodeChange, onLanguageChange, onParse, loading, viewMode, onViewModeChange }) {
  const [showSamples, setShowSamples] = useState(false);

  const loadSample = () => {
    onCodeChange(SAMPLES[language]);
    setShowSamples(false);
  };

  const clearCode = () => {
    onCodeChange('');
  };

  const lineCount = code.split('\n').length;

  return (
    <div className="code-editor">
      {/* Editor Header */}
      <div className="code-editor__header">
        <div className="code-editor__title">
          <Code2 size={16} className="code-editor__title-icon" />
          <span>Code Input</span>
        </div>
        <div className="code-editor__controls">
          {/* Language Selector */}
          <div className="lang-selector">
            <button
              className={`lang-btn ${language === 'python' ? 'lang-btn--active' : ''}`}
              onClick={() => onLanguageChange('python')}
              id="lang-python"
            >
              Python
            </button>
            <button
              className={`lang-btn ${language === 'java' ? 'lang-btn--active' : ''}`}
              onClick={() => onLanguageChange('java')}
              id="lang-java"
            >
              Java
            </button>
          </div>

          {/* View Mode Toggle — only shown when prop is provided (Paste Code tab only) */}
          {onViewModeChange && (
            <div className="view-mode-toggle" role="group" aria-label="Visualization mode">
              <button
                className={`view-mode-btn ${viewMode === 'simple' ? 'view-mode-btn--active' : ''}`}
                onClick={() => onViewModeChange('simple')}
                id="btn-simple-mode"
                title="Simple Mode — clean card view for single functions"
              >
                <Layers size={11} />
                Simple
              </button>
              <button
                className={`view-mode-btn ${viewMode === 'codebase' ? 'view-mode-btn--active' : ''}`}
                onClick={() => onViewModeChange('codebase')}
                id="btn-codebase-mode"
                title="Codebase Mode — full class/method graph"
              >
                <LayoutGrid size={11} />
                Codebase
              </button>
            </div>
          )}

          {/* Sample Button */}
          <button
            className="editor-action-btn"
            onClick={loadSample}
            title={`Load ${language} sample`}
            id="btn-load-sample"
          >
            <ChevronDown size={13} />
            Sample
          </button>

          {/* Clear Button */}
          <button
            className="editor-action-btn editor-action-btn--danger"
            onClick={clearCode}
            title="Clear editor"
            id="btn-clear-editor"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Editor Body */}
      <div className="code-editor__body">
        <div className="code-editor__line-numbers" aria-hidden="true">
          {Array.from({ length: lineCount }, (_, i) => (
            <span key={i + 1} className="line-num">{i + 1}</span>
          ))}
        </div>
        <textarea
          id="code-textarea"
          className="code-editor__textarea"
          value={code}
          onChange={e => onCodeChange(e.target.value)}
          placeholder={`Paste your ${language === 'python' ? 'Python' : 'Java'} code here...\n\nOr click "Sample" to load a demo.`}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
        />
      </div>

      {/* Editor Footer */}
      <div className="code-editor__footer">
        <span className="editor-stat">{lineCount} lines</span>
        <span className="editor-stat">{code.length} chars</span>
        <button
          id="btn-parse"
          className="parse-btn"
          onClick={onParse}
          disabled={loading || !code.trim()}
        >
          {loading ? (
            <>
              <span className="spinner" /> Parsing...
            </>
          ) : (
            <>
              <Play size={14} /> Parse Code
            </>
          )}
        </button>
      </div>
    </div>
  );
}
