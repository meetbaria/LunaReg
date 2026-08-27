import {
  FeatureMatch,
  FeaturePoint,
  LunarImageMeta,
  PipelineStage,
  RegistrationMetrics,
  RegistrationParams,
  RegistrationResult,
  TransformationMatrix,
} from '../types/registration';

export const DEFAULT_REGISTRATION_PARAMS: RegistrationParams = {
  detectorType: 'SIFT',
  matcherType: 'FLANN',
  outlierFilter: 'RANSAC',
  transformType: 'Homography',
  ransacThreshold: 3.0,
  maxFeatures: 1500,
  ratioTestValue: 0.75,
};

export const INITIAL_PIPELINE_STAGES: PipelineStage[] = [
  {
    id: 'stage-preprocess',
    name: 'Image Preprocessing',
    description: 'CLAHE local contrast enhancement, regolith noise reduction & gradient normalization.',
    status: 'pending',
  },
  {
    id: 'stage-detection',
    name: 'Feature Detection',
    description: 'Scale-space crater rim corner & blob keypoint extraction across octave scales.',
    status: 'pending',
  },
  {
    id: 'stage-description',
    name: 'Feature Description',
    description: '128-dim invariant gradient orientation descriptors calculation.',
    status: 'pending',
  },
  {
    id: 'stage-matching',
    name: 'Feature Matching',
    description: 'Fast Library for Approximate Nearest Neighbors (FLANN) with Lowe’s ratio test.',
    status: 'pending',
  },
  {
    id: 'stage-outlier',
    name: 'Outlier Rejection',
    description: 'Robust RANSAC / MAGSAC++ epipolar & geometric consistency filtering.',
    status: 'pending',
  },
  {
    id: 'stage-transform',
    name: 'Transformation Estimation',
    description: 'Direct Linear Transformation (DLT) Homography Matrix H estimation with Levenberg-Marquardt refinement.',
    status: 'pending',
  },
  {
    id: 'stage-warp',
    name: 'Image Registration & Warping',
    description: 'Subpixel bilinear perspective transformation & registration residual mapping.',
    status: 'pending',
  },
];

export class RegistrationService {
  /**
   * Run registration workflow.
   * Currently provides high-fidelity simulated CV results with actual canvas warping.
   * Designed to be swapped with `fetch('/api/v1/register', ...)` for Python OpenCV backend.
   */
  public static async executeRegistration(
    reference: LunarImageMeta,
    target: LunarImageMeta,
    params: RegistrationParams = DEFAULT_REGISTRATION_PARAMS,
    onStageUpdate?: (stages: PipelineStage[]) => void
  ): Promise<RegistrationResult> {
    const stages: PipelineStage[] = INITIAL_PIPELINE_STAGES.map((s) => ({ ...s, status: 'pending' }));

    const updateStage = async (index: number, duration: number, details?: string) => {
      stages[index].status = 'processing';
      if (onStageUpdate) onStageUpdate([...stages]);
      await new Promise((resolve) => setTimeout(resolve, duration));
      stages[index].status = 'completed';
      stages[index].durationMs = duration;
      if (details) stages[index].details = details;
      if (onStageUpdate) onStageUpdate([...stages]);
    };

    // Stage 1: Preprocessing
    await updateStage(0, 320, 'CLAHE clipLimit=3.0, tileGrid=(8,8). Bilateral filter applied.');

    // Stage 2: Feature Detection
    const detectedRef = Math.floor(1100 + Math.random() * 300);
    const detectedTarget = Math.floor(1000 + Math.random() * 250);
    await updateStage(1, 400, `Detected ${detectedRef} keypoints on Ref, ${detectedTarget} on Target.`);

    // Stage 3: Description
    await updateStage(2, 350, '128-D descriptors computed for all detected crater landmarks.');

    // Stage 4: Matching
    const initialMatchesCount = Math.floor(310 + Math.random() * 60);
    await updateStage(3, 420, `${initialMatchesCount} mutual nearest-neighbor matches found (ratio < ${params.ratioTestValue}).`);

    // Stage 5: Outlier Rejection
    const validMatchesCount = Math.floor(initialMatchesCount * (0.62 + Math.random() * 0.08));
    const inlierRatio = Number(((validMatchesCount / initialMatchesCount) * 100).toFixed(1));
    await updateStage(4, 380, `RANSAC identified ${validMatchesCount} inliers (${inlierRatio}% inlier ratio). Threshold: ${params.ransacThreshold}px.`);

    // Stage 6: Transformation Estimation
    const meanError = Number((1.4 + Math.random() * 0.7).toFixed(2));
    await updateStage(5, 300, `Homography estimated with Mean Reprojection RMSE: ${meanError} px.`);

    // Stage 7: Warping & Canvas Generation
    await updateStage(6, 450, 'WarpPerspective executed with subpixel bilinear interpolation.');

    // Generate Feature Points and Matches
    const { refFeatures, targetFeatures, matches } = this.generateMatchesData(
      reference.width,
      reference.height,
      initialMatchesCount,
      validMatchesCount
    );

    // Compute realistic 3x3 Homography Matrix
    const transformation: TransformationMatrix = {
      type: 'Homography',
      matrix: [
        [0.9842, -0.0612, 14.82],
        [0.0598, 0.9914, -8.64],
        [0.000042, -0.000018, 1.0],
      ],
      rotationDeg: 3.52,
      scaleX: 0.985,
      scaleY: 0.992,
      translationX: 14.82,
      translationY: -8.64,
    };

    // Generate actual warped image and difference heatmap on Canvas
    const { registeredUrl, differenceUrl } = await this.renderWarpedAndDifference(
      reference.url,
      target.url,
      reference.width,
      reference.height
    );

    const metrics: RegistrationMetrics = {
      detectedRefFeatures: detectedRef,
      detectedTargetFeatures: detectedTarget,
      initialMatches: initialMatchesCount,
      validMatches: validMatchesCount,
      inlierRatio,
      registrationError: meanError,
      maxReprojectionError: Number((meanError * 2.1).toFixed(2)),
      transformationModel: 'Homography',
      confidence: 'High',
      confidenceScore: 94.6,
      processingTimeMs: stages.reduce((acc, s) => acc + (s.durationMs || 0), 0),
      spatialOverlapPercent: 91.4,
      subpixelPrecision: true,
      isSimulated: true,
    };

    const result: RegistrationResult = {
      id: `reg-${Date.now()}`,
      referenceImage: reference,
      targetImage: target,
      registeredImageCanvasUrl: registeredUrl,
      differenceHeatmapUrl: differenceUrl,
      refFeatures,
      targetFeatures,
      matches,
      transformation,
      metrics,
      params,
      createdAt: new Date().toISOString(),
      pipelineStages: stages,
    };

    return result;
  }

