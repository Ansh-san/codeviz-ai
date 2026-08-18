import { Zap, Clock, HardDrive, ChevronRight, AlertCircle, Loader2 } from 'lucide-react';

// ── Pattern → colour-group mapping ──────────────────────────────────────────
const PATTERN_COLORS = {
  'Backtracking':    'pattern--violet',
  'DFS':             'pattern--violet',
  'BFS':             'pattern--violet',
  'Recursion':       'pattern--violet',
  'Divide & Conquer':'pattern--violet',
  'Dynamic Programming': 'pattern--amber',
  'Greedy':          'pattern--amber',
  'Binary Search':   'pattern--cyan',
  'Two Pointers':    'pattern--cyan',
  'Sliding Window':  'pattern--cyan',
  'Hash Map/Set':    'pattern--emerald',
  'Union Find':      'pattern--emerald',
  'Sorting':         'pattern--rose',
  'Brute Force':     'pattern--rose',
  'Unclassified':    'pattern--muted',
};

// ── Recursion Trace mini-diagram ─────────────────────────────────────────────
function RecursionTrace({ trace }) {
  if (!trace || trace.length === 0) return null;
  return (
    <div className="sm-trace" aria-label="Recursion call trace">
      <div className="sm-trace__label">
        <span className="recursive-icon">↺</span> Recursion Trace
      </div>
      <div className="sm-trace__steps">
        {trace.map((step, i) => (
          <div key={i} className="sm-trace__step">
            <div
              className="sm-trace__step-line"
              style={{ paddingLeft: `${i * 16}px` }}
            >
              {i > 0 && <span className="sm-trace__connector">↳ </span>}
              <code className="sm-trace__call">{step.call}</code>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Individual function card ──────────────────────────────────────────────────
function FunctionCard({ fn, isMain }) {
  const patternColor = PATTERN_COLORS[fn.pattern] || 'pattern--muted';
  const hasComplexity = fn.complexity?.time || fn.complexity?.space;

  return (
    <div className={`sm-card ${isMain ? 'sm-card--main' : 'sm-card--helper'}`}>
      {/* Card role label */}
      <div className="sm-card__role">
        {isMain ? '⬡ Main Function' : '⬡ Helper Function'}
      </div>

      {/* Function name + signature */}
      <div className="sm-card__header">
        <h2 className="sm-card__name">{fn.name}</h2>
        {(fn.params || fn.returnType) && (
          <div className="sm-card__sig">
            {fn.params && <span className="sm-sig__params">({fn.params})</span>}
            {fn.returnType && (
              <>
                <span className="sm-sig__arrow"> → </span>
                <span className="sm-sig__return">{fn.returnType}</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Badges row */}
      <div className="sm-card__badges">
        <span className={`sm-pattern-badge ${patternColor}`}>
          <Zap size={10} />
          {fn.pattern}
        </span>

        {fn.isRecursive && (
          <span className="sm-pattern-badge pattern--recursive">
            <span className="recursive-icon">↺</span> Recursive
          </span>
        )}

        {hasComplexity && (
          <span className="sm-complexity-pill">
            {fn.complexity.time && (
              <>
                <Clock size={10} />
                <span>{fn.complexity.time}</span>
              </>
            )}
            {fn.complexity.time && fn.complexity.space && (
              <span className="sm-complexity-divider">·</span>
            )}
            {fn.complexity.space && (
              <>
                <HardDrive size={10} />
                <span>{fn.complexity.space}</span>
              </>
            )}
          </span>
        )}
      </div>

      {/* Plain-English explanation — visible without clicking */}
      {fn.explanation && (
        <p className="sm-card__explanation">{fn.explanation}</p>
      )}

      {/* Recursion trace — only for recursive functions */}
      {fn.isRecursive && fn.exampleTrace && (
        <RecursionTrace trace={fn.exampleTrace} />
      )}
    </div>
  );
}

// ── "calls" arrow between cards ───────────────────────────────────────────────
function CallsArrow() {
  return (
    <div className="sm-arrow" aria-hidden="true">
      <div className="sm-arrow__line" />
      <div className="sm-arrow__label">calls</div>
      <ChevronRight size={14} className="sm-arrow__head" />
    </div>
  );
}

// ── Loading state ─────────────────────────────────────────────────────────────
function SimpleModeLoading() {
  return (
    <div className="sm-loading" aria-live="polite" aria-label="Analyzing snippet">
      <div className="sm-loading__inner">
        <Loader2 size={28} className="sm-loading__spinner" />
        <p className="sm-loading__text">Analyzing snippet with Gemini AI…</p>
        <p className="sm-loading__sub">Classifying pattern · estimating complexity · generating trace</p>
      </div>
    </div>
  );
}

// ── Error state ───────────────────────────────────────────────────────────────
function SimpleModeError({ error }) {
  return (
    <div className="sm-error" aria-live="polite">
      <AlertCircle size={20} />
      <p>{error}</p>
    </div>
  );
}

// ── Empty / prompt state ──────────────────────────────────────────────────────
function SimpleModeEmpty() {
  return (
    <div className="sm-empty">
      <div className="sm-empty__inner">
        <div className="sm-empty__icon">⬡</div>
        <h3 className="sm-empty__title">Simple Mode</h3>
        <p className="sm-empty__desc">
          Paste a LeetCode-style snippet and click{' '}
          <strong>Parse &amp; Analyze</strong> to see a clean,
          single-function breakdown — no container hierarchy.
        </p>
        <div className="sm-empty__examples">
          <span className="hint-chip hint-chip--fn">↺ Recursion trace</span>
          <span className="hint-chip hint-chip--call">⚡ DSA pattern</span>
          <span className="hint-chip hint-chip--cls">O(n) complexity</span>
        </div>
      </div>
    </div>
  );
}

// ── Mock banner ───────────────────────────────────────────────────────────────
function MockBanner() {
  return (
    <div className="sm-mock-banner" role="alert">
      ⚠️ Mock analysis — add <code>GEMINI_API_KEY</code> to{' '}
      <code>server/.env</code> for real AI results.
    </div>
  );
}

// ── Root component ────────────────────────────────────────────────────────────
/**
 * SimpleModeView — flat, two-card layout for LeetCode-style snippets.
 * Completely replaces the ReactFlow canvas in Simple Mode; zero dependency
 * on any ReactFlow API.
 *
 * Props:
 *   loading  — true while the Gemini call is in flight
 *   error    — error string from useSimpleAnalyzer, or null
 *   result   — { functions: FunctionAnalysis[] } or null
 *   isMock   — whether the result came from the mock fallback
 */
export default function SimpleModeView({ loading, error, result, isMock }) {
  if (loading) return <SimpleModeLoading />;
  if (error)   return <SimpleModeError error={error} />;
  if (!result || result.functions.length === 0) return <SimpleModeEmpty />;

  const functions = result.functions;

  // Sort: main first, then helpers
  const sorted = [
    ...functions.filter(f => f.role === 'main'),
    ...functions.filter(f => f.role === 'helper'),
  ];

  return (
    <div className="simple-view" role="main" aria-label="Simple Mode visualization">
      {isMock && <MockBanner />}

      <div className="simple-view__cards">
        {sorted.map((fn, idx) => (
          <div key={fn.name + idx} className="simple-view__card-slot">
            <FunctionCard fn={fn} isMain={fn.role === 'main'} />
            {/* Draw "calls" arrow between consecutive cards */}
            {idx < sorted.length - 1 && <CallsArrow />}
          </div>
        ))}
      </div>
    </div>
  );
}
