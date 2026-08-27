import React, { useState } from 'react';
import {
  Download,
  FileCode,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  CheckCircle2,
  Share2,
  Sparkles,
} from 'lucide-react';
import { RegistrationResult } from '../types/registration';

interface ExportPanelProps {
  result: RegistrationResult;
  onOpenReport: () => void;
}

export const ExportPanel: React.FC<ExportPanelProps> = ({
  result,
  onOpenReport,
}) => {
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);

  const triggerSuccess = (label: string) => {
    setDownloadSuccess(label);
    setTimeout(() => setDownloadSuccess(null), 3000);
  };

  // Download Warped/Registered Image Raster
  const downloadRegisteredImage = () => {
    const a = document.createElement('a');
    a.href = result.registeredImageCanvasUrl;
    a.download = `LUNAREG_REGISTERED_${result.targetImage.name.replace(/\.[^/.]+$/, '')}_H_WARP.png`;
    a.click();
    triggerSuccess('Registered Lunar Raster PNG');
  };

  // Download Homography Matrix JSON
  const downloadHomographyJSON = () => {
    const payload = {
      project: 'LunaReg SIH26166',
      timestamp: result.createdAt,
      referenceImage: {
        name: result.referenceImage.name,
        dimensions: `${result.referenceImage.width}x${result.referenceImage.height}`,
      },
      targetImage: {
        name: result.targetImage.name,
        dimensions: `${result.targetImage.width}x${result.targetImage.height}`,
      },
      transformation: result.transformation,
      metrics: result.metrics,
      parameters: result.params,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `LUNAREG_HOMOGRAPHY_MATRIX_${result.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
    triggerSuccess('Homography Matrix JSON');
  };

  // Download Matched Keypoints CSV
  const downloadMatchesCSV = () => {
    let csv = 'match_id,ref_x,ref_y,target_x,target_y,distance,confidence,is_inlier,reprojection_error_px\n';
    result.matches.forEach((m) => {
      csv += `${m.id},${m.refPoint.x},${m.refPoint.y},${m.targetPoint.x},${m.targetPoint.y},${m.distance},${m.confidence},${m.isInlier},${m.reprojectionError || 0}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `LUNAREG_MATCH_KEYPOINTS_${result.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    triggerSuccess('Matched Keypoints CSV');
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Download className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-bold font-mono tracking-tight text-white uppercase">
            Export Results & Products
          </h3>
        </div>
        {downloadSuccess && (
          <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800 animate-fadeIn">
            <CheckCircle2 className="w-3 h-3" />
            Downloaded {downloadSuccess}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Export Option 1: Registered Raster */}
        <button
          id="btn-export-raster"
          onClick={downloadRegisteredImage}
          className="p-3 rounded-lg bg-slate-950/80 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 text-left transition-all group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 rounded-md bg-cyan-500/10 text-cyan-400 group-hover:scale-110 transition-transform">
              <ImageIcon className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-mono text-slate-500 bg-slate-900 px-1.5 py-0.5 rounded">
              PNG / TIFF
            </span>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-200 group-hover:text-white">
              Registered Lunar Raster
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Perspective-warped target aligned to basemap
            </div>
          </div>
        </button>

        {/* Export Option 2: Homography JSON */}
        <button
          id="btn-export-json"
          onClick={downloadHomographyJSON}
          className="p-3 rounded-lg bg-slate-950/80 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 text-left transition-all group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 rounded-md bg-blue-500/10 text-blue-400 group-hover:scale-110 transition-transform">
              <FileCode className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-mono text-slate-500 bg-slate-900 px-1.5 py-0.5 rounded">
              JSON
            </span>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-200 group-hover:text-white">
              Transformation Matrix
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              3x3 Homography H, decomposed rotations & scale
            </div>
          </div>
        </button>

        {/* Export Option 3: Keypoint Matches CSV */}
        <button
          id="btn-export-csv"
          onClick={downloadMatchesCSV}
          className="p-3 rounded-lg bg-slate-950/80 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 text-left transition-all group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 rounded-md bg-emerald-500/10 text-emerald-400 group-hover:scale-110 transition-transform">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-mono text-slate-500 bg-slate-900 px-1.5 py-0.5 rounded">
              CSV
            </span>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-200 group-hover:text-white">
              Feature Correspondences
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              All keypoints, inlier flags & reprojection errors
            </div>
          </div>
        </button>

        {/* Export Option 4: Full SIH26166 Scientific Report */}
        <button
          id="btn-export-report"
          onClick={onOpenReport}
          className="p-3 rounded-lg bg-blue-950/40 hover:bg-blue-950/70 border border-blue-500/30 hover:border-blue-500/50 text-left transition-all group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 rounded-md bg-cyan-500/20 text-cyan-300 group-hover:scale-110 transition-transform">
              <FileText className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950 px-1.5 py-0.5 rounded border border-cyan-800">
              SIH Report
            </span>
          </div>
          <div>
            <div className="text-xs font-semibold text-blue-200 group-hover:text-white">
              Scientific PDF / Summary
            </div>
            <div className="text-[11px] text-blue-300/80 mt-0.5">
              Comprehensive report with figures & metrics
            </div>
          </div>
        </button>
      </div>
    </div>
  );
};
