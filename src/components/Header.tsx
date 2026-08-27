import React from 'react';
import { Activity, Compass, Cpu, Layers, Sparkles } from 'lucide-react';
import { NavPage } from '../types/registration';

interface HeaderProps {
  currentPage: NavPage;
  onNavigate: (page: NavPage) => void;
  onLoadDemo: () => void;
  hasResult: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  onNavigate,
  onLoadDemo,
}) => {
  return (
    <header className="h-16 bg-slate-900 border-b border-slate-800 px-6 flex items-center justify-between sticky top-0 z-30 select-none">
      {/* Brand & Project Info */}
      <div className="flex items-center gap-4">
        <div 
          onClick={() => onNavigate('dashboard')}
          className="flex items-center gap-3 cursor-pointer group"
          id="brand-logo-container"
        >
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 via-blue-600 to-cyan-400 p-[1px] flex items-center justify-center shadow-lg shadow-indigo-500/20 group-hover:shadow-indigo-500/30 transition-all">
            <div className="w-full h-full bg-slate-950 rounded-[7px] flex items-center justify-center">
              <Compass className="w-5 h-5 text-cyan-400 group-hover:rotate-45 transition-transform duration-300" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold tracking-tight text-white font-mono">LunaReg</span>
              <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-950/80 text-blue-300 border border-blue-800/60">
                SIH26166
              </span>
            </div>
            <p className="text-xs text-slate-400 tracking-normal hidden sm:block">
              Lunar Image Correspondence & Geometric Registration Platform
            </p>
          </div>
        </div>
      </div>

      {/* Status & Actions */}
      <div className="flex items-center gap-3 sm:gap-4">
        {/* Quick Demo CTA */}
        <button
          id="btn-quick-demo-header"
          onClick={onLoadDemo}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500/10 to-blue-500/10 hover:from-cyan-500/20 hover:to-blue-500/20 text-cyan-300 hover:text-cyan-200 border border-cyan-500/30 text-xs font-medium transition-all shadow-sm"
          title="Instantly loads high-resolution lunar crater reference & target imagery for immediate registration testing"
        >
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          <span className="hidden md:inline">Load Demo Lunar Dataset</span>
          <span className="md:hidden">Demo Data</span>
        </button>

        {/* System / CV Backend Readiness Indicator */}
        <div className="hidden lg:flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800/80 text-xs text-slate-300">
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="font-mono text-emerald-400 text-[11px] font-medium">CV Service Ready</span>
          </div>
          <span className="text-slate-700">|</span>
          <div className="flex items-center gap-1 text-slate-400 text-[11px]">
            <Cpu className="w-3.5 h-3.5 text-slate-500" />
            <span>OpenCV 4.10 / SIFT</span>
          </div>
        </div>

        {/* Mission Status Badge */}
        <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-slate-800/60 border border-slate-700/60 text-xs text-slate-300">
          <Layers className="w-3.5 h-3.5 text-blue-400" />
          <span className="hidden sm:inline text-slate-400">Target:</span>
          <span className="font-mono font-medium text-slate-200 text-[11px]">ISRO TMC-2 / LRO</span>
        </div>
      </div>
    </header>
  );
};
