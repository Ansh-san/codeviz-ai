import express, { Request, Response } from 'express';
import { parsePython } from '../parsers/pythonParser';
import { parseJava } from '../parsers/javaParser';

const router = express.Router();

interface ParseRequestBody {
  code?: string;
  language?: string;
}

router.post('/', (req: Request<object, object, ParseRequestBody>, res: Response) => {
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

    const result = lang === 'python' ? parsePython(code) : parseJava(code);

    // Deduplicate edges (same source/target/type triple)
    const seenEdges = new Set<string>();
    const dedupedEdges = result.edges.filter(e => {
      const key = `${e.source}->${e.target}:${e.data?.edgeType}`;
      if (seenEdges.has(key)) return false;
      seenEdges.add(key);
      return true;
    });

    console.log(`[Parse] Result: ${result.nodes.length} nodes, ${dedupedEdges.length} edges`);

    return res.json({
      success: true,
      language: lang,
      stats: { nodes: result.nodes.length, edges: dedupedEdges.length },
      nodes: result.nodes,
      edges: dedupedEdges
    });
  } catch (err) {
    const error = err as Error;
    console.error('[Parse Error]', error);
    return res.status(500).json({ error: 'Parse failed: ' + error.message });
  }
});

export default router;
