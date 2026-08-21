import { useState, useCallback } from 'react';
import { ReactFlowProvider } from 'reactflow';
import CodeEditor from './components/CodeEditor';
import CanvasView from './components/CanvasView';
import AIPanel from './components/AIPanel';
import RepoInput from './components/RepoInput';
import SimpleModeView from './components/SimpleModeView';
import { useParser } from './hooks/useParser';
import { useAnalyzer } from './hooks/useAnalyzer';
import { useRepoAnalyzer } from './hooks/useRepoAnalyzer';
import { useSimpleAnalyzer } from './hooks/useSimpleAnalyzer';
import { Cpu, Sparkles, Activity, AlertCircle, Bot, Code2 } from 'lucide-react';
import { FaGithub } from 'react-icons/fa';

export default function App() {
  // ── Input mode: 'paste' (single-file) or 'repo' (GitHub) ─────────────────
  const [inputMode, setInputMode] = useState('paste');

  // ── View mode: 'simple' (flat card view) or 'codebase' (full graph) ───────
  // Only relevant in the 'paste' tab. Repo analysis always uses 'codebase'.
  const [viewMode, setViewMode] = useState('codebase');

  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('python');
  const [graphData, setGraphData] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [parseStats, setParseStats] = useState(null);
  const [analysisMode, setAnalysisMode] = useState('tech');
  const [repoMeta, setRepoMeta] = useState(null);

  const { parse, loading: parseLoading, error: parseError } = useParser();
  const { analyze, loading: analyzeLoading, error: analyzeError, analysis, isMock, clearAnalysis } = useAnalyzer();
  const { analyzeRepo, loading: repoLoading, error: repoError, progress: repoProgress, clearResult: clearRepo } = useRepoAnalyzer();
  const { analyze: analyzeSimple, loading: simpleLoading, error: simpleError, result: simpleResult, isMock: simpleMock, clearResult: clearSimple } = useSimpleAnalyzer();

  // ── Paste-code flow ────────────────────────────────────────────────────────

  const handleParse = useCallback(async () => {
    const result = await parse(code, language);
    if (result) {
      setGraphData(result);
      // Derive stats from the actual arrays, not result.stats, so the topbar
      // count matches the canvas count (canvas hides membership edges in layout).
      setParseStats({
        nodes: result.nodes.length,
        edges: result.edges.filter(e => e.data?.edgeType !== 'membership').length
      });
      setSelectedNode(null);
      setIsPanelOpen(false);
      setRepoMeta(null);
      clearAnalysis();

      // ── Auto-trigger Simple Mode analysis when in simple view ─────────────
      if (viewMode === 'simple') {
        clearSimple();
        analyzeSimple(code, language);
      }
    }
  }, [code, language, parse, clearAnalysis, viewMode, analyzeSimple, clearSimple]);

  // ── Repo analysis flow ─────────────────────────────────────────────────────

  const handleAnalyzeRepo = useCallback(async (repoUrl) => {
    const result = await analyzeRepo(repoUrl);
    if (result) {
      setGraphData(result);
      // Same single source of truth: count from actual arrays, membership edges excluded.
      setParseStats({
        nodes: result.nodes.length,
        edges: result.edges.filter(e => e.data?.edgeType !== 'membership').length
      });
      setRepoMeta(result.repoMeta);
      setSelectedNode(null);
      setIsPanelOpen(false);
      clearAnalysis();
    }
  }, [analyzeRepo, clearAnalysis]);

  // ── Node click → AI Inspector ──────────────────────────────────────────────

  const handleNodeClick = useCallback(async (node) => {
    setSelectedNode(node);
    setIsPanelOpen(true);
    clearAnalysis();
    await analyze(
      node.data.code || `// ${node.data.label}`,
      node.data.label,
      node.data.nodeType,
      node.data.language || language,
      analysisMode
    );
  }, [analyze, clearAnalysis, language, analysisMode]);

  const handleModeChange = useCallback(async (newMode) => {
    if (newMode === analysisMode) return;
    setAnalysisMode(newMode);
    clearAnalysis();
    if (selectedNode) {
      await analyze(
        selectedNode.data.code || `// ${selectedNode.data.label}`,
        selectedNode.data.label,
        selectedNode.data.nodeType,
        selectedNode.data.language || language,
        newMode
      );
    }
  }, [analysisMode, selectedNode, analyze, clearAnalysis, language]);

  const handleClosePanel = useCallback(() => {
    setIsPanelOpen(false);
    setSelectedNode(null);
    clearAnalysis();
  }, [clearAnalysis]);

  const handleLanguageChange = useCallback((lang) => {
    setLanguage(lang);
    setCode('');
    setGraphData(null);
    setParseStats(null);
    setRepoMeta(null);
    clearAnalysis();
    clearSimple();
    setSelectedNode(null);
    setIsPanelOpen(false);
  }, [clearAnalysis, clearSimple]);

  // ── Mode tab switch ────────────────────────────────────────────────────────

  const handleModeSwitch = useCallback((mode) => {
    setInputMode(mode);
    // Repo tab always uses codebase mode
    if (mode === 'repo') setViewMode('codebase');
    // Clear graph when switching modes so stale data isn't confusing
    setGraphData(null);
    setParseStats(null);
    setRepoMeta(null);
    setSelectedNode(null);
    setIsPanelOpen(false);
    clearAnalysis();
    clearSimple();
    clearRepo();
  }, [clearAnalysis, clearSimple, clearRepo]);

  // ── View mode toggle (Simple ↔ Codebase) ──────────────────────────────────
  const handleViewModeChange = useCallback((mode) => {
    setViewMode(mode);
    // If switching to Simple and we already have graph data, run analysis now
    if (mode === 'simple' && graphData && code.trim()) {
      clearSimple();
      analyzeSimple(code, language);
    }
    // Clear simple results when switching away
    if (mode === 'codebase') clearSimple();
  }, [graphData, code, language, analyzeSimple, clearSimple]);

  const activeError = inputMode === 'paste' ? parseError : repoError;
  const activeLoading = inputMode === 'paste' ? parseLoading : repoLoading;

  return (
    <div className="app">
      {/* Top Nav Bar */}
      <header className="topbar" role="banner">
        <div className="topbar__brand">
          <div className="topbar__logo">
            <Cpu size={22} />
          </div>
          <div className="topbar__name-group">
            <span className="topbar__name">CodeViz</span>
            <span className="topbar__badge">AI</span>
          </div>
          <span className="topbar__tagline">Interactive AST Visualizer</span>
        </div>

        <div className="topbar__center">
          {parseStats && (
            <div className="parse-stats">
              <span className="stat-chip stat-chip--nodes">
                <Activity size={11} />
                {parseStats.nodes} nodes
              </span>
              <span className="stat-chip stat-chip--edges">
                <Activity size={11} />
                {parseStats.edges} edges
              </span>
              {repoMeta ? (
                <span className="stat-chip stat-chip--lang">
                  <FaGithub size={11} />
                  {repoMeta.repo}
                  {repoMeta.cached && <span title="Cached result"> (cached)</span>}
                </span>
              ) : (
                <span className="stat-chip stat-chip--lang">{language}</span>
              )}
            </div>
          )}
        </div>

        <div className="topbar__actions">
          {activeError && (
            <div className="topbar__error-pill">
              <AlertCircle size={13} />
              <span>{activeError}</span>
            </div>
          )}
          <div className="topbar__ai-indicator">
            <Bot size={14} />
            <span>CodeViz AI</span>
            <span className="ai-status-dot" />
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <main className="main-layout" role="main">
        {/* Left Panel: Code Editor OR Repo Input */}
        <aside className="left-panel" aria-label="Input Panel">
          {/* Mode tabs */}
          <div className="input-mode-tabs">
            <button
              className={`input-mode-tab ${inputMode === 'paste' ? 'input-mode-tab--active' : ''}`}
              onClick={() => handleModeSwitch('paste')}
              id="tab-paste"
              title="Paste code and visualize"
            >
              <Code2 size={13} />
              <span>Paste Code</span>
            </button>
            <button
              className={`input-mode-tab ${inputMode === 'repo' ? 'input-mode-tab--active' : ''}`}
              onClick={() => handleModeSwitch('repo')}
              id="tab-repo"
              title="Analyze a GitHub repository"
            >
              <FaGithub size={13} />
              <span>GitHub Repo</span>
            </button>
          </div>

          {inputMode === 'paste' ? (
            <CodeEditor
              code={code}
              language={language}
              onCodeChange={setCode}
              onLanguageChange={handleLanguageChange}
              onParse={handleParse}
              loading={parseLoading}
              viewMode={viewMode}
              onViewModeChange={handleViewModeChange}
            />
          ) : (
            <RepoInput
              onAnalyze={handleAnalyzeRepo}
              loading={repoLoading}
              error={repoError}
              progress={repoProgress}
            />
          )}
        </aside>

        {/* Center: Canvas — Simple Mode or Codebase graph */}
        <section className="canvas-section" aria-label="AST Graph Canvas">
          {viewMode === 'simple' && inputMode === 'paste' ? (
            <SimpleModeView
              loading={simpleLoading}
              error={simpleError}
              result={simpleResult}
              isMock={simpleMock}
            />
          ) : (
            <ReactFlowProvider>
              <CanvasView
                graphData={graphData}
                onNodeClick={handleNodeClick}
                selectedNodeId={selectedNode?.id}
              />
            </ReactFlowProvider>
          )}
        </section>

        {/* Right Panel: AI Inspector */}
        <aside
          className={`right-panel ${isPanelOpen ? 'right-panel--open' : ''}`}
          aria-label="AI Inspector Panel"
        >
          <AIPanel
            isOpen={isPanelOpen}
            onClose={handleClosePanel}
            selectedNode={selectedNode}
            analysis={analysis}
            loading={analyzeLoading}
            error={analyzeError}
            isMock={isMock}
            analysisMode={analysisMode}
            onModeChange={handleModeChange}
            allNodes={graphData?.nodes || []}
            allEdges={graphData?.edges || []}
          />
        </aside>
      </main>

      {/* Click hint overlay when graph is loaded but panel closed */}
      {graphData && !isPanelOpen && (
        <div className="click-hint" aria-live="polite">
          <Sparkles size={13} />
          Click any node to inspect with AI
        </div>
      )}
    </div>
  );
}
