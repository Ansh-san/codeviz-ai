import { useState, useCallback } from 'react';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export function useParser() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const parse = useCallback(async (code, language) => {
    if (!code.trim()) {
      setError('Please enter some code to parse');
      return null;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post(`${API_BASE}/parse`, { code, language }, {
        timeout: 15000
      });
      setResult(res.data);
      return res.data;
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Parse request failed';
      setError(msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const clearResult = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { parse, loading, error, result, clearResult };
}
