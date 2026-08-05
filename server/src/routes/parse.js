const express = require('express');
const { parsePython } = require('../parsers/pythonParser');
const { parseJava } = require('../parsers/javaParser');

const router = express.Router();

router.post('/', (req, res) => {
  try {
    const { code, language } = req.body;

    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid "code" field' });
    }

    const lang = (language || 'python').toLowerCase().trim();
    if (!['python', 'java'].includes(lang)) {
      return res.status(400).json({ error: 'Unsupported language. Use "python" or "java"' });
    }

    console.log(`[Parse] Language: ${lang}, Code length: ${code.length} chars`);

    let result;
    if (lang === 'python') {
      result = parsePython(code);
    } else {
      result = parseJava(code);
    }

    // Deduplicate edges (same source/target pair)
    const seenEdges = new Set();
    result.edges = result.edges.filter(e => {
      const key = `${e.source}->${e.target}:${e.data?.edgeType}`;
      if (seenEdges.has(key)) return false;
      seenEdges.add(key);
      return true;
    });

    console.log(`[Parse] Result: ${result.nodes.length} nodes, ${result.edges.length} edges`);

    res.json({
      success: true,
      language: lang,
      stats: { nodes: result.nodes.length, edges: result.edges.length },
      nodes: result.nodes,
      edges: result.edges
    });
  } catch (err) {
    console.error('[Parse Error]', err);
    res.status(500).json({ error: 'Parse failed: ' + err.message });
  }
});

module.exports = router;
