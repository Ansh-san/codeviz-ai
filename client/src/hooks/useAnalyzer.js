import { useState, useCallback } from 'react';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export function useAnalyzer() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [isMock, setIsMock] = useState(false);

  const analyze = useCallback(async (code, nodeLabel, nodeType, language) => {
    setLoading(true);
    setError(null);
    setAnalysis(null);
    setIsMock(false);
    try {
      const res = await axios.post(`${API_BASE}/analyze`, { code, nodeLabel, nodeType, language }, {
        timeout: 30000
      });
      setAnalysis(res.data.analysis);
      setIsMock(!!res.data.mock);
      return res.data.analysis;
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Analysis request failed';
      setError(msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const clearAnalysis = useCallback(() => {
    setAnalysis(null);
    setError(null);
    setIsMock(false);
  }, []);

  return { analyze, loading, error, analysis, isMock, clearAnalysis };
}
