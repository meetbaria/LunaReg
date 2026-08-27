import React, { useRef, useState } from 'react';
import {
  UploadCloud,
  FileImage,
  Trash2,
  Maximize2,
  FileCode,
  HardDrive,
  Sparkles,
  Info,
  CheckCircle2,
} from 'lucide-react';
import { LunarImageMeta } from '../types/registration';

interface ImageUploaderProps {
  title: string;
  subtitle: string;
  image: LunarImageMeta | null;
  onImageChange: (image: LunarImageMeta | null) => void;
  accentColor: 'cyan' | 'amber';
  cardId: string;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({
  title,
  subtitle,
  image,
  onImageChange,
  accentColor,
  cardId,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);

  const isCyan = accentColor === 'cyan';
  const badgeBg = isCyan ? 'bg-cyan-950/80 border-cyan-800/80 text-cyan-300' : 'bg-amber-950/80 border-amber-800/80 text-amber-300';
  const activeBorder = isCyan ? 'border-cyan-500/60 ring-1 ring-cyan-500/20' : 'border-amber-500/60 ring-1 ring-amber-500/20';

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const processFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Please upload a valid lunar raster image (PNG, JPG, TIFF, WebP).');
      return;
    }

    setLoadingFile(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      const url = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const meta: LunarImageMeta = {
          id: `${cardId}-${Date.now()}`,
          name: file.name,
          url,
          width: img.naturalWidth || img.width || 640,
          height: img.naturalHeight || img.height || 480,
          sizeBytes: file.size,
          format: file.type || 'image/png',
          uploadedAt: new Date().toISOString(),
          missionSource: 'Custom Lunar Upload',
          resolutionMpp: 1.0,
        };
        onImageChange(meta);
        setLoadingFile(false);
      };
      img.onerror = () => {
        setLoadingFile(false);
        alert('Failed to parse lunar image raster.');
      };
      img.src = url;
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  return (
    <div
      id={`card-${cardId}`}
      className={`relative rounded-xl border bg-slate-900/90 backdrop-blur-sm p-4 transition-all flex flex-col justify-between ${
        image ? activeBorder : 'border-slate-800 hover:border-slate-700'
      }`}
    >
      {/* Header Info */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${isCyan ? 'bg-cyan-400 shadow-sm shadow-cyan-500/50' : 'bg-amber-400 shadow-sm shadow-amber-500/50'}`} />
          <div>
            <h3 className="text-sm font-bold text-white tracking-wide font-mono flex items-center gap-2">
              {title}
              {image && (
                <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-sans font-medium">
                  <CheckCircle2 className="w-3 h-3" /> Ready
                </span>
              )}
            </h3>
            <p className="text-[11px] text-slate-400">{subtitle}</p>
          </div>
        </div>
        <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded border ${badgeBg}`}>
          {isCyan ? 'REF_BASEMAP' : 'TARGET_WARP'}
        </span>
      </div>

      {/* Upload or Preview Content */}
      <div className="py-4">
        {image ? (
          /* Preview State */
          <div className="space-y-3">
            <div className="relative rounded-lg overflow-hidden border border-slate-800 bg-slate-950 group h-52 flex items-center justify-center">
              <img
                src={image.url}
                alt={image.name}
                className="max-h-full max-w-full object-contain transition-transform duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2.5 justify-between">
                <span className="text-[11px] font-mono text-slate-200">
                  {image.width} × {image.height} px
                </span>
                <span className="text-[10px] font-mono bg-slate-900/90 text-cyan-300 px-2 py-0.5 rounded border border-slate-700">
                  {image.missionSource || 'Lunar Surface'}
                </span>
              </div>
            </div>

            {/* Image Metadata Grid */}
            <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-950/70 p-3 rounded-lg border border-slate-800/80">
              <div className="space-y-1">
                <div className="text-slate-400 flex items-center gap-1">
                  <FileImage className="w-3 h-3 text-slate-400" />
                  <span>File Name</span>
                </div>
                <div className="font-mono text-slate-200 font-medium truncate" title={image.name}>
                  {image.name}
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-slate-400 flex items-center gap-1">
                  <Maximize2 className="w-3 h-3 text-slate-400" />
                  <span>Dimensions</span>
                </div>
                <div className="font-mono text-slate-200 font-medium">
                  {image.width} × {image.height} px
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-slate-400 flex items-center gap-1">
                  <HardDrive className="w-3 h-3 text-slate-400" />
                  <span>Size</span>
                </div>
                <div className="font-mono text-slate-200 font-medium">
                  {formatFileSize(image.sizeBytes)}
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-slate-400 flex items-center gap-1">
                  <FileCode className="w-3 h-3 text-slate-400" />
                  <span>Format</span>
                </div>
                <div className="font-mono text-slate-200 font-medium uppercase">
                  {image.format.replace('image/', '') || 'PNG'}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Empty / Dropzone State */
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl h-52 flex flex-col items-center justify-center p-6 text-center cursor-pointer transition-all ${
              isDragging
                ? 'border-blue-400 bg-blue-500/10'
                : 'border-slate-800 hover:border-slate-700 bg-slate-950/40 hover:bg-slate-950/80'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*,.tif,.tiff"
              className="hidden"
            />
            <div className={`p-3 rounded-full mb-3 ${isCyan ? 'bg-cyan-500/10 text-cyan-400' : 'bg-amber-500/10 text-amber-400'}`}>
              <UploadCloud className="w-6 h-6 animate-pulse" />
            </div>
            <div className="text-xs font-semibold text-slate-200 mb-1">
              {loadingFile ? 'Processing raster...' : 'Drop lunar image here or click to browse'}
            </div>
            <p className="text-[11px] text-slate-400 max-w-xs leading-relaxed">
              Supports optical bands, orthorectified GeoTIFF, PNG, JPG from Chandrayaan TMC, LRO NAC, or Apollo.
            </p>
          </div>
        )}
      </div>

      {/* Card Actions */}
      <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
        {image ? (
          <>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1.5 px-2.5 py-1 rounded hover:bg-slate-800/60 transition-colors"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>Replace Image</span>
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*,.tif,.tiff"
              className="hidden"
            />
            <button
              onClick={() => onImageChange(null)}
              className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1.5 px-2.5 py-1 rounded hover:bg-rose-500/10 transition-colors"
              title="Remove this image"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Remove</span>
            </button>
          </>
        ) : (
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 w-full justify-center">
            <Info className="w-3.5 h-3.5 text-slate-400" />
            <span>Ready for raster ingestion</span>
          </div>
        )}
      </div>
    </div>
  );
};
