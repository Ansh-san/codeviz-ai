import { useState, useCallback } from 'react';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export function useRepoAnalyzer() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState(null); // status message

  const analyzeRepo = useCallback(async (repoUrl) => {
    if (!repoUrl?.trim()) {
      setError('Please enter a GitHub repository URL');
      return null;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    setProgress('Fetching repository metadata...');

    try {
      const res = await axios.post(
        `${API_BASE}/analyze-repo`,
        { repoUrl: repoUrl.trim() },
        { timeout: 120000 } // 2 min — large repos may take a while
      );

      const data = res.data;
      setProgress(null);
      setResult(data);

      // Build the graphData shape expected by App + CanvasView
      return {
        nodes: data.nodes,
        edges: data.edges,
        stats: {
          nodes: data.stats?.nodes ?? data.nodes.length,
          edges: data.stats?.edges ?? data.edges.length
        },
        repoMeta: {
          owner: data.owner,
          repo: data.repo,
          branch: data.branch,
          commitSha: data.commitSha,
          cached: data.cached,
          filesAnalyzed: data.stats?.files
        }
      };
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        (err.code === 'ECONNABORTED' ? 'Request timed out (>2 min). Try a smaller repo.' : null) ||
        err.message ||
        'Repository analysis failed';
      setError(msg);
      setProgress(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const clearResult = useCallback(() => {
    setResult(null);
    setError(null);
    setProgress(null);
  }, []);

  return { analyzeRepo, loading, error, progress, result, clearResult };
}
