import React, { useState, useEffect } from 'react';
import {
  Scan,
  Sparkles,
  ArrowRight,
  Play,
  Layers,
  FileCheck,
  AlertCircle,
  SlidersHorizontal,
  RotateCcw,
  CheckCircle2,
} from 'lucide-react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { ImageUploader } from './components/ImageUploader';
import { ProcessingPipeline } from './components/ProcessingPipeline';
import { RegistrationViewer } from './components/RegistrationViewer';
import { ResultsTabs } from './components/ResultsTabs';
import { MetricsPanel } from './components/MetricsPanel';
import { ExportPanel } from './components/ExportPanel';
import { DashboardView } from './components/DashboardView';
import { HistoryView } from './components/HistoryView';
import { AboutView } from './components/AboutView';
import { ReportModal } from './components/ReportModal';
import {
  LunarImageMeta,
  NavPage,
  PipelineStage,
  RegistrationHistoryItem,
  RegistrationParams,
  RegistrationResult,
  ViewTab,
} from './types/registration';
import {
  DEFAULT_REGISTRATION_PARAMS,
  INITIAL_PIPELINE_STAGES,
  RegistrationService,
} from './services/registrationService';
import {
  loadLunarDemoImages,
  LUNAR_PRESETS,
} from './services/lunarDatasetService';