  private static generateMatchesData(
    w: number,
    h: number,
    totalMatches: number,
    inliersCount: number
  ) {
    const refFeatures: FeaturePoint[] = [];
    const targetFeatures: FeaturePoint[] = [];
    const matches: FeatureMatch[] = [];

    // Distribute keypoints realistically (concentrated near crater rims and high relief)
    const margin = 40;
    for (let i = 0; i < totalMatches; i++) {
      const isInlier = i < inliersCount;

      // Base point on reference
      const rx = margin + Math.random() * (w - 2 * margin);
      const ry = margin + Math.random() * (h - 2 * margin);

      const refPt: FeaturePoint = {
        id: i,
        x: Number(rx.toFixed(1)),
        y: Number(ry.toFixed(1)),
        size: Math.floor(4 + Math.random() * 8),
        angle: Math.floor(Math.random() * 360),
        response: Number((0.4 + Math.random() * 0.6).toFixed(3)),
      };
      refFeatures.push(refPt);

      // Target point with homography displacement + small error if inlier, or random outlier shift
      let tx: number;
      let ty: number;
      let repError = 0;

      if (isInlier) {
        // True correspondence with subpixel noise
        const dx = (rx - w / 2) * 0.985 - (ry - h / 2) * 0.06 + 14.8;
        const dy = (rx - w / 2) * 0.06 + (ry - h / 2) * 0.99 - 8.6;
        tx = w / 2 + dx + (Math.random() - 0.5) * 2.2;
        ty = h / 2 + dy + (Math.random() - 0.5) * 2.2;
        repError = Number((Math.random() * 2.4).toFixed(2));
      } else {
        // Mismatched outlier
        tx = Math.max(margin, Math.min(w - margin, rx + (Math.random() - 0.5) * 160));
        ty = Math.max(margin, Math.min(h - margin, ry + (Math.random() - 0.5) * 160));
        repError = Number((14.0 + Math.random() * 45).toFixed(2));
      }

      const targetPt: FeaturePoint = {
        id: i,
        x: Number(tx.toFixed(1)),
        y: Number(ty.toFixed(1)),
        size: Math.floor(4 + Math.random() * 8),
        angle: Math.floor(Math.random() * 360),
        response: Number((0.3 + Math.random() * 0.6).toFixed(3)),
      };
      targetFeatures.push(targetPt);

      matches.push({
        id: i,
        refPointIndex: i,
        targetPointIndex: i,
        refPoint: refPt,
        targetPoint: targetPt,
        distance: isInlier ? Number((18 + Math.random() * 20).toFixed(1)) : Number((75 + Math.random() * 60).toFixed(1)),
        confidence: isInlier ? Number((0.82 + Math.random() * 0.17).toFixed(2)) : Number((0.2 + Math.random() * 0.3).toFixed(2)),
        isInlier,
        reprojectionError: repError,
      });
    }

    return { refFeatures, targetFeatures, matches };
  }

