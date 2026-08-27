import React, { useState } from 'react';
import {
  History,
  Search,
  Filter,
  Layers,
  ArrowRight,
  Sparkles,
  FileCheck,
  Calendar,
  CheckCircle2,
  Trash2,
} from 'lucide-react';
import { RegistrationHistoryItem } from '../types/registration';

interface HistoryViewProps {
  history: RegistrationHistoryItem[];
  onViewResult: (item: RegistrationHistoryItem) => void;
  onClearHistory?: () => void;
  onLoadPreset: (presetId: string) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  history,
  onViewResult,
  onClearHistory,
  onLoadPreset,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredHistory = history.filter(
    (item) =>
      item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.datasetType.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.refImageName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.targetImageName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold font-mono text-white tracking-tight">
              Registration Session History
            </h2>
            <span className="px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800 text-[11px] font-mono">
              SIH26166 Log
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Historical log of lunar geometric alignment runs, homography matrices, and reprojection error records.
          </p>
        </div>

        {/* Search Bar */}
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search dataset, mission..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs font-mono text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* History Grid / List */}
      {filteredHistory.length > 0 ? (
        <div className="grid grid-cols-1 gap-4">
          {filteredHistory.map((item) => (
            <div
              key={item.id}
              className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-5 shadow-lg"
            >
              {/* Left Info & Thumbnails */}
              <div className="flex items-center gap-4">
                <div className="flex items-center -space-x-4 shrink-0">
                  <img
                    src={item.refThumbnail}
                    alt="Ref"
                    className="w-14 h-14 object-cover rounded-lg border-2 border-slate-900 bg-slate-950"
                  />
                  <img
                    src={item.targetThumbnail}
                    alt="Target"
                    className="w-14 h-14 object-cover rounded-lg border-2 border-slate-900 bg-slate-950"
                  />
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold font-mono text-slate-200">
                      {item.title}
                    </h3>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950 text-cyan-400 border border-slate-800">
                      {item.datasetType}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                    Ref: {item.refImageName} → Target: {item.targetImageName}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono flex items-center gap-1 mt-1">
                    <Calendar className="w-3 h-3" />
                    <span>{item.date}</span>
                  </div>
                </div>
              </div>

              {/* Center Metrics Badges */}
              <div className="grid grid-cols-3 gap-3 w-full md:w-auto text-xs font-mono bg-slate-950/80 p-3 rounded-lg border border-slate-800/80">
                <div>
                  <div className="text-slate-500 text-[10px]">Inliers</div>
                  <div className="text-emerald-400 font-bold">
                    {item.inlierCount} ({item.inlierRatio}%)
                  </div>
                </div>
                <div>
                  <div className="text-slate-500 text-[10px]">RMSE</div>
                  <div className="text-emerald-400 font-bold">{item.errorPx} px</div>
                </div>
                <div>
                  <div className="text-slate-500 text-[10px]">Model</div>
                  <div className="text-cyan-300 font-bold">{item.model}</div>
                </div>
              </div>

              {/* Right Action */}
              <div className="shrink-0">
                <button
                  onClick={() => onViewResult(item)}
                  className="px-4 py-2 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 hover:text-white text-xs font-mono font-semibold flex items-center gap-2 transition-colors"
                >
                  <span>Inspect Results</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center space-y-4">
          <div className="p-3 bg-slate-950 rounded-full w-12 h-12 mx-auto flex items-center justify-center text-slate-500">
            <History className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold font-mono text-slate-200">
              No Matching Registration Records Found
            </h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Execute a registration on the Registration page or launch one of the benchmark lunar datasets.
            </p>
          </div>
          <button
            onClick={() => onLoadPreset('shackleton-south-pole')}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-mono font-semibold inline-flex items-center gap-2"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Load Shackleton Crater Preset</span>
          </button>
        </div>
      )}
    </div>
  );
};