export default function App() {
  // Navigation State
  const [currentPage, setCurrentPage] = useState<NavPage>('dashboard');
  const [activeResultTab, setActiveResultTab] = useState<ViewTab>('matches');

  // Registration Working State
  const [referenceImage, setReferenceImage] = useState<LunarImageMeta | null>(null);
  const [targetImage, setTargetImage] = useState<LunarImageMeta | null>(null);
  const [activePresetId, setActivePresetId] = useState<string>('shackleton-south-pole');
  const [params, setParams] = useState<RegistrationParams>(DEFAULT_REGISTRATION_PARAMS);

  // Pipeline & Execution State
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [pipelineStages, setPipelineStages] = useState<PipelineStage[]>(INITIAL_PIPELINE_STAGES);
  const [currentResult, setCurrentResult] = useState<RegistrationResult | null>(null);

  // History & Reports State
  const [history, setHistory] = useState<RegistrationHistoryItem[]>([]);
  const [showReportModal, setShowReportModal] = useState<boolean>(false);

  // Load initial benchmark result on first load for instant demonstration readiness
  useEffect(() => {
    const { reference, target, preset } = loadLunarDemoImages('shackleton-south-pole');
    setReferenceImage(reference);
    setTargetImage(target);

    // Bootstrap initial demo result quietly for immediate presentation readiness
    RegistrationService.executeRegistration(reference, target, DEFAULT_REGISTRATION_PARAMS).then(
      (result) => {
        setCurrentResult(result);
        setHistory([
          {
            id: `hist-${Date.now()}`,
            title: 'Shackleton Crater Rim - South Pole PSR',
            date: new Date().toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            }),
            refImageName: reference.name,
            targetImageName: target.name,
            refThumbnail: reference.url,
            targetThumbnail: target.url,
            inlierCount: result.metrics.validMatches,
            inlierRatio: result.metrics.inlierRatio,
            errorPx: result.metrics.registrationError,
            model: result.transformation.type,
            datasetType: preset.mission,
            result,
          },
        ]);
      }
    );
  }, []);

  // Quick Action: Load Demo Dataset
  const handleLoadDemoPreset = (presetId: string = 'shackleton-south-pole') => {
    setActivePresetId(presetId);
    const { reference, target } = loadLunarDemoImages(presetId);
    setReferenceImage(reference);
    setTargetImage(target);
    setCurrentPage('new-registration');
  };

  // Run Registration Workflow
  const handleRunRegistration = async () => {
    if (!referenceImage || !targetImage) return;

    setIsProcessing(true);
    setCurrentPage('processing');
    setPipelineStages(INITIAL_PIPELINE_STAGES.map((s) => ({ ...s, status: 'pending' })));

    try {
      const result = await RegistrationService.executeRegistration(
        referenceImage,
        targetImage,
        params,
        (stages) => setPipelineStages(stages)
      );

      setCurrentResult(result);
      setIsProcessing(false);
      setCurrentPage('results');
      setActiveResultTab('matches');

      // Add to History
      const selectedPreset = LUNAR_PRESETS.find((p) => p.id === activePresetId);
      const newHistoryItem: RegistrationHistoryItem = {
        id: `hist-${Date.now()}`,
        title: selectedPreset ? selectedPreset.name : 'Custom Lunar Upload Registration',
        date: new Date().toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
        refImageName: referenceImage.name,
        targetImageName: targetImage.name,
        refThumbnail: referenceImage.url,
        targetThumbnail: targetImage.url,
        inlierCount: result.metrics.validMatches,
        inlierRatio: result.metrics.inlierRatio,
        errorPx: result.metrics.registrationError,
        model: result.transformation.type,
        datasetType: referenceImage.missionSource || 'Lunar Surface',
        result,
      };

      setHistory((prev) => [newHistoryItem, ...prev]);
    } catch (err) {
      console.error('Registration failed:', err);
      setIsProcessing(false);
      alert('Registration processing encountered an error.');
    }
  };

  // Inspect previous result from history
  const handleViewHistoryResult = (item: RegistrationHistoryItem) => {
    setCurrentResult(item.result);
    setReferenceImage(item.result.referenceImage);
    setTargetImage(item.result.targetImage);
    setCurrentPage('results');
    setActiveResultTab('matches');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Top Navigation Bar */}
      <Header
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        onLoadDemo={() => handleLoadDemoPreset('shackleton-south-pole')}
        hasResult={!!currentResult}
      />

      {/* Main Layout Body */}
      <div className="flex-1 flex flex-col md:flex-row min-w-0">
        {/* Left Sidebar Navigation */}
        <Sidebar
          currentPage={currentPage}
          onNavigate={setCurrentPage}
          hasResult={!!currentResult}
        />

        {/* Content View Container */}
        <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto max-w-[1700px] w-full mx-auto">
          {/* 1. DASHBOARD VIEW */}
          {currentPage === 'dashboard' && (
            <DashboardView
              onNewRegistration={() => setCurrentPage('new-registration')}
              onSelectPreset={handleLoadDemoPreset}
              history={history}
              onViewHistoryResult={handleViewHistoryResult}
            />
          )}

          {/* 2. REGISTRATION SETUP VIEW */}
          {currentPage === 'new-registration' && (
            <div className="max-w-6xl mx-auto space-y-6">
              {/* Header Title */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold font-mono text-white tracking-tight">
                      Geometric Registration & Ingestion
                    </h2>
                    <span className="px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800 text-[11px] font-mono">
                      Step 1: Raster Setup
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Select or upload Reference (fixed basemap) and Target (unregistered multi-orbit optical) lunar imagery.
                  </p>
                </div>

                {/* Preset Quick Select Dropdown */}
                <div className="flex items-center gap-3">
                  <div className="text-xs text-slate-400 font-mono hidden sm:block">Benchmark Preset:</div>
                  <select
                    value={activePresetId}
                    onChange={(e) => handleLoadDemoPreset(e.target.value)}
                    className="bg-slate-950 border border-slate-700 text-xs font-mono text-cyan-300 rounded-lg px-3 py-2 focus:outline-none focus:border-cyan-500 cursor-pointer"
                  >
                    {LUNAR_PRESETS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Two Image Upload Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ImageUploader
                  title="REFERENCE IMAGE"
                  subtitle="Fixed geometric basemap / Prior orbit"
                  image={referenceImage}
                  onImageChange={setReferenceImage}
                  accentColor="cyan"
                  cardId="uploader-reference"
                />

                <ImageUploader
                  title="TARGET IMAGE"
                  subtitle="Multi-temporal / Disparate sun-angle orbit"
                  image={targetImage}
                  onImageChange={setTargetImage}
                  accentColor="amber"
                  cardId="uploader-target"
                />
              </div>

              {/* Parameter Configuration Accordion/Panel */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal className="w-4 h-4 text-cyan-400" />
                    <h3 className="text-xs font-bold font-mono tracking-tight text-white uppercase">
                      Algorithm Configuration & Tolerances
                    </h3>
                  </div>
                  <button
                    onClick={() => setParams(DEFAULT_REGISTRATION_PARAMS)}
                    className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1 font-mono"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset Defaults</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs font-mono">
                  {/* Detector */}
                  <div className="space-y-1">
                    <label className="text-slate-400">Feature Detector</label>
                    <select
                      value={params.detectorType}
                      onChange={(e) =>
                        setParams({ ...params, detectorType: e.target.value as any })
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-blue-500"
                    >
                      <option value="SIFT">SIFT (Scale-Invariant)</option>
                      <option value="ORB">ORB (Oriented FAST)</option>
                      <option value="LoFTR">LoFTR (Detector-Free Deep)</option>
                      <option value="SuperPoint">SuperPoint (Learned Extrema)</option>
                      <option value="AKAZE">AKAZE (Nonlinear Scale)</option>
                    </select>
                  </div>

                  {/* Outlier Filter */}
                  <div className="space-y-1">
                    <label className="text-slate-400">Outlier Rejection Filter</label>
                    <select
                      value={params.outlierFilter}
                      onChange={(e) =>
                        setParams({ ...params, outlierFilter: e.target.value as any })
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-blue-500"
                    >
                      <option value="RANSAC">RANSAC (Standard Epipolar)</option>
                      <option value="MAGSAC++">MAGSAC++ (Marginalized)</option>
                      <option value="USAC">USAC (Universal Framework)</option>
                      <option value="LMedS">LMedS (Least Median)</option>
                    </select>
                  </div>

                  {/* RANSAC Threshold Slider */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-slate-400">
                      <span>RANSAC Inlier Threshold</span>
                      <strong className="text-cyan-300">{params.ransacThreshold} px</strong>
                    </div>
                    <input
                      type="range"
                      min="1.0"
                      max="6.0"
                      step="0.5"
                      value={params.ransacThreshold}
                      onChange={(e) =>
                        setParams({ ...params, ransacThreshold: parseFloat(e.target.value) })
                      }
                      className="w-full accent-cyan-400 h-2 bg-slate-800 rounded-lg cursor-pointer mt-2"
                    />
                  </div>

                  {/* Transformation Model */}
                  <div className="space-y-1">
                    <label className="text-slate-400">Transformation Model</label>
                    <select
                      value={params.transformType}
                      onChange={(e) =>
                        setParams({ ...params, transformType: e.target.value as any })
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-blue-500"
                    >
                      <option value="Homography">Planar Homography (8-DOF)</option>
                      <option value="Affine">Affine Transform (6-DOF)</option>
                      <option value="Rigid">Rigid Euclidean (3-DOF)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Execution CTA Banner */}
              <div className="bg-gradient-to-r from-blue-900/40 via-slate-900 to-cyan-900/40 border border-blue-500/30 rounded-xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-blue-500/20 text-cyan-400 shrink-0">
                    <Play className="w-5 h-5 fill-cyan-400" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold font-mono text-white">
                      Ready to Run Lunar Correspondence Engine
                    </h4>
                    <p className="text-xs text-slate-400">
                      {!referenceImage || !targetImage
                        ? 'Please ensure both Reference and Target rasters are loaded.'
                        : 'Both images loaded. Estimated execution time: ~2.5 seconds.'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                  {(!referenceImage || !targetImage) && (
                    <button
                      onClick={() => handleLoadDemoPreset('shackleton-south-pole')}
                      className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 font-mono text-xs font-semibold flex items-center gap-1.5 transition-colors"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Load Demo Pair</span>
                    </button>
                  )}

                  <button
                    id="btn-run-registration"
                    disabled={!referenceImage || !targetImage || isProcessing}
                    onClick={handleRunRegistration}
                    className={`w-full sm:w-auto px-6 py-3 rounded-xl font-mono text-xs font-bold flex items-center justify-center gap-2 shadow-lg transition-all ${
                      referenceImage && targetImage && !isProcessing
                        ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/30 hover:scale-[1.02] cursor-pointer'
                        : 'bg-slate-800 text-slate-500 border border-slate-700/50 cursor-not-allowed'
                    }`}
                  >
                    <span>Run Registration</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 3. PROCESSING PIPELINE VIEW */}
          {currentPage === 'processing' && (
            <ProcessingPipeline
              stages={pipelineStages}
              isProcessing={isProcessing}
              params={params}
            />
          )}

          {/* 4. RESULTS VIEW (Primary Screen) */}
          {currentPage === 'results' && currentResult && (
            <div className="space-y-6">
              {/* Top Results Navigation & Action Bar */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <ResultsTabs
                  activeTab={activeResultTab}
                  onTabChange={setActiveResultTab}
                  matchesCount={currentResult.matches.length}
                />

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setCurrentPage('new-registration')}
                    className="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-mono text-slate-300 flex items-center gap-1.5 transition-colors"
                  >
                    <Scan className="w-3.5 h-3.5 text-cyan-400" />
                    <span>New Pair</span>
                  </button>

                  <button
                    onClick={() => setShowReportModal(true)}
                    className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-mono font-semibold flex items-center gap-1.5 shadow transition-colors"
                  >
                    <FileCheck className="w-3.5 h-3.5" />
                    <span>SIH26166 Report</span>
                  </button>
                </div>
              </div>

              {/* Main Visualizer Area & Right Analysis Panel */}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* Left 2 Columns: The Big Visualization Area */}
                <div className="xl:col-span-2 space-y-6">
                  <RegistrationViewer
                    result={currentResult}
                    activeTab={activeResultTab}
                    onTabChange={setActiveResultTab}
                  />

                  {/* Export Results Panel */}
                  <ExportPanel
                    result={currentResult}
                    onOpenReport={() => setShowReportModal(true)}
                  />
                </div>

                {/* Right 1 Column: Quantitative Analysis Panel */}
                <div className="xl:col-span-1 space-y-6">
                  <MetricsPanel
                    metrics={currentResult.metrics}
                    transformation={currentResult.transformation}
                    onOpenReportModal={() => setShowReportModal(true)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* 5. HISTORY VIEW */}
          {currentPage === 'history' && (
            <HistoryView
              history={history}
              onViewResult={handleViewHistoryResult}
              onLoadPreset={handleLoadDemoPreset}
            />
          )}

          {/* 6. ABOUT & ARCHITECTURE VIEW */}
          {currentPage === 'about' && <AboutView />}
        </main>
      </div>

      {/* Full Scientific Report Modal */}
      {showReportModal && currentResult && (
        <ReportModal
          result={currentResult}
          onClose={() => setShowReportModal(false)}
        />
      )}
    </div>
  );
}
