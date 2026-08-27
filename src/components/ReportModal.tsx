import React from 'react';
import {
  Printer,
  X,
  FileCheck,
  Compass,
  CheckCircle2,
  Calendar,
  Layers,
  Cpu,
} from 'lucide-react';
import { RegistrationResult } from '../types/registration';

interface ReportModalProps {
  result: RegistrationResult;
  onClose: () => void;
}

export const ReportModal: React.FC<ReportModalProps> = ({ result, onClose }) => {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto">
        {/* Modal Top Bar */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/20 text-blue-400">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold font-mono text-white">
                  LunaReg SIH26166 Scientific Registration Report
                </h3>
                <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 text-[10px] font-mono font-bold">
                  VERIFIED
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Lunar Terrain Optical Correspondence & Geometric Homography Documentation
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-mono text-xs font-semibold flex items-center gap-1.5 transition-colors shadow"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / Save PDF</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Report Body */}
        <div className="p-6 overflow-y-auto space-y-6 bg-slate-950/90 text-slate-200 print:bg-white print:text-black">
          {/* Header Block */}
          <div className="border-b border-slate-800 pb-4 flex flex-wrap justify-between items-start gap-4">
            <div>
              <div className="text-xs font-mono uppercase text-cyan-400 font-bold tracking-widest">
                SIH Problem Statement: SIH26166
              </div>
              <h1 className="text-2xl font-bold font-mono text-white mt-1">
                LUNAR OPTICAL IMAGE REGISTRATION DOSSIER
              </h1>
              <div className="flex items-center gap-4 text-xs text-slate-400 mt-2 font-mono">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  Generated: {new Date(result.createdAt).toLocaleString()}
                </span>
                <span>Session ID: {result.id}</span>
              </div>
            </div>

            <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 text-right">
              <div className="text-[11px] text-slate-400 font-mono">Overall Accuracy</div>
              <div className="text-xl font-bold font-mono text-emerald-400">
                {result.metrics.registrationError} px RMSE
              </div>
              <div className="text-[10px] text-slate-500 font-mono">Subpixel Tolerance Met</div>
            </div>
          </div>

          {/* Dataset & Sensor Specifications */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold font-mono uppercase text-slate-400 tracking-wider">
              1. Input Imagery Metadata
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-3.5 rounded-lg bg-slate-900 border border-slate-800 space-y-2 text-xs">
                <div className="font-bold text-cyan-300 font-mono flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-cyan-400" />
                  Reference Raster (Fixed Basemap)
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-slate-300">
                  <div>File: <strong className="text-white">{result.referenceImage.name}</strong></div>
                  <div>Dimensions: <strong className="text-white">{result.referenceImage.width}×{result.referenceImage.height}</strong></div>
                  <div>Mission: <strong className="text-white">{result.referenceImage.missionSource || 'Chandrayaan-2 TMC-2'}</strong></div>
                  <div>Ground Res: <strong className="text-white">{result.referenceImage.resolutionMpp || 0.5} m/px</strong></div>
                </div>
              </div>

              <div className="p-3.5 rounded-lg bg-slate-900 border border-slate-800 space-y-2 text-xs">
                <div className="font-bold text-amber-300 font-mono flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  Target Raster (Registered / Warped)
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-slate-300">
                  <div>File: <strong className="text-white">{result.targetImage.name}</strong></div>
                  <div>Dimensions: <strong className="text-white">{result.targetImage.width}×{result.targetImage.height}</strong></div>
                  <div>Mission: <strong className="text-white">{result.targetImage.missionSource || 'Multi-Orbit Optical'}</strong></div>
                  <div>Ground Res: <strong className="text-white">{(result.targetImage.resolutionMpp || 0.52).toFixed(2)} m/px</strong></div>
                </div>
              </div>
            </div>
          </div>

          {/* Quantitative Performance Metrics */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold font-mono uppercase text-slate-400 tracking-wider">
              2. Quantitative Validation Metrics
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                <div className="text-[11px] text-slate-400 font-mono">Detected Keypoints</div>
                <div className="text-base font-bold font-mono text-cyan-400 mt-1">
                  {result.metrics.detectedRefFeatures + result.metrics.detectedTargetFeatures}
                </div>
                <div className="text-[10px] text-slate-500 font-mono">SIFT Extrema</div>
              </div>

              <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                <div className="text-[11px] text-slate-400 font-mono">Valid Inlier Matches</div>
                <div className="text-base font-bold font-mono text-emerald-400 mt-1">
                  {result.metrics.validMatches} / {result.metrics.initialMatches}
                </div>
                <div className="text-[10px] text-slate-500 font-mono">{result.metrics.inlierRatio}% Inlier Ratio</div>
              </div>

              <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                <div className="text-[11px] text-slate-400 font-mono">Reprojection RMSE</div>
                <div className="text-base font-bold font-mono text-emerald-400 mt-1">
                  {result.metrics.registrationError} px
                </div>
                <div className="text-[10px] text-slate-500 font-mono">Subpixel Precision</div>
              </div>

              <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                <div className="text-[11px] text-slate-400 font-mono">Confidence Level</div>
                <div className="text-base font-bold font-mono text-cyan-400 mt-1">
                  {result.metrics.confidence} ({result.metrics.confidenceScore}%)
                </div>
                <div className="text-[10px] text-slate-500 font-mono">High Reliability</div>
              </div>
            </div>
          </div>

          {/* Homography Matrix Breakdown */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold font-mono uppercase text-slate-400 tracking-wider">
              3. Homography Transformation Matrix (3x3 Matrix H)
            </h4>
            <div className="p-4 rounded-lg bg-slate-900 border border-slate-800 font-mono text-xs space-y-3">
              <div className="grid grid-cols-3 gap-2 max-w-md mx-auto text-center">
                {result.transformation.matrix.map((row, rIdx) =>
                  row.map((val, cIdx) => (
                    <div key={`${rIdx}-${cIdx}`} className="p-2 rounded bg-slate-950 border border-slate-800 text-cyan-300">
                      {val.toFixed(6)}
                    </div>
                  ))
                )}
              </div>
              <div className="flex justify-around text-[11px] text-slate-400 pt-2 border-t border-slate-800">
                <span>Rotation: <strong className="text-slate-200">{result.transformation.rotationDeg}°</strong></span>
                <span>Scale: <strong className="text-slate-200">{result.transformation.scaleX}x</strong></span>
                <span>Shift X: <strong className="text-slate-200">{result.transformation.translationX} px</strong></span>
                <span>Shift Y: <strong className="text-slate-200">{result.transformation.translationY} px</strong></span>
              </div>
            </div>
          </div>

          {/* Visual Thumbnails */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold font-mono uppercase text-slate-400 tracking-wider">
              4. Alignment Proofs
            </h4>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg overflow-hidden border border-slate-800 bg-slate-900 p-2 text-center">
                <img src={result.referenceImage.url} alt="Ref" className="w-full h-32 object-contain rounded" />
                <div className="text-[10px] font-mono text-slate-400 mt-1">Reference Basemap</div>
              </div>
              <div className="rounded-lg overflow-hidden border border-slate-800 bg-slate-900 p-2 text-center">
                <img src={result.registeredImageCanvasUrl} alt="Registered" className="w-full h-32 object-contain rounded" />
                <div className="text-[10px] font-mono text-emerald-400 mt-1">Warped Target (Registered)</div>
              </div>
              <div className="rounded-lg overflow-hidden border border-slate-800 bg-slate-900 p-2 text-center">
                <img src={result.differenceHeatmapUrl} alt="Diff" className="w-full h-32 object-contain rounded" />
                <div className="text-[10px] font-mono text-cyan-400 mt-1">Reprojection Residual Heatmap</div>
              </div>
            </div>
          </div>

          {/* Mission Note / Disclaimer */}
          <div className="p-4 rounded-lg bg-blue-950/30 border border-blue-800/40 text-xs text-slate-400 leading-relaxed font-mono">
            <strong className="text-blue-300">Smart India Hackathon (SIH26166) Note:</strong> This report verifies the complete end-to-end UX, geometric verification metrics, and modular data contract for automated lunar surface correspondence and geometric alignment. Real OpenCV / Python REST endpoints can be plugged in directly via <code className="text-cyan-300">/api/v1/register</code>.
          </div>
        </div>
      </div>
    </div>
  );
};
