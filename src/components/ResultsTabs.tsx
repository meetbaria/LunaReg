import React from 'react';
import { Columns, Layers, GitCommit, Activity } from 'lucide-react';
import { ViewTab } from '../types/registration';

interface ResultsTabsProps {
  activeTab: ViewTab;
  onTabChange: (tab: ViewTab) => void;
  matchesCount: number;
}

export const ResultsTabs: React.FC<ResultsTabsProps> = ({
  activeTab,
  onTabChange,
  matchesCount,
}) => {
  const tabs = [
    {
      id: 'side-by-side' as ViewTab,
      label: 'Side by Side',
      icon: Columns,
      badge: 'Dual View',
    },
    {
      id: 'overlay' as ViewTab,
      label: 'Overlay',
      icon: Layers,
      badge: 'Alignment',
    },
    {
      id: 'matches' as ViewTab,
      label: 'Matches',
      icon: GitCommit,
      badge: `${matchesCount} pts`,
    },
    {
      id: 'difference' as ViewTab,
      label: 'Difference',
      icon: Activity,
      badge: 'Residuals',
    },
  ];

  return (
    <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
      <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800 space-x-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              id={`tab-btn-${tab.id}`}
              onClick={() => onTabChange(tab.id)}
              className={`px-4 py-2 rounded-lg text-xs font-mono font-semibold flex items-center gap-2 transition-all ${
                isActive
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded font-normal ${
                  isActive
                    ? 'bg-blue-700/80 text-blue-100'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {tab.badge}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
