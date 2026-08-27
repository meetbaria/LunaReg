import React from 'react';
import {
  CheckCircle2,
  Loader2,
  Clock,
  Cpu,
  Layers,
  ArrowDown,
  Sparkles,
  AlertCircle,
  FileCode2,
  SlidersHorizontal,
} from 'lucide-react';
import { PipelineStage, RegistrationParams } from '../types/registration';

interface ProcessingPipelineProps {
  stages: PipelineStage[];
  isProcessing: boolean;
  params: RegistrationParams;
  onCancel?: () => void;
}

export const ProcessingPipeline: React.FC<ProcessingPipelineProps> = ({
  stages,
  isProcessing,
  params,
}) => {
  const currentActiveIndex = stages.findIndex((s) => s.status === 'processing');
  const completedCount = stages.filter((s) => s.status === 'completed').length;
  const progressPercent = Math.round((completedCount / stages.length) * 100);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2 py-0.5 rounded bg-blue-950/80 border border-blue-800 text-blue-300 text-[11px] font-mono font-semibold">
                SIH26166 CORRESPONDENCE ENGINE
              </span>
              <span className="px-2 py-0.5 rounded bg-amber-950/60 border border-amber-800/60 text-amber-300 text-[11px] font-mono">
                Prototype CV Pipeline
              </span>
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight font-mono">
              Lunar Geometric Registration in Progress
            </h2>
            <p className="text-xs text-slate-400 mt-1 max-w-xl">
              Executing scale-space crater matching, epipolar outlier filtering (RANSAC), and perspective homography calculation.
            </p>
          </div>

          <div className="flex items-center gap-4 bg-slate-950/80 p-3 rounded-lg border border-slate-800 shrink-0">
            <div className="text-right">
              <div className="text-[11px] text-slate-400 font-mono">Overall Progress</div>
              <div className="text-xl font-bold font-mono text-cyan-400">{progressPercent}%</div>
            </div>
            <div className="w-12 h-12 relative flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                <path
                  className="text-slate-800"
                  strokeWidth="3.5"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="text-cyan-400 transition-all duration-300 ease-out"
                  strokeDasharray={`${progressPercent}, 100`}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              {isProcessing ? (
                <Cpu className="w-4 h-4 text-cyan-300 absolute animate-pulse" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 absolute" />
              )}
            </div>
          </div>
        </div>

        {/* Algorithm Parameters Summary Ribbon */}
        <div className="mt-4 pt-4 border-t border-slate-800/80 flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-1 text-slate-400">
            <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
            <span>Parameters:</span>
          </div>
          <span className="bg-slate-950 px-2 py-0.5 rounded border border-slate-800 text-slate-300 font-mono text-[11px]">
            Detector: <strong className="text-cyan-300">{params.detectorType}</strong>
          </span>
          <span className="bg-slate-950 px-2 py-0.5 rounded border border-slate-800 text-slate-300 font-mono text-[11px]">
            Matcher: <strong className="text-cyan-300">{params.matcherType} (Ratio &lt; {params.ratioTestValue})</strong>
          </span>
          <span className="bg-slate-950 px-2 py-0.5 rounded border border-slate-800 text-slate-300 font-mono text-[11px]">
            Filter: <strong className="text-cyan-300">{params.outlierFilter} (Thresh {params.ransacThreshold}px)</strong>
          </span>
          <span className="bg-slate-950 px-2 py-0.5 rounded border border-slate-800 text-slate-300 font-mono text-[11px]">
            Model: <strong className="text-cyan-300">{params.transformType}</strong>
          </span>
        </div>
      </div>

      {/* 7-Stage Visual Pipeline */}
      <div className="space-y-3">
        {stages.map((stage, idx) => {
          const isCurrent = stage.status === 'processing';
          const isDone = stage.status === 'completed';
          const isPending = stage.status === 'pending';

          return (
            <React.Fragment key={stage.id}>
              <div
                id={`pipeline-stage-${idx}`}
                className={`p-4 rounded-xl border transition-all duration-300 flex items-start justify-between gap-4 ${
                  isCurrent
                    ? 'bg-blue-950/30 border-blue-500/50 shadow-lg shadow-blue-500/10 ring-1 ring-blue-500/20'
                    : isDone
                    ? 'bg-slate-900/80 border-emerald-500/30'
                    : 'bg-slate-900/40 border-slate-800/60 opacity-60'
                }`}
              >
                <div className="flex items-start gap-3.5">
                  {/* Status Icon */}
                  <div className="mt-0.5">
                    {isDone && (
                      <div className="w-7 h-7 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                    )}
                    {isCurrent && (
                      <div className="w-7 h-7 rounded-full bg-blue-500/20 border border-blue-400 flex items-center justify-center text-blue-400">
                        <Loader2 className="w-4 h-4 animate-spin" />
                      </div>
                    )}
                    {isPending && (
                      <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-500 font-mono text-xs">
                        {idx + 1}
                      </div>
                    )}
                  </div>

                  {/* Stage Title & Info */}
                  <div>
                    <div className="flex items-center gap-2">
                      <h4
                        className={`text-sm font-semibold font-mono tracking-wide ${
                          isCurrent ? 'text-blue-300' : isDone ? 'text-white' : 'text-slate-400'
                        }`}
                      >
                        {idx + 1}. {stage.name}
                      </h4>
                      {isCurrent && (
                        <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-400/30 animate-pulse">
                          Processing
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{stage.description}</p>

                    {/* Detailed Stage Execution Output */}
                    {stage.details && (
                      <div className="mt-2 text-[11px] font-mono text-cyan-300 bg-slate-950/80 px-2.5 py-1.5 rounded border border-slate-800 flex items-center gap-2">
                        <FileCode2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        <span>{stage.details}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Stage Timing */}
                <div className="text-right shrink-0">
                  {stage.durationMs ? (
                    <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {stage.durationMs} ms
                    </span>
                  ) : isCurrent ? (
                    <span className="text-[11px] font-mono text-blue-300">calculating...</span>
                  ) : (
                    <span className="text-[11px] font-mono text-slate-600">waiting</span>
                  )}
                </div>
              </div>

              {/* Connecting Pipeline Arrow */}
              {idx < stages.length - 1 && (
                <div className="flex justify-center -my-1">
                  <ArrowDown
                    className={`w-4 h-4 ${
                      idx < completedCount ? 'text-emerald-400' : 'text-slate-700'
                    }`}
                  />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Backend Extensibility Notice */}
      <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400 flex items-start gap-3">
        <AlertCircle className="w-4 h-4 text-cyan-400 mt-0.5 shrink-0" />
        <div className="leading-relaxed">
          <strong className="text-slate-200">SIH26166 CV Service Interface:</strong> This pipeline uses an isolated service architecture (`/services/registrationService.ts`). The simulated states mirror the exact OpenCV / NumPy data structures for real-time homography estimation and can be connected directly to Python backend routes via FastAPI/Flask.
        </div>
      </div>
    </div>
  );
};
