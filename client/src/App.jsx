import { useState, useCallback } from 'react';
import { ReactFlowProvider } from 'reactflow';
import CodeEditor from './components/CodeEditor';
import CanvasView from './components/CanvasView';
import AIPanel from './components/AIPanel';
import RepoInput from './components/RepoInput';
import { useParser } from './hooks/useParser';
import { useAnalyzer } from './hooks/useAnalyzer';
import { useRepoAnalyzer } from './hooks/useRepoAnalyzer';
import { Cpu, Sparkles, Activity, AlertCircle, Bot, Code2, Github } from 'lucide-react';

export default function App() {
  // ── Input mode: 'paste' (single-file) or 'repo' (GitHub) ─────────────────
  const [inputMode, setInputMode] = useState('paste');

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

  // ── Paste-code flow ────────────────────────────────────────────────────────

  const handleParse = useCallback(async () => {
    const result = await parse(code, language);
    if (result) {
      setGraphData(result);
      setParseStats(result.stats);
      setSelectedNode(null);
      setIsPanelOpen(false);
      setRepoMeta(null);
      clearAnalysis();
    }
  }, [code, language, parse, clearAnalysis]);

  // ── Repo analysis flow ─────────────────────────────────────────────────────

  const handleAnalyzeRepo = useCallback(async (repoUrl) => {
    const result = await analyzeRepo(repoUrl);
    if (result) {
      setGraphData(result);
      setParseStats(result.stats);
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
    setSelectedNode(null);
    setIsPanelOpen(false);
  }, [clearAnalysis]);

  // ── Mode tab switch ────────────────────────────────────────────────────────

  const handleModeSwitch = useCallback((mode) => {
    setInputMode(mode);
    // Clear graph when switching modes so stale data isn't confusing
    setGraphData(null);
    setParseStats(null);
    setRepoMeta(null);
    setSelectedNode(null);
    setIsPanelOpen(false);
    clearAnalysis();
    clearRepo();
  }, [clearAnalysis, clearRepo]);

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
                  <Github size={11} />
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
            <span>Gemini AI</span>
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
              <Github size={13} />
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

        {/* Center: Canvas */}
        <section className="canvas-section" aria-label="AST Graph Canvas">
          <ReactFlowProvider>
            <CanvasView
              graphData={graphData}
              onNodeClick={handleNodeClick}
              selectedNodeId={selectedNode?.id}
            />
          </ReactFlowProvider>
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
