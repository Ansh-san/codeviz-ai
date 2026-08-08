import { useState, useCallback } from 'react';
import { ReactFlowProvider } from 'reactflow';
import CodeEditor from './components/CodeEditor';
import CanvasView from './components/CanvasView';
import AIPanel from './components/AIPanel';
import { useParser } from './hooks/useParser';
import { useAnalyzer } from './hooks/useAnalyzer';
import { Cpu, Sparkles, Activity, AlertCircle, Bot } from 'lucide-react';

export default function App() {
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('python');
  const [graphData, setGraphData] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [parseStats, setParseStats] = useState(null);
  const [analysisMode, setAnalysisMode] = useState('tech');

  const { parse, loading: parseLoading, error: parseError } = useParser();
  const { analyze, loading: analyzeLoading, error: analyzeError, analysis, isMock, clearAnalysis } = useAnalyzer();

  const handleParse = useCallback(async () => {
    const result = await parse(code, language);
    if (result) {
      setGraphData(result);
      setParseStats(result.stats);
      setSelectedNode(null);
      setIsPanelOpen(false);
      clearAnalysis();
    }
  }, [code, language, parse, clearAnalysis]);

  const handleNodeClick = useCallback(async (node) => {
    setSelectedNode(node);
    setIsPanelOpen(true);
    clearAnalysis();
    // Auto-trigger analysis on click with current mode
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
    // Re-trigger analysis with new mode if a node is selected
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
    clearAnalysis();
    setSelectedNode(null);
    setIsPanelOpen(false);
  }, [clearAnalysis]);

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
              <span className="stat-chip stat-chip--lang">{language}</span>
            </div>
          )}
        </div>

        <div className="topbar__actions">
          {parseError && (
            <div className="topbar__error-pill">
              <AlertCircle size={13} />
              <span>{parseError}</span>
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
        {/* Left Panel: Code Editor */}
        <aside className="left-panel" aria-label="Code Editor">
          <CodeEditor
            code={code}
            language={language}
            onCodeChange={setCode}
            onLanguageChange={handleLanguageChange}
            onParse={handleParse}
            loading={parseLoading}
          />
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
