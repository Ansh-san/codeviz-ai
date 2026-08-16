/**
 * POST /api/analyze-repo
 *
 * Accepts { repoUrl } or { owner, repo, branch } and fetches the full file
 * tree of a public GitHub repository via the GitHub REST API, then runs the
 * tree-sitter parsers on every supported source file (.py / .java) to build a
 * combined cross-file call graph.
 *
 * ── API vs git-clone decision ────────────────────────────────────────────────
 * We use the GitHub REST API rather than a shallow `git clone` for three
 * reasons:
 *   1. No `git` binary dependency — the server works identically on every
 *      deployment platform (Render, Railway, Fly.io, etc.)
 *   2. No temp-directory lifecycle to manage (creation, cleanup, crashes)
 *   3. Works on read-only filesystems (some PaaS containers)
 *
 * Tradeoff: unauthenticated requests are rate-limited to 60 req/hr per IP.
 * A 300-file analysis consumes ~302 API calls (1 tree + 301 file fetches),
 * which would exhaust the anonymous limit. With GITHUB_TOKEN the limit rises
 * to 5000 req/hr — more than sufficient. The env var is optional but strongly
 * recommended for serious use.
 *
 * ── Cross-file call resolution ───────────────────────────────────────────────
 * Cross-file call edges are BEST-EFFORT, not a full linker:
 *   - If file A imports `foo` from module B, and module B defines a function
 *     named `foo`, we emit a cross-file call edge.
 *   - We do NOT resolve dynamic dispatch, monkey-patching, or conditional
 *     imports. This is sufficient to give a useful high-level graph.
 */

import express, { Request, Response } from 'express';
import https from 'https';
import { LRUCache } from 'lru-cache';
import { parsePython } from '../parsers/pythonParser';
import { parseJava } from '../parsers/javaParser';
import type { GraphNode, GraphEdge, RepoAnalysisResult } from '../types';

const router = express.Router();

// ── In-memory LRU cache ───────────────────────────────────────────────────────
// Key: "owner/repo@branch@sha" — ensures stale results are never served after a push.
// Max 20 repo graphs in memory (~reasonable for a single-server deployment).
const repoCache = new LRUCache<string, RepoAnalysisResult>({
  max: 20,
  ttl: 1000 * 60 * 30 // 30 minutes TTL as a safety net
});

// ── Constants ─────────────────────────────────────────────────────────────────
const MAX_FILES = 300;
const MAX_TOTAL_BYTES = 5 * 1024 * 1024; // 5 MB

const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'build', '.git', 'venv', '__pycache__',
  '.tox', '.mypy_cache', '.pytest_cache', 'vendor', 'target',
  '.gradle', 'out', 'bin', '.idea', '.vscode'
]);

const SUPPORTED_EXT = new Set(['.py', '.java']);

// ── GitHub API helper ─────────────────────────────────────────────────────────

interface GitHubTreeItem {
  type: string;
  path: string;
  sha: string;
  size?: number;
  url: string;
}

interface GitHubTreeResponse {
  tree: GitHubTreeItem[];
  truncated: boolean;
}

interface GitHubFileContent {
  content: string;
  encoding: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function githubGet<T = any>(path: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const token = process.env.GITHUB_TOKEN;
    const options: https.RequestOptions = {
      hostname: 'api.github.com',
      path,
      method: 'GET',
      headers: {
        'User-Agent': 'codeviz-ai/1.0',
        'Accept': 'application/vnd.github.v3+json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 404) {
          return reject(new Error(`GitHub API 404: ${path}`));
        }
        if (res.statusCode === 403) {
          return reject(new Error('GitHub API rate limit exceeded. Set GITHUB_TOKEN in server/.env'));
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`GitHub API error ${res.statusCode}: ${data.slice(0, 200)}`));
        }
        try {
          resolve(JSON.parse(data) as T);
        } catch {
          reject(new Error('Invalid JSON from GitHub API'));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('GitHub API timeout')); });
    req.end();
  });
}

// ── URL parser ────────────────────────────────────────────────────────────────

function parseRepoUrl(repoUrl: string): { owner: string; repo: string; branch: string | null } {
  const match = repoUrl.match(
    /github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/tree\/([^/]+))?(?:\/|$)/
  );
  if (!match) throw new Error('Invalid GitHub URL. Use: https://github.com/owner/repo');
  return {
    owner: match[1],
    repo: match[2],
    branch: match[3] || null
  };
}

// ── Request body type ─────────────────────────────────────────────────────────

interface AnalyzeRepoBody {
  repoUrl?: string;
  owner?: string;
  repo?: string;
  branch?: string;
}

