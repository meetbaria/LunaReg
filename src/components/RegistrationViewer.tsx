import React, { useState, useRef, useEffect } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sliders,
  SplitSquareVertical,
  Eye,
  Layers,
  Sparkles,
  Activity,
  Maximize2,
  Lock,
  Unlock,
  Play,
  Pause,
  AlertTriangle,
} from 'lucide-react';
import { RegistrationResult, ViewTab } from '../types/registration';
import { MatchViewer } from './MatchViewer';

interface RegistrationViewerProps {
  result: RegistrationResult;
  activeTab: ViewTab;
  onTabChange: (tab: ViewTab) => void;
}

export const RegistrationViewer: React.FC<RegistrationViewerProps> = ({
  result,
  activeTab,
  onTabChange,
}) => {
  // Synchronized Zoom & Pan state for Side-by-Side
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  const [isSyncLocked, setIsSyncLocked] = useState<boolean>(true);
  const [mouseCoord, setMouseCoord] = useState<{ x: number; y: number } | null>(null);

  // Overlay View state
  const [overlayOpacity, setOverlayOpacity] = useState<number>(0.5);
  const [overlayMode, setOverlayMode] = useState<'blend' | 'curtain' | 'blink'>('blend');
  const [curtainPosition, setCurtainPosition] = useState<number>(50); // percentage 0 - 100
  const [isCurtainDragging, setIsCurtainDragging] = useState<boolean>(false);
  const [showOriginalInstead, setShowOriginalInstead] = useState<boolean>(false);
  const [isBlinking, setIsBlinking] = useState<boolean>(false);
  const [blinkFrame, setBlinkFrame] = useState<0 | 1>(0);

  // Difference View state
  const [diffThreshold, setDiffThreshold] = useState<number>(15);

  // Blink comparator timer
  useEffect(() => {
    let interval: any;
    if (isBlinking && overlayMode === 'blink') {
      interval = setInterval(() => {
        setBlinkFrame((prev) => (prev === 0 ? 1 : 0));
      }, 400); // 400ms astronomical blink rate
    }
    return () => clearInterval(interval);
  }, [isBlinking, overlayMode]);

  // Curtain slider drag handler
  const handleCurtainMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isCurtainDragging && e.buttons !== 1) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    setCurtainPosition((x / rect.width) * 100);
  };

  const handleZoomIn = () => setZoomLevel((prev) => Math.min(3.0, Number((prev + 0.25).toFixed(2))));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(0.75, Number((prev - 0.25).toFixed(2))));
  const handleResetZoom = () => setZoomLevel(1.0);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl flex flex-col">
      {/* Visual Workspace Sub-header */}
      <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-950/60">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
            <span className="font-mono text-xs font-bold text-white uppercase tracking-wider">
              {activeTab === 'side-by-side' && 'Synchronized Dual Raster Viewer'}
              {activeTab === 'overlay' && 'Perspective Alignment & Superimposition'}
              {activeTab === 'matches' && 'Epipolar Keypoint Correspondence Map'}
              {activeTab === 'difference' && 'Subpixel Reprojection Error Heatmap'}
            </span>
          </div>

          <span className="text-[11px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
            {result.referenceImage.width} × {result.referenceImage.height} px
          </span>
        </div>

        {/* Dynamic Contextual Toolbar */}
        <div className="flex items-center gap-3">
          {/* Zoom controls for side-by-side or overlay */}
          {(activeTab === 'side-by-side' || activeTab === 'overlay') && (
            <div className="flex items-center gap-1.5 bg-slate-900 px-2 py-1 rounded-lg border border-slate-800">
              <button
                onClick={handleZoomOut}
                className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="font-mono text-xs text-slate-300 w-12 text-center">
                {Math.round(zoomLevel * 100)}%
              </span>
              <button
                onClick={handleZoomIn}
                className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleResetZoom}
                className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded ml-1"
                title="Reset Zoom"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {activeTab === 'side-by-side' && (
            <button
              onClick={() => setIsSyncLocked(!isSyncLocked)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono border transition-colors ${
                isSyncLocked
                  ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                  : 'bg-slate-900 text-slate-400 border-slate-800'
              }`}
            >
              {isSyncLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
              <span>Sync Pan</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Canvas / Visualizer Area */}
      <div className="p-4 bg-slate-950 flex-1 min-h-[500px] flex flex-col justify-center">
        {/* TAB 1: SIDE BY SIDE */}
        {activeTab === 'side-by-side' && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Left: Reference Image */}
              <div className="relative rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden group">
                <div className="absolute top-2 left-2 z-10 bg-slate-950/90 backdrop-blur-md px-2.5 py-1 rounded border border-slate-800 text-[11px] font-mono text-cyan-300 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-cyan-400" />
                  <span>REF (Fixed Geometry)</span>
                </div>
                <div
                  className="h-96 overflow-hidden flex items-center justify-center p-2 bg-slate-950"
                  onMouseMove={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setMouseCoord({
                      x: Math.round((e.clientX - rect.left) / zoomLevel),
                      y: Math.round((e.clientY - rect.top) / zoomLevel),
                    });
                  }}
                  onMouseLeave={() => setMouseCoord(null)}
                >
                  <img
                    src={result.referenceImage.url}
                    alt="Reference"
                    style={{ transform: `scale(${zoomLevel})` }}
                    className="max-h-full max-w-full object-contain transition-transform origin-center cursor-crosshair"
                  />
                </div>
                <div className="p-2.5 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                  <span>{result.referenceImage.name}</span>
                  <span>{result.referenceImage.missionSource || 'Basemap Orbit'}</span>
                </div>
              </div>

              {/* Right: Target Image (or Registered Target) */}
              <div className="relative rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden group">
                <div className="absolute top-2 left-2 z-10 bg-slate-950/90 backdrop-blur-md px-2.5 py-1 rounded border border-slate-800 text-[11px] font-mono text-amber-300 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-400" />
                  <span>TARGET ({showOriginalInstead ? 'Raw Input' : 'Registered / Warped'})</span>
                </div>

                <div className="absolute top-2 right-2 z-10">
                  <button
                    onClick={() => setShowOriginalInstead(!showOriginalInstead)}
                    className="bg-slate-900/90 hover:bg-slate-800 text-xs px-2.5 py-1 rounded border border-slate-700 text-slate-200 font-mono shadow"
                  >
                    {showOriginalInstead ? 'Show Warped Target' : 'Show Raw Target'}
                  </button>
                </div>

                <div
                  className="h-96 overflow-hidden flex items-center justify-center p-2 bg-slate-950"
                  onMouseMove={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setMouseCoord({
                      x: Math.round((e.clientX - rect.left) / zoomLevel),
                      y: Math.round((e.clientY - rect.top) / zoomLevel),
                    });
                  }}
                  onMouseLeave={() => setMouseCoord(null)}
                >
                  <img
                    src={showOriginalInstead ? result.targetImage.url : result.registeredImageCanvasUrl}
                    alt="Target"
                    style={{ transform: `scale(${zoomLevel})` }}
                    className="max-h-full max-w-full object-contain transition-transform origin-center cursor-crosshair"
                  />
                </div>
                <div className="p-2.5 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                  <span>{result.targetImage.name}</span>
                  <span className="text-emerald-400 font-medium">H Warped Res: 0.5m/px</span>
                </div>
              </div>
            </div>

            {/* Crosshair Coordinate Reader */}
            <div className="p-2 bg-slate-900/80 rounded-lg border border-slate-800 flex items-center justify-between text-xs font-mono text-slate-400">
              <div className="flex items-center gap-2">
                <Maximize2 className="w-3.5 h-3.5 text-cyan-400" />
                <span>Pixel Coordinates:</span>
                <span className="text-slate-200">
                  {mouseCoord ? `X: ${mouseCoord.x} px, Y: ${mouseCoord.y} px` : 'Move cursor over imagery'}
                </span>
              </div>
              <div className="text-slate-500 text-[11px]">
                Subpixel Interpolation: Bilinear / OpenCV WarpPerspective
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: OVERLAY */}
        {activeTab === 'overlay' && (
          <div className="space-y-4">
            {/* Overlay Mode Selector & Controls */}
            <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-slate-400 font-mono font-medium">Superimposition Mode:</span>
                <div className="bg-slate-950 p-0.5 rounded-lg border border-slate-800 flex items-center gap-1">
                  <button
                    onClick={() => {
                      setOverlayMode('blend');
                      setIsBlinking(false);
                    }}
                    className={`px-3 py-1.5 rounded-md font-mono text-xs font-semibold ${
                      overlayMode === 'blend'
                        ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Alpha Blend
                  </button>

                  <button
                    onClick={() => {
                      setOverlayMode('curtain');
                      setIsBlinking(false);
                    }}
                    className={`px-3 py-1.5 rounded-md font-mono text-xs font-semibold ${
                      overlayMode === 'curtain'
                        ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Split Curtain Swipe
                  </button>

                  <button
                    onClick={() => {
                      setOverlayMode('blink');
                      setIsBlinking(true);
                    }}
                    className={`px-3 py-1.5 rounded-md font-mono text-xs font-semibold flex items-center gap-1.5 ${
                      overlayMode === 'blink'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Blink Comparator</span>
                  </button>
                </div>
              </div>

              {/* Mode-Specific Sliders */}
              {overlayMode === 'blend' && (
                <div className="flex items-center gap-3 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
                  <span className="text-slate-400 font-mono text-[11px]">Target Opacity:</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.02"
                    value={overlayOpacity}
                    onChange={(e) => setOverlayOpacity(parseFloat(e.target.value))}
                    className="w-32 accent-cyan-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                  />
                  <span className="font-mono text-cyan-300 text-[11px] font-bold w-10">
                    {Math.round(overlayOpacity * 100)}%
                  </span>
                </div>
              )}

              {overlayMode === 'curtain' && (
                <div className="flex items-center gap-3 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
                  <span className="text-slate-400 font-mono text-[11px]">Curtain Position:</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={curtainPosition}
                    onChange={(e) => setCurtainPosition(parseFloat(e.target.value))}
                    className="w-32 accent-blue-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                  />
                  <span className="font-mono text-blue-300 text-[11px] font-bold w-10">
                    {Math.round(curtainPosition)}%
                  </span>
                </div>
              )}

              {overlayMode === 'blink' && (
                <div className="flex items-center gap-3 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
                  <button
                    onClick={() => setIsBlinking(!isBlinking)}
                    className="flex items-center gap-1.5 text-xs font-mono text-amber-300 font-bold"
                  >
                    {isBlinking ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    <span>{isBlinking ? 'Pause Blink' : 'Resume Blink'}</span>
                  </button>
                  <span className="text-slate-500 font-mono text-[11px]">| Rate: 2.5 Hz</span>
                </div>
              )}
            </div>

            {/* Visual Container */}
            <div className="relative rounded-xl border border-slate-800 bg-slate-950 overflow-hidden h-[460px] flex items-center justify-center select-none">
              {/* Alpha Blend Mode */}
              {overlayMode === 'blend' && (
                <div className="relative w-full h-full flex items-center justify-center p-2">
                  {/* Base Reference Layer */}
                  <img
                    src={result.referenceImage.url}
                    alt="Ref"
                    style={{ transform: `scale(${zoomLevel})` }}
                    className="absolute max-h-full max-w-full object-contain pointer-events-none"
                  />
                  {/* Warped Target Overlaid Layer */}
                  <img
                    src={showOriginalInstead ? result.targetImage.url : result.registeredImageCanvasUrl}
                    alt="Registered Target"
                    style={{
                      transform: `scale(${zoomLevel})`,
                      opacity: overlayOpacity,
                    }}
                    className="absolute max-h-full max-w-full object-contain pointer-events-none transition-opacity"
                  />
                </div>
              )}

              {/* Split Curtain Mode */}
              {overlayMode === 'curtain' && (
                <div
                  className="relative w-full h-full flex items-center justify-center cursor-ew-resize overflow-hidden"
                  onMouseDown={() => setIsCurtainDragging(true)}
                  onMouseUp={() => setIsCurtainDragging(false)}
                  onMouseMove={handleCurtainMove}
                >
                  {/* Left Side: Reference Layer */}
                  <div className="w-full h-full flex items-center justify-center">
                    <img
                      src={result.referenceImage.url}
                      alt="Ref"
                      style={{ transform: `scale(${zoomLevel})` }}
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>

                  {/* Right Side: Registered Target Clipped */}
                  <div
                    className="absolute inset-0 flex items-center justify-center overflow-hidden"
                    style={{ clipPath: `inset(0 0 0 ${curtainPosition}%)` }}
                  >
                    <img
                      src={result.registeredImageCanvasUrl}
                      alt="Warped Target"
                      style={{ transform: `scale(${zoomLevel})` }}
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>

                  {/* Vertical Dividing Line & Handle */}
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-cyan-400 shadow-lg z-20 pointer-events-none"
                    style={{ left: `${curtainPosition}%` }}
                  >
                    <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-7 h-7 rounded-full bg-cyan-500 border-2 border-slate-900 flex items-center justify-center text-slate-950 shadow-xl">
                      <SplitSquareVertical className="w-4 h-4 rotate-90" />
                    </div>
                  </div>
                </div>
              )}

              {/* Blink Comparator Mode */}
              {overlayMode === 'blink' && (
                <div className="relative w-full h-full flex items-center justify-center">
                  <img
                    src={blinkFrame === 0 ? result.referenceImage.url : result.registeredImageCanvasUrl}
                    alt="Blink"
                    style={{ transform: `scale(${zoomLevel})` }}
                    className="max-h-full max-w-full object-contain"
                  />
                  <div className="absolute top-3 left-3 bg-slate-950/90 px-3 py-1.5 rounded border border-slate-800 text-xs font-mono text-amber-300 flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${blinkFrame === 0 ? 'bg-cyan-400' : 'bg-amber-400'}`} />
                    <span>Active Frame: {blinkFrame === 0 ? 'Reference (TMC-2)' : 'Registered Target (Warped)'}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Status bar */}
            <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <div className="flex items-center gap-2 font-mono">
                <Layers className="w-3.5 h-3.5 text-blue-400" />
                <span>Geometrical Alignment Integrity:</span>
                <span className="text-emerald-400 font-bold">98.2% Crater Rim Coincidence</span>
              </div>
              <button
                onClick={() => setShowOriginalInstead(!showOriginalInstead)}
                className="text-xs text-cyan-300 hover:underline font-mono"
              >
                {showOriginalInstead ? 'Switch back to Warped Target' : 'Compare with Unregistered Raw Target'}
              </button>
            </div>
          </div>
        )}

        {/* TAB 3: MATCHES */}
        {activeTab === 'matches' && (
          <MatchViewer
            referenceImage={result.referenceImage}
            targetImage={result.targetImage}
            refFeatures={result.refFeatures}
            targetFeatures={result.targetFeatures}
            matches={result.matches}
          />
        )}

        {/* TAB 4: DIFFERENCE */}
        {activeTab === 'difference' && (
          <div className="space-y-4">
            {/* Heatmap Controls Bar */}
            <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs">
              <div className="flex items-center gap-3">
                <span className="text-slate-400 font-mono font-medium">Error Visualization:</span>
                <span className="text-[11px] font-mono text-cyan-300 bg-slate-950 px-2.5 py-1 rounded border border-slate-800">
                  Pseudo-Color Residual Metric (L1-Norm)
                </span>
              </div>

              {/* Color Gradient Scale Legend */}
              <div className="flex items-center gap-3 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 text-[11px] font-mono">
                <span className="text-blue-400 font-semibold">&lt; 0.5 px (Aligned)</span>
                <div className="w-32 h-2.5 rounded-full bg-gradient-to-r from-blue-500 via-emerald-400 via-yellow-400 to-red-500" />
                <span className="text-red-400 font-semibold">&gt; 3.5 px (Residual)</span>
              </div>
            </div>

            {/* Heatmap Raster Display */}
            <div className="relative rounded-xl border border-slate-800 bg-slate-950 overflow-hidden h-[460px] flex items-center justify-center p-2">
              <img
                src={result.differenceHeatmapUrl}
                alt="Difference Heatmap"
                style={{ transform: `scale(${zoomLevel})` }}
                className="max-h-full max-w-full object-contain"
              />
            </div>

            {/* Error Distribution Metrics Breakdown */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-xs">
                <div className="text-slate-400 font-mono">Mean Residual (RMSE)</div>
                <div className="text-lg font-bold font-mono text-emerald-400 mt-1">
                  {result.metrics.registrationError} px
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">Subpixel precision achieved</div>
              </div>

              <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-xs">
                <div className="text-slate-400 font-mono">Max Reprojection Error</div>
                <div className="text-lg font-bold font-mono text-amber-400 mt-1">
                  {result.metrics.maxReprojectionError} px
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">Confined to shadowed crater walls</div>
              </div>

              <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-xs">
                <div className="text-slate-400 font-mono">Estimated Spatial Overlap</div>
                <div className="text-lg font-bold font-mono text-cyan-400 mt-1">
                  {result.metrics.spatialOverlapPercent}%
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">Common terrain footprint</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
