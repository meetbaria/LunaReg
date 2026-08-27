import React, { useEffect, useRef, useState } from 'react';
import {
  Filter,
  CheckCircle2,
  XCircle,
  Eye,
  Sliders,
  Maximize2,
  Info,
  Layers,
  Sparkles,
} from 'lucide-react';
import { FeatureMatch, FeaturePoint, LunarImageMeta } from '../types/registration';

export interface MatchViewerProps {
  referenceImage: LunarImageMeta;
  targetImage: LunarImageMeta;
  refFeatures: FeaturePoint[];
  targetFeatures: FeaturePoint[];
  matches: FeatureMatch[];
  className?: string;
}

export const MatchViewer: React.FC<MatchViewerProps> = ({
  referenceImage,
  targetImage,
  refFeatures,
  targetFeatures,
  matches,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Filter & Display States
  const [filterMode, setFilterMode] = useState<'inliers' | 'all' | 'outliers'>('inliers');
  const [minConfidence, setMinConfidence] = useState<number>(0.5);
  const [hoveredMatch, setHoveredMatch] = useState<FeatureMatch | null>(null);
  const [showKeypoints, setShowKeypoints] = useState<boolean>(true);
  const [lineOpacity, setLineOpacity] = useState<number>(0.75);

  const inlierCount = matches.filter((m) => m.isInlier).length;
  const outlierCount = matches.filter((m) => !m.isInlier).length;

  const filteredMatches = matches.filter((m) => {
    if (filterMode === 'inliers' && !m.isInlier) return false;
    if (filterMode === 'outliers' && m.isInlier) return false;
    if (m.confidence < minConfidence) return false;
    return true;
  });

  // Render on Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const refImg = new Image();
    const targetImg = new Image();
    let isMounted = true;
    let loaded = 0;

    const render = () => {
      if (!isMounted) return;

      const singleWidth = referenceImage.width;
      const singleHeight = referenceImage.height;
      const totalWidth = singleWidth * 2;
      const totalHeight = singleHeight;

      canvas.width = totalWidth;
      canvas.height = totalHeight;

      // 1. Draw both images side by side
      ctx.clearRect(0, 0, totalWidth, totalHeight);
      ctx.drawImage(refImg, 0, 0, singleWidth, singleHeight);
      ctx.drawImage(targetImg, singleWidth, 0, singleWidth, singleHeight);

      // Separator line between reference and target
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(singleWidth, 0);
      ctx.lineTo(singleWidth, totalHeight);
      ctx.stroke();

      // 2. Draw Match Correspondence Lines
      filteredMatches.forEach((m) => {
        const isHovered = hoveredMatch?.id === m.id;
        const rx = m.refPoint.x;
        const ry = m.refPoint.y;
        const tx = singleWidth + m.targetPoint.x;
        const ty = m.targetPoint.y;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(tx, ty);

        if (m.isInlier) {
          ctx.strokeStyle = isHovered
            ? 'rgba(52, 211, 153, 1.0)' // Neon Emerald Highlight
            : `rgba(34, 197, 94, ${lineOpacity})`;
          ctx.lineWidth = isHovered ? 2.5 : 1.2;
        } else {
          ctx.strokeStyle = isHovered
            ? 'rgba(248, 113, 113, 1.0)' // Bright Red
            : `rgba(239, 68, 68, ${lineOpacity * 0.7})`;
          ctx.lineWidth = isHovered ? 2.2 : 0.8;
          ctx.setLineDash([4, 4]);
        }
        ctx.stroke();
        ctx.restore();
      });

      // 3. Draw Keypoints
      if (showKeypoints) {
        // Reference Points (Cyan)
        refFeatures.forEach((p) => {
          const isMatched = filteredMatches.some((m) => m.refPointIndex === p.id);
          const isHovered = hoveredMatch?.refPoint.id === p.id;
          if (!isMatched && filterMode !== 'all') return;

          ctx.save();
          ctx.beginPath();
          ctx.arc(p.x, p.y, isHovered ? 5 : 3, 0, Math.PI * 2);
          ctx.fillStyle = isHovered ? '#38bdf8' : 'rgba(56, 189, 248, 0.85)';
          ctx.fill();
          ctx.strokeStyle = '#0369a1';
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.restore();
        });

        // Target Points (Amber/Orange)
        targetFeatures.forEach((p) => {
          const isMatched = filteredMatches.some((m) => m.targetPointIndex === p.id);
          const isHovered = hoveredMatch?.targetPoint.id === p.id;
          if (!isMatched && filterMode !== 'all') return;

          ctx.save();
          ctx.beginPath();
          ctx.arc(singleWidth + p.x, p.y, isHovered ? 5 : 3, 0, Math.PI * 2);
          ctx.fillStyle = isHovered ? '#fbbf24' : 'rgba(251, 191, 36, 0.85)';
          ctx.fill();
          ctx.strokeStyle = '#b45309';
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.restore();
        });
      }
    };

    const checkLoaded = () => {
      loaded++;
      if (loaded >= 2) render();
    };

    refImg.crossOrigin = 'anonymous';
    targetImg.crossOrigin = 'anonymous';
    refImg.onload = checkLoaded;
    targetImg.onload = checkLoaded;
    refImg.src = referenceImage.url;
    targetImg.src = targetImage.url;

    return () => {
      isMounted = false;
    };
  }, [
    referenceImage,
    targetImage,
    refFeatures,
    targetFeatures,
    filteredMatches,
    filterMode,
    hoveredMatch,
    showKeypoints,
    lineOpacity,
  ]);

  // Handle Mouse Hover over canvas to find closest match
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;
    const singleWidth = referenceImage.width;

    let closest: FeatureMatch | null = null;
    let minDistance = 14 * scaleX; // hover tolerance radius

    filteredMatches.forEach((m) => {
      const rx = m.refPoint.x;
      const ry = m.refPoint.y;
      const tx = singleWidth + m.targetPoint.x;
      const ty = m.targetPoint.y;

      // Distance to ref point
      const dRef = Math.hypot(mouseX - rx, mouseY - ry);
      // Distance to target point
      const dTarget = Math.hypot(mouseX - tx, mouseY - ty);

      if (dRef < minDistance) {
        minDistance = dRef;
        closest = m;
      } else if (dTarget < minDistance) {
        minDistance = dTarget;
        closest = m;
      }
    });

    setHoveredMatch(closest);
  };

  const handleMouseLeave = () => {
    setHoveredMatch(null);
  };

  return (
    <div className={`space-y-4 ${className}`} ref={containerRef}>
      {/* Interactive Controls Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Filter Modes */}
        <div className="flex items-center gap-2">
          <span className="text-slate-400 font-mono flex items-center gap-1.5 font-medium">
            <Filter className="w-3.5 h-3.5 text-blue-400" />
            Match Set:
          </span>

          <div className="bg-slate-950 p-0.5 rounded-lg border border-slate-800 flex items-center gap-1">
            <button
              onClick={() => setFilterMode('inliers')}
              className={`px-3 py-1.5 rounded-md font-mono text-xs font-semibold flex items-center gap-1.5 transition-all ${
                filterMode === 'inliers'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Inliers ({inlierCount})</span>
            </button>

            <button
              onClick={() => setFilterMode('all')}
              className={`px-3 py-1.5 rounded-md font-mono text-xs font-semibold flex items-center gap-1.5 transition-all ${
                filterMode === 'all'
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-blue-400" />
              <span>All ({matches.length})</span>
            </button>

            <button
              onClick={() => setFilterMode('outliers')}
              className={`px-3 py-1.5 rounded-md font-mono text-xs font-semibold flex items-center gap-1.5 transition-all ${
                filterMode === 'outliers'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <XCircle className="w-3.5 h-3.5 text-rose-400" />
              <span>Outliers ({outlierCount})</span>
            </button>
          </div>
        </div>

        {/* Confidence & Display Controls */}
        <div className="flex flex-wrap items-center gap-4">
          {/* Confidence Slider */}
          <div className="flex items-center gap-2 bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800">
            <span className="text-slate-400 font-mono text-[11px]">Min Conf:</span>
            <input
              type="range"
              min="0.1"
              max="0.95"
              step="0.05"
              value={minConfidence}
              onChange={(e) => setMinConfidence(parseFloat(e.target.value))}
              className="w-20 accent-cyan-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
            <span className="font-mono text-cyan-300 text-[11px] font-bold w-9">
              {Math.round(minConfidence * 100)}%
            </span>
          </div>

          {/* Keypoints Toggle */}
          <button
            onClick={() => setShowKeypoints(!showKeypoints)}
            className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors ${
              showKeypoints
                ? 'bg-slate-800 border-slate-700 text-slate-200'
                : 'bg-slate-950 border-slate-800 text-slate-500'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Keypoints</span>
          </button>

          {/* Line Opacity Slider */}
          <div className="hidden sm:flex items-center gap-2 bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800">
            <span className="text-slate-400 font-mono text-[11px]">Line Alpha:</span>
            <input
              type="range"
              min="0.2"
              max="1.0"
              step="0.1"
              value={lineOpacity}
              onChange={(e) => setLineOpacity(parseFloat(e.target.value))}
              className="w-16 accent-blue-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Main Feature Match Canvas Card */}
      <div className="relative rounded-xl border border-slate-800 bg-slate-950 overflow-hidden shadow-2xl">
        {/* Canvas Header Labels */}
        <div className="absolute top-3 left-3 z-10 flex items-center gap-2 bg-slate-950/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-800/80">
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400/50" />
          <span className="text-xs font-mono font-bold text-slate-200">
            Reference: {referenceImage.name}
          </span>
          <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/80 px-1.5 py-0.5 rounded border border-cyan-800">
            {refFeatures.length} Keypoints
          </span>
        </div>

        <div className="absolute top-3 right-3 z-10 flex items-center gap-2 bg-slate-950/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-800/80">
          <span className="text-[10px] font-mono text-amber-400 bg-amber-950/80 px-1.5 py-0.5 rounded border border-amber-800">
            {targetFeatures.length} Keypoints
          </span>
          <span className="text-xs font-mono font-bold text-slate-200">
            Target: {targetImage.name}
          </span>
          <div className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-sm shadow-amber-400/50" />
        </div>

        {/* The HTML5 Rendering Canvas */}
        <div className="w-full flex items-center justify-center p-2 bg-slate-950">
          <canvas
            ref={canvasRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            className="w-full max-h-[560px] object-contain rounded-lg cursor-crosshair border border-slate-800/60 shadow-inner"
          />
        </div>

        {/* Bottom Legend & Active Hover Tooltip */}
        <div className="p-3 bg-slate-900/90 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Match Legend */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 bg-emerald-400 rounded-full" />
              <span className="text-[11px] text-slate-300 font-mono">Inlier Correspondence</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 bg-rose-400 border-dashed rounded-full" />
              <span className="text-[11px] text-slate-400 font-mono">RANSAC Outlier</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-cyan-400" />
              <span className="text-[11px] text-slate-400 font-mono">Ref Keypoint</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="text-[11px] text-slate-400 font-mono">Target Keypoint</span>
            </div>
          </div>

          {/* Active Correspondence Inspection Banner */}
          {hoveredMatch ? (
            <div className="flex items-center gap-3 bg-slate-950 px-3 py-1.5 rounded-lg border border-cyan-500/30 text-xs font-mono">
              <span className="text-cyan-300 font-bold">Match #{hoveredMatch.id}</span>
              <span className="text-slate-400">
                Ref: ({hoveredMatch.refPoint.x}, {hoveredMatch.refPoint.y})
              </span>
              <span className="text-slate-600">→</span>
              <span className="text-slate-400">
                Target: ({hoveredMatch.targetPoint.x}, {hoveredMatch.targetPoint.y})
              </span>
              <span className="text-emerald-400 font-semibold">
                Err: {hoveredMatch.reprojectionError} px
              </span>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] ${
                  hoveredMatch.isInlier
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                    : 'bg-rose-950 text-rose-300 border border-rose-800'
                }`}
              >
                {hoveredMatch.isInlier ? 'INLIER' : 'OUTLIER'}
              </span>
            </div>
          ) : (
            <div className="text-[11px] text-slate-500 italic">
              Hover over any point or line to inspect pixel coordinates & reprojection error
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
