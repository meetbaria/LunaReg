import React from 'react';
import {
  Cpu,
  Layers,
  FileCode2,
  Share2,
  Terminal,
  Sparkles,
  Compass,
  CheckCircle2,
  Globe2,
  ArrowDown,
  BookOpen,
} from 'lucide-react';

export const AboutView: React.FC = () => {
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-2">
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800 text-xs font-mono font-bold">
            PROBLEM STATEMENT: SIH26166
          </span>
          <span className="text-xs text-emerald-400 font-mono">
            Smart India Hackathon Prototype
          </span>
        </div>
        <h1 className="text-2xl font-bold font-mono text-white">
          LunaReg: Lunar Surface Image Correspondence & Geometric Alignment
        </h1>
        <p className="text-xs text-slate-300 leading-relaxed max-w-3xl">
          Designed for orbital optical imagery acquired across disparate orbits and extreme solar illumination angles (e.g. Chandrayaan-2/3 Terrain Mapping Camera TMC-2, Orbiter High Resolution Camera OHRC, and NASA Lunar Reconnaissance Orbiter LROC).
        </p>
      </div>

      {/* 3 Pillars of the System */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
          <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 w-fit">
            <Cpu className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold font-mono text-white">
            1. Scale-Space Invariance
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Extracts scale and rotation-invariant keypoints across Gaussian Difference-of-Gaussians (DoG) pyramids, robust to crater shadow elongation and regolith roughness.
          </p>
        </div>

        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
          <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 w-fit">
            <Layers className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold font-mono text-white">
            2. Epipolar RANSAC Outlier Rejection
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Eliminates mismatched craterlet features using iterative random sample consensus (RANSAC / MAGSAC++) to preserve pure structural correspondences.
          </p>
        </div>

        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 w-fit">
            <Compass className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold font-mono text-white">
            3. Projective Homography & Warping
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Calculates 8-DOF planar homography matrix H (3x3) with subpixel interpolation, enabling seamless basemap mosaicking and multi-temporal change detection.
          </p>
        </div>
      </div>

      {/* Backend Integration API Specification */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
          <Terminal className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-bold font-mono text-white uppercase">
            Python / OpenCV REST Backend Extension Contract
          </h3>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">
          The LunaReg frontend is architected with a decoupled service pattern (`/services/registrationService.ts`). The Python backend can be integrated in under 10 lines of code via standard FastAPI / Flask endpoints.
        </p>

        {/* Code Snippet */}
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-xs text-slate-300 space-y-2 overflow-x-auto">
          <div className="text-slate-500"># Python / OpenCV Backend Implementation Schema (FastAPI)</div>
          <pre className="text-cyan-300 leading-relaxed">
{`from fastapi import FastAPI, UploadFile, File
import cv2, numpy as np

app = FastAPI(title="LunaReg OpenCV Engine")

@app.post("/api/v1/register")
async def register_lunar_pair(ref_img: UploadFile = File(...), target_img: UploadFile = File(...)):
    # 1. Decode rasters
    img1 = cv2.imdecode(np.frombuffer(await ref_img.read(), np.uint8), cv2.IMREAD_GRAYSCALE)
    img2 = cv2.imdecode(np.frombuffer(await target_img.read(), np.uint8), cv2.IMREAD_GRAYSCALE)

    # 2. Extract SIFT keypoints & descriptors
    sift = cv2.SIFT_create(nfeatures=2000)
    kp1, des1 = sift.detectAndCompute(img1, None)
    kp2, des2 = sift.detectAndCompute(img2, None)

    # 3. FLANN Matching with Lowe's Ratio Test
    matcher = cv2.FlannBasedMatcher(dict(algorithm=1, trees=5), dict(checks=50))
    matches = matcher.knnMatch(des1, des2, k=2)
    good_matches = [m for m, n in matches if m.distance < 0.75 * n.distance]

    # 4. RANSAC Homography Estimation
    src_pts = np.float32([kp1[m.queryIdx].pt for m in good_matches]).reshape(-1, 1, 2)
    dst_pts = np.float32([kp2[m.trainIdx].pt for m in good_matches]).reshape(-1, 1, 2)
    H, mask = cv2.findHomography(dst_pts, src_pts, cv2.RANSAC, 3.0)

    # 5. Warp Target to Reference Geometry
    warped = cv2.warpPerspective(img2, H, (img1.shape[1], img1.shape[0]))

    return {"status": "success", "homography": H.tolist(), "inliers": int(np.sum(mask))}`}
          </pre>
        </div>
      </div>

      {/* Target Missions */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-3">
        <h3 className="text-sm font-bold font-mono text-white flex items-center gap-2">
          <Globe2 className="w-4 h-4 text-cyan-400" />
          Supported Lunar Missions & Sensors
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
            <div className="text-cyan-400 font-bold">ISRO Chandrayaan-2</div>
            <div className="text-slate-400 text-[11px] mt-1">TMC-2 (0.5m/px triplet)</div>
          </div>
          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
            <div className="text-cyan-400 font-bold">ISRO Chandrayaan-2/3</div>
            <div className="text-slate-400 text-[11px] mt-1">OHRC (0.32m/px High-Res)</div>
          </div>
          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
            <div className="text-cyan-400 font-bold">NASA LRO</div>
            <div className="text-slate-400 text-[11px] mt-1">LROC NAC / WAC (0.5m/px)</div>
          </div>
          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
            <div className="text-cyan-400 font-bold">JAXA Kaguya</div>
            <div className="text-slate-400 text-[11px] mt-1">Terrain Camera (TC 10m/px)</div>
          </div>
        </div>
      </div>
    </div>
  );
};
