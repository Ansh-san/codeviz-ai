import { useState } from 'react';
import { Github, Search, AlertTriangle, Loader2, PackageCheck } from 'lucide-react';

export default function RepoInput({ onAnalyze, loading, error, progress }) {
  const [url, setUrl] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!loading && url.trim()) {
      onAnalyze(url.trim());
    }
  };

  const EXAMPLE_REPOS = [
    'https://github.com/keon/algorithms',
    'https://github.com/TheAlgorithms/Python',
  ];

  return (
    <div className="repo-input">
      {/* Header */}
      <div className="repo-input__header">
        <Github size={16} className="repo-input__icon" />
        <span>Analyze GitHub Repo</span>
      </div>

      {/* URL Form */}
      <form className="repo-input__form" onSubmit={handleSubmit}>
        <div className="repo-input__field-wrap">
          <input
            id="repo-url-input"
            className="repo-input__field"
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://github.com/owner/repo"
            disabled={loading}
            spellCheck={false}
          />
        </div>
        <button
          id="btn-analyze-repo"
          className="repo-input__submit"
          type="submit"
          disabled={loading || !url.trim()}
        >
          {loading ? (
            <><Loader2 size={14} className="spin" /> Analyzing...</>
          ) : (
            <><Search size={14} /> Analyze</>
          )}
        </button>
      </form>

      {/* Progress */}
      {loading && progress && (
        <div className="repo-input__progress">
          <Loader2 size={12} className="spin" />
          <span>{progress}</span>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="repo-input__error">
          <AlertTriangle size={14} />
          <span>{error}</span>
        </div>
      )}

      {/* Info / Examples */}
      {!loading && !error && (
        <div className="repo-input__info">
          <p className="repo-input__info-title">
            <PackageCheck size={12} /> Supports <strong>.py</strong> and <strong>.java</strong> files
          </p>
          <p className="repo-input__info-limit">
            Limit: 300 files / 5 MB · Optional: add <code>GITHUB_TOKEN</code> for higher rate limits
          </p>
          <div className="repo-input__examples">
            <span className="repo-input__example-label">Try:</span>
            {EXAMPLE_REPOS.map(r => (
              <button
                key={r}
                className="repo-input__example-btn"
                onClick={() => setUrl(r)}
                type="button"
              >
                {r.replace('https://github.com/', '')}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
