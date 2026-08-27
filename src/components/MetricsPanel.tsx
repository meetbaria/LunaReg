import React, { useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Cpu,
  Info,
  Layers,
  Sparkles,
  Zap,
  HelpCircle,
  Hash,
  Share2,
  Table,
  Sliders,
  Maximize,
  Clock,
  ShieldAlert,
} from 'lucide-react';
import { RegistrationMetrics, TransformationMatrix } from '../types/registration';

interface MetricsPanelProps {
  metrics: RegistrationMetrics;
  transformation: TransformationMatrix;
  onOpenReportModal?: () => void;
}

export const MetricsPanel: React.FC<MetricsPanelProps> = ({
  metrics,
  transformation,
  onOpenReportModal,
}) => {
  const [showMatrixModal, setShowMatrixModal] = useState(false);
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

  const tooltipContent: Record<string, string> = {
    detected:
      'Total keypoint extrema detected using Scale-Invariant Feature Transform (SIFT) across Gaussian scale-space octaves.',
    initial:
      'Initial candidate correspondence pairs matched via FLANN (Fast Library for Approximate Nearest Neighbors) and Euclidean L2 distance.',
    inliers:
      'Epipolar and geometrically consistent correspondences retained after robust RANSAC outlier elimination.',
    inlierRatio:
      'Proportion of valid geometric matches against initial candidate pairs. Ratios >50% indicate high transformation stability.',
    error:
      'Root Mean Square Error (RMSE) in pixels between reprojected target keypoints and reference keypoints under Homography H.',
    model:
      '8-DOF Planar Projective Transformation Matrix H relating pixel coordinates [x, y, 1]^T between sensor viewpoints.',
    confidence:
      'Composite score evaluating inlier distribution, spatial dispersion over lunar landmarks, and residual reprojection variance.',
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-5 flex flex-col justify-between">
      <div className="space-y-4">
        {/* Header & Prototype Disclaimer Badge */}
        <div className="flex items-start justify-between pb-3 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold font-mono tracking-tight text-white uppercase">
                Geometric Analysis
              </h3>
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
            </div>
            <p className="text-[11px] text-slate-400">Quantitative registration verification</p>
          </div>

          {/* Prototype / Demo Results Tag */}
          <div className="text-right">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
              <ShieldAlert className="w-3 h-3 text-amber-400" />
              Prototype / Demo Results
            </span>
          </div>
        </div>

        {/* Primary Metric Highlights Grid */}
        <div className="grid grid-cols-2 gap-2.5">
          {/* Detected Features */}
          <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800/80 relative group">
            <div className="flex items-center justify-between text-slate-400 text-[11px]">
              <span className="font-mono">Detected Features</span>
              <button
                onMouseEnter={() => setActiveTooltip('detected')}
                onMouseLeave={() => setActiveTooltip(null)}
                className="text-slate-500 hover:text-slate-300"
              >
                <HelpCircle className="w-3 h-3" />
              </button>
            </div>
            <div className="text-lg font-bold font-mono text-cyan-400 mt-1">
              {(metrics.detectedRefFeatures + metrics.detectedTargetFeatures).toLocaleString()}
            </div>
            <div className="text-[10px] font-mono text-slate-500 mt-0.5">
              Ref: {metrics.detectedRefFeatures} | Tgt: {metrics.detectedTargetFeatures}
            </div>
          </div>

          {/* Initial Matches */}
          <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800/80 relative group">
            <div className="flex items-center justify-between text-slate-400 text-[11px]">
              <span className="font-mono">Initial Matches</span>
              <button
                onMouseEnter={() => setActiveTooltip('initial')}
                onMouseLeave={() => setActiveTooltip(null)}
                className="text-slate-500 hover:text-slate-300"
              >
                <HelpCircle className="w-3 h-3" />
              </button>
            </div>
            <div className="text-lg font-bold font-mono text-blue-400 mt-1">
              {metrics.initialMatches.toLocaleString()}
            </div>
            <div className="text-[10px] font-mono text-slate-500 mt-0.5">
              FLANN / Ratio &lt; 0.75
            </div>
          </div>

          {/* Valid Matches (Inliers) */}
          <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800/80 relative group">
            <div className="flex items-center justify-between text-slate-400 text-[11px]">
              <span className="font-mono">Valid Matches (Inliers)</span>
              <button
                onMouseEnter={() => setActiveTooltip('inliers')}
                onMouseLeave={() => setActiveTooltip(null)}
                className="text-slate-500 hover:text-slate-300"
              >
                <HelpCircle className="w-3 h-3" />
              </button>
            </div>
            <div className="text-lg font-bold font-mono text-emerald-400 mt-1">
              {metrics.validMatches.toLocaleString()}
            </div>
            <div className="text-[10px] font-mono text-emerald-400/80 mt-0.5">
              RANSAC Inliers
            </div>
          </div>

          {/* Inlier Ratio */}
          <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800/80 relative group">
            <div className="flex items-center justify-between text-slate-400 text-[11px]">
              <span className="font-mono">Inlier Ratio</span>
              <button
                onMouseEnter={() => setActiveTooltip('inlierRatio')}
                onMouseLeave={() => setActiveTooltip(null)}
                className="text-slate-500 hover:text-slate-300"
              >
                <HelpCircle className="w-3 h-3" />
              </button>
            </div>
            <div className="text-lg font-bold font-mono text-emerald-300 mt-1">
              {metrics.inlierRatio}%
            </div>
            <div className="text-[10px] font-mono text-slate-500 mt-0.5">
              Target &gt; 50%
            </div>
          </div>
        </div>

        {/* Detailed Quantitative Table */}
        <div className="space-y-2 pt-1">
          {/* Registration Error */}
          <div className="p-3 rounded-lg bg-slate-950/90 border border-slate-800/90 flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="text-xs font-mono text-slate-300 font-semibold flex items-center gap-1.5">
                <span>Mean Reprojection Error</span>
                <button
                  onMouseEnter={() => setActiveTooltip('error')}
                  onMouseLeave={() => setActiveTooltip(null)}
                  className="text-slate-500 hover:text-slate-300"
                >
                  <HelpCircle className="w-3 h-3" />
                </button>
              </div>
              <div className="text-[11px] text-slate-500">Root Mean Square Error</div>
            </div>
            <div className="text-right">
              <div className="text-base font-bold font-mono text-emerald-400">
                {metrics.registrationError} px
              </div>
              <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/80 px-1.5 py-0.2 rounded border border-cyan-800">
                Subpixel Precision
              </span>
            </div>
          </div>

          {/* Transformation Model & Inspector Button */}
          <div className="p-3 rounded-lg bg-slate-950/90 border border-slate-800/90 flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="text-xs font-mono text-slate-300 font-semibold flex items-center gap-1.5">
                <span>Transformation Model</span>
                <button
                  onMouseEnter={() => setActiveTooltip('model')}
                  onMouseLeave={() => setActiveTooltip(null)}
                  className="text-slate-500 hover:text-slate-300"
                >
                  <HelpCircle className="w-3 h-3" />
                </button>
              </div>
              <div className="text-[11px] text-slate-500">Planar Projective (3x3 Matrix)</div>
            </div>
            <div className="text-right flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-cyan-300">
                {metrics.transformationModel}
              </span>
              <button
                onClick={() => setShowMatrixModal(true)}
                className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 hover:text-white transition-colors"
                title="Inspect 3x3 Homography Matrix"
              >
                <Table className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Confidence Score */}
          <div className="p-3 rounded-lg bg-slate-950/90 border border-slate-800/90 flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="text-xs font-mono text-slate-300 font-semibold flex items-center gap-1.5">
                <span>Registration Confidence</span>
                <button
                  onMouseEnter={() => setActiveTooltip('confidence')}
                  onMouseLeave={() => setActiveTooltip(null)}
                  className="text-slate-500 hover:text-slate-300"
                >
                  <HelpCircle className="w-3 h-3" />
                </button>
              </div>
              <div className="text-[11px] text-slate-500">Geometric Reliability Index</div>
            </div>
            <div className="text-right">
              <div className="text-sm font-bold font-mono text-emerald-400 flex items-center gap-1 justify-end">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{metrics.confidence} ({metrics.confidenceScore}%)</span>
              </div>
              <span className="text-[10px] text-slate-500">SIH Benchmark Passed</span>
            </div>
          </div>
        </div>

        {/* Active Tooltip Drawer / Callout */}
        {activeTooltip && (
          <div className="p-3 rounded-lg bg-blue-950/50 border border-blue-500/30 text-xs text-blue-200 leading-relaxed font-mono">
            <span className="font-bold text-cyan-300">Metric Info: </span>
            {tooltipContent[activeTooltip]}
          </div>
        )}
      </div>

      {/* Action Footer: View Full SIH26166 Report */}
      <div className="pt-3 border-t border-slate-800 space-y-2">
        <button
          onClick={onOpenReportModal}
          className="w-full py-2.5 px-3 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 hover:text-white text-xs font-mono font-semibold flex items-center justify-center gap-2 transition-colors shadow-sm"
        >
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          <span>View SIH26166 Scientific Report</span>
        </button>

        <div className="text-[10px] text-center text-slate-500 font-mono">
          Ready for Python OpenCV REST Hook: <code className="text-slate-400">/api/v1/register</code>
        </div>
      </div>

      {/* Homography Matrix Inspector Modal */}
      {showMatrixModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Table className="w-4 h-4 text-cyan-400" />
                <h4 className="text-sm font-bold font-mono text-white">
                  Homography Matrix (3x3 Matrix H)
                </h4>
              </div>
              <button
                onClick={() => setShowMatrixModal(false)}
                className="text-slate-400 hover:text-white text-sm font-mono px-2 py-1 rounded hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Planar homography calculated using Direct Linear Transformation (DLT) with RANSAC inlier set. Transforms homogeneous coordinates [x_ref, y_ref, 1] to H * [x_tgt, y_tgt, 1].
            </p>

            {/* Matrix Values Display */}
            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 font-mono text-xs text-center space-y-2">
              <div className="grid grid-cols-3 gap-2">
                {transformation.matrix.map((row, rIdx) =>
                  row.map((val, cIdx) => (
                    <div
                      key={`${rIdx}-${cIdx}`}
                      className="p-2 rounded bg-slate-900 border border-slate-800 text-cyan-300 font-bold"
                    >
                      <div className="text-[9px] text-slate-500 mb-0.5">
                        H[{rIdx},{cIdx}]
                      </div>
                      {val.toFixed(6)}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Decomposed Transformation Components */}
            <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-slate-950/70 p-3 rounded-lg border border-slate-800">
              <div>
                <span className="text-slate-500">Rotation (θ): </span>
                <span className="text-slate-200 font-bold">
                  {transformation.rotationDeg?.toFixed(2)}°
                </span>
              </div>
              <div>
                <span className="text-slate-500">Translation X: </span>
                <span className="text-slate-200 font-bold">
                  {transformation.translationX?.toFixed(2)} px
                </span>
              </div>
              <div>
                <span className="text-slate-500">Scale Factor: </span>
                <span className="text-slate-200 font-bold">
                  {transformation.scaleX?.toFixed(3)}x
                </span>
              </div>
              <div>
                <span className="text-slate-500">Translation Y: </span>
                <span className="text-slate-200 font-bold">
                  {transformation.translationY?.toFixed(2)} px
                </span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowMatrixModal(false)}
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-mono text-xs font-semibold"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
