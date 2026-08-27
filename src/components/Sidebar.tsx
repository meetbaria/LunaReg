import React from 'react';
import {
  LayoutDashboard,
  Scan,
  Layers,
  History,
  Info,
  ChevronRight,
  ShieldCheck,
  Globe2,
} from 'lucide-react';
import { NavPage } from '../types/registration';

interface SidebarProps {
  currentPage: NavPage;
  onNavigate: (page: NavPage) => void;
  hasResult: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentPage,
  onNavigate,
  hasResult,
}) => {
  const navItems = [
    {
      id: 'dashboard' as NavPage,
      label: 'Dashboard',
      icon: LayoutDashboard,
      description: 'Overview & Mission Stats',
    },
    {
      id: 'new-registration' as NavPage,
      label: 'New Registration',
      icon: Scan,
      description: 'Upload & Parameter Setup',
    },
    {
      id: 'results' as NavPage,
      label: 'Results',
      icon: Layers,
      description: 'Correspondence & Alignment',
      disabled: !hasResult,
      badge: hasResult ? 'Active' : undefined,
    },
    {
      id: 'history' as NavPage,
      label: 'History',
      icon: History,
      description: 'Processed Lunar Datasets',
    },
    {
      id: 'about' as NavPage,
      label: 'About & CV Architecture',
      icon: Info,
      description: 'SIH26166 Pipeline Specs',
    },
  ];

  return (
    <aside className="w-64 bg-slate-900/95 border-r border-slate-800 flex flex-col justify-between shrink-0 select-none min-h-[calc(100vh-4rem)]">
      {/* Navigation Links */}
      <div className="p-3 space-y-1">
        <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">
          Registration Workspace
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;
          const isDisabled = item.disabled;

          return (
            <button
              key={item.id}
              id={`nav-item-${item.id}`}
              disabled={isDisabled}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition-all ${
                isActive
                  ? 'bg-blue-600/15 text-blue-300 border border-blue-500/30 shadow-sm'
                  : isDisabled
                  ? 'text-slate-600 opacity-60 cursor-not-allowed'
                  : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`p-1.5 rounded-md ${
                    isActive
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'bg-slate-800/60 text-slate-400'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div className="truncate">
                  <div className="text-xs font-semibold tracking-tight">{item.label}</div>
                  <div className="text-[10px] text-slate-400 truncate">{item.description}</div>
                </div>
              </div>

              {item.badge && (
                <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {item.badge}
                </span>
              )}

              {isActive && !item.badge && (
                <ChevronRight className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom Info Card */}
      <div className="p-3 border-t border-slate-800/80 space-y-3">
        <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800/80 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase text-slate-400 flex items-center gap-1.5">
              <Globe2 className="w-3 h-3 text-cyan-400" />
              Lunar Target
            </span>
            <span className="text-[10px] font-mono text-emerald-400 font-semibold">Subpixel Mode</span>
          </div>
          <div className="text-xs text-slate-300 font-medium">
            TMC-2 & OHRC Sensor Registration
          </div>
          <div className="text-[11px] text-slate-400 leading-relaxed">
            Multi-temporal lunar surface optical alignment under disparate sun elevation angles.
          </div>
        </div>

        <div className="px-2 py-1 flex items-center justify-between text-[11px] text-slate-400">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
            Prototype Build
          </span>
          <span className="font-mono text-[10px] text-slate-400">v0.9.4-rc</span>
        </div>
      </div>
    </aside>
  );
};