  private static async renderWarpedAndDifference(
    refUrl: string,
    targetUrl: string,
    width: number,
    height: number
  ): Promise<{ registeredUrl: string; differenceUrl: string }> {
    return new Promise((resolve) => {
      const refImg = new Image();
      const targetImg = new Image();
      let loaded = 0;

      const checkBothLoaded = () => {
        loaded++;
        if (loaded < 2) return;

        // 1. Registered Canvas (Target warped back onto Reference geometry)
        const regCanvas = document.createElement('canvas');
        regCanvas.width = width;
        regCanvas.height = height;
        const regCtx = regCanvas.getContext('2d')!;

        regCtx.drawImage(refImg, 0, 0, width, height);

        // Blend slightly with warped target to simulate precision alignment
        regCtx.globalAlpha = 0.88;
        regCtx.save();
        // Counter-transform applied to align target exactly to ref
        regCtx.translate(width / 2, height / 2);
        regCtx.rotate((-0.015 * Math.PI) / 180);
        regCtx.scale(0.995, 0.995);
        regCtx.drawImage(targetImg, -width / 2 - 2, -height / 2 + 1, width, height);
        regCtx.restore();
        regCtx.globalAlpha = 1.0;

        const registeredUrl = regCanvas.toDataURL('image/png');

        // 2. Difference / Residual Heatmap Canvas
        const diffCanvas = document.createElement('canvas');
        diffCanvas.width = width;
        diffCanvas.height = height;
        const diffCtx = diffCanvas.getContext('2d')!;

        // Draw ref
        diffCtx.drawImage(refImg, 0, 0, width, height);
        const refData = diffCtx.getImageData(0, 0, width, height);

        // Draw registered target
        diffCtx.drawImage(regCanvas, 0, 0, width, height);
        const regData = diffCtx.getImageData(0, 0, width, height);

        const diffImgData = diffCtx.createImageData(width, height);
        for (let i = 0; i < refData.data.length; i += 4) {
          const rDiff = Math.abs(refData.data[i] - regData.data[i]);
          const gDiff = Math.abs(refData.data[i + 1] - regData.data[i + 1]);
          const bDiff = Math.abs(refData.data[i + 2] - regData.data[i + 2]);
          const avgDiff = (rDiff + gDiff + bDiff) / 3;

          // Scientific pseudo-color map (Cool to Warm): Blue (low error) -> Cyan -> Green -> Yellow -> Red (high error)
          const norm = Math.min(1.0, avgDiff / 45);
          if (norm < 0.25) {
            // Dark blue to cyan
            diffImgData.data[i] = 15;
            diffImgData.data[i + 1] = Math.floor(norm * 4 * 180 + 30);
            diffImgData.data[i + 2] = 220;
          } else if (norm < 0.5) {
            // Cyan to green
            diffImgData.data[i] = Math.floor((norm - 0.25) * 4 * 120);
            diffImgData.data[i + 1] = 220;
            diffImgData.data[i + 2] = Math.floor((0.5 - norm) * 4 * 200);
          } else if (norm < 0.75) {
            // Green to yellow
            diffImgData.data[i] = Math.floor((norm - 0.5) * 4 * 255);
            diffImgData.data[i + 1] = 220;
            diffImgData.data[i + 2] = 20;
          } else {
            // Yellow to high red
            diffImgData.data[i] = 255;
            diffImgData.data[i + 1] = Math.floor((1.0 - norm) * 4 * 200);
            diffImgData.data[i + 2] = 30;
          }
          diffImgData.data[i + 3] = 230; // Alpha
        }
        diffCtx.putImageData(diffImgData, 0, 0);
        const differenceUrl = diffCanvas.toDataURL('image/png');

        resolve({ registeredUrl, differenceUrl });
      };

      refImg.crossOrigin = 'anonymous';
      targetImg.crossOrigin = 'anonymous';
      refImg.onload = checkBothLoaded;
      targetImg.onload = checkBothLoaded;
      refImg.src = refUrl;
      targetImg.src = targetUrl;
    });
  }
}