// ── Main route ────────────────────────────────────────────────────────────────

router.post('/', async (req: Request<object, object, AnalyzeRepoBody>, res: Response) => {
  const startTime = Date.now();
  try {
    let { repoUrl, owner, repo, branch } = req.body;

    if (repoUrl) {
      const parsed = parseRepoUrl(repoUrl);
      owner = parsed.owner;
      repo = parsed.repo;
      branch = branch ?? parsed.branch ?? undefined;
    }

    if (!owner || !repo) {
      return res.status(400).json({
        error: 'Provide either { repoUrl } or { owner, repo, branch }'
      });
    }

    console.log(`[AnalyzeRepo] ${owner}/${repo} branch=${branch || 'default'}`);

    // ── 1. Resolve default branch + get latest commit SHA ─────────────────────
    const repoMeta = await githubGet<{ default_branch: string }>(`/repos/${owner}/${repo}`);
    if (!branch) branch = repoMeta.default_branch;

    const branchData = await githubGet<{ commit: { sha: string } }>(`/repos/${owner}/${repo}/branches/${branch}`);
    const commitSha: string = branchData.commit.sha;
    const cacheKey = `${owner}/${repo}@${branch}@${commitSha}`;

    // ── 2. Check cache ─────────────────────────────────────────────────────────
    if (repoCache.has(cacheKey)) {
      console.log(`[AnalyzeRepo] Cache hit: ${cacheKey}`);
      return res.json({
        success: true,
        cached: true,
        owner, repo, branch, commitSha,
        ...repoCache.get(cacheKey)
      });
    }

    // ── 3. Fetch the full recursive file tree ──────────────────────────────────
    const treeData = await githubGet<GitHubTreeResponse>(
      `/repos/${owner}/${repo}/git/trees/${commitSha}?recursive=1`
    );

    if (treeData.truncated) {
      console.warn(`[AnalyzeRepo] Tree truncated for ${owner}/${repo} — very large repo`);
    }

    const files = (treeData.tree || []).filter(item => {
      if (item.type !== 'blob') return false;
      const parts = item.path.split('/');
      if (parts.some(p => SKIP_DIRS.has(p))) return false;
      const ext = item.path.slice(item.path.lastIndexOf('.'));
      return SUPPORTED_EXT.has(ext);
    });

    if (files.length > MAX_FILES) {
      return res.status(413).json({
        error: `Repository has ${files.length} supported files (limit: ${MAX_FILES}). ` +
          'Use GITHUB_TOKEN and a more specific subdirectory if needed.'
      });
    }

    console.log(`[AnalyzeRepo] ${files.length} files to parse`);

    // ── 4. Fetch and parse each file ──────────────────────────────────────────
    const allNodes: GraphNode[] = [];
    const allEdges: GraphEdge[] = [];
    const moduleExports: Record<string, {
      funcNames: Set<string>;
      classNames: Set<string>;
      idMap: Record<string, string>;
      nodes: GraphNode[];
    }> = {};
    const fileNodeMap: Record<string, string> = {};

    let totalBytes = 0;
    let parsedCount = 0;
    let errorCount = 0;

    // Add a "file" node for each source file
    files.forEach((file, idx) => {
      const fileNodeId = `file_${idx}`;
      fileNodeMap[file.path] = fileNodeId;
      const ext = file.path.slice(file.path.lastIndexOf('.'));
      allNodes.push({
        id: fileNodeId,
        type: 'classNode', // reuse classNode visual for file-level nodes
        data: {
          label: file.path.split('/').pop() ?? file.path,
          nodeType: 'file',
          filePath: file.path,
          language: ext === '.py' ? 'python' : 'java',
          lineNumber: 1,
          code: `// ${file.path}`,
          methodCount: 0
        },
        position: { x: 0, y: 0 }
      });
    });

    // Fetch + parse files sequentially to avoid hitting rate limits too fast
    for (const file of files) {
      const ext = file.path.slice(file.path.lastIndexOf('.'));
      const fileNodeId = fileNodeMap[file.path];

      try {
        const fileData = await githubGet<GitHubFileContent>(
          `/repos/${owner}/${repo}/contents/${file.path}?ref=${commitSha}`
        );

        const content = Buffer.from(fileData.content, 'base64').toString('utf8');
        totalBytes += content.length;

        if (totalBytes > MAX_TOTAL_BYTES) {
          return res.status(413).json({
            error: `Total content exceeds ${MAX_TOTAL_BYTES / 1024 / 1024} MB limit after ${parsedCount} files.`
          });
        }

        const filePrefix = `f${parsedCount}_`;
        const parseResult = ext === '.py' ? parsePython(content) : parseJava(content);

        const idMap: Record<string, string> = {};
        parseResult.nodes.forEach(n => {
          const newId = `${filePrefix}${n.id}`;
          idMap[n.id] = newId;
          allNodes.push({ ...n, id: newId });
        });
        parseResult.edges.forEach(e => {
          allEdges.push({
            ...e,
            id: `${filePrefix}${e.id}`,
            source: idMap[e.source] || e.source,
            target: idMap[e.target] || e.target
          });
        });

        // Containment edges: fileNode → each top-level node in this file
        parseResult.nodes
          .filter(n => !(n.data as { containingClass?: string }).containingClass && n.data.nodeType !== 'import')
          .forEach(n => {
            const newId = idMap[n.id];
            allEdges.push({
              id: `edge_file_${fileNodeId}_${newId}`,
              source: fileNodeId,
              target: newId,
              label: 'contains',
              type: 'smoothstep',
              style: { stroke: '#334155', strokeWidth: 1 },
              markerEnd: { type: 'arrowclosed', color: '#334155' },
              data: { edgeType: 'file-containment' }
            });
          });

        moduleExports[file.path] = {
          funcNames: new Set(
            parseResult.nodes
              .filter(n => n.data.nodeType === 'function' || n.data.nodeType === 'method')
              .map(n => n.data.label)
          ),
          classNames: new Set(
            parseResult.nodes
              .filter(n => n.type === 'classNode')
              .map(n => n.data.label)
          ),
          idMap,
          nodes: parseResult.nodes
        };

        parsedCount++;
      } catch (fileErr) {
        const ferr = fileErr as Error;
        console.warn(`[AnalyzeRepo] Skip ${file.path}: ${ferr.message}`);
        errorCount++;
      }
    }

    // ── 5. Best-effort cross-file import edges ────────────────────────────────
    //
    // For each file, find import nodes. If the imported module name matches
    // another file's path stem, emit a cross-file edge between file nodes.
    // This is intentionally simple — not a full module resolver.

    for (const [filePath, exports] of Object.entries(moduleExports)) {
      const importNodes = exports.nodes.filter(n => n.data.nodeType === 'import');
      importNodes.forEach(imp => {
        const importedLabel = imp.data.label;
        for (const [otherPath] of Object.entries(moduleExports)) {
          if (otherPath === filePath) continue;
          const otherStem = otherPath.replace(/\.(py|java)$/, '').replace(/\//g, '.');
          const otherName = otherPath.split('/').pop()?.replace(/\.(py|java)$/, '') ?? '';
          if (
            importedLabel === otherName ||
            importedLabel === otherStem ||
            importedLabel.startsWith(otherStem + '.') ||
            importedLabel.startsWith(otherName + '.')
          ) {
            const srcFileNodeId = fileNodeMap[filePath];
            const tgtFileNodeId = fileNodeMap[otherPath];
            if (srcFileNodeId && tgtFileNodeId) {
              const edgeId = `cross_import_${srcFileNodeId}_${tgtFileNodeId}`;
              if (!allEdges.find(e => e.id === edgeId)) {
                allEdges.push({
                  id: edgeId,
                  source: srcFileNodeId,
                  target: tgtFileNodeId,
                  label: 'imports',
                  type: 'smoothstep',
                  animated: false,
                  style: { stroke: '#7c3aed', strokeDasharray: '4 2', strokeWidth: 1.5 },
                  markerEnd: { type: 'arrowclosed', color: '#7c3aed' },
                  data: { edgeType: 'cross-import' }
                });
              }
            }
          }
        }
      });
    }

    // Deduplicate edges
    const seenEdges = new Set<string>();
    const dedupedEdges = allEdges.filter(e => {
      const key = `${e.source}->${e.target}:${e.data?.edgeType}`;
      if (seenEdges.has(key)) return false;
      seenEdges.add(key);
      return true;
    });

    const stats = {
      files: parsedCount,
      filesSkipped: errorCount,
      nodes: allNodes.length,
      edges: dedupedEdges.length,
      totalBytes,
      durationMs: Date.now() - startTime
    };

    console.log(`[AnalyzeRepo] Done: ${JSON.stringify(stats)}`);

    const result: RepoAnalysisResult = {
      nodes: allNodes,
      edges: dedupedEdges,
      stats
    };

    repoCache.set(cacheKey, result);

    return res.json({
      success: true,
      owner, repo, branch, commitSha,
      ...result
    });

  } catch (err) {
    const error = err as Error;
    console.error('[AnalyzeRepo Error]', error.message);
    return res.status(500).json({
      error: error.message || 'Repository analysis failed'
    });
  }
});

export default router;
