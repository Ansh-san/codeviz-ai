import { useState, useCallback } from 'react';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

/**
 * Hook for the /api/analyze-simple endpoint.
 * Returns structured analysis data (pattern, complexity, explanation, recursion trace)
 * for a small snippet — used exclusively by SimpleModeView.
 */
export function useSimpleAnalyzer() {
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [result, setResult]     = useState(null);
  const [isMock, setIsMock]     = useState(false);

  const analyze = useCallback(async (code, language = 'python') => {
    setLoading(true);
    setError(null);
    setResult(null);
    setIsMock(false);

    try {
      const res = await axios.post(
        `${API_BASE}/analyze-simple`,
        { code, language },
        { timeout: 40000 }   // slightly longer — structured JSON prompt needs more tokens
      );
      setResult(res.data.result);
      setIsMock(!!res.data.mock);
      return res.data.result;
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Simple analysis request failed';
      setError(msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const clearResult = useCallback(() => {
    setResult(null);
    setError(null);
    setIsMock(false);
  }, []);

  return { analyze, loading, error, result, isMock, clearResult };
}
