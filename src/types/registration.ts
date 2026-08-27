export interface LunarImageMeta {
  id: string;
  name: string;
  url: string;
  width: number;
  height: number;
  sizeBytes: number;
  format: string;
  uploadedAt: string;
  missionSource?: string; // e.g. "Chandrayaan-2 TMC", "LRO NAC", "Apollo 15 Metric"
  resolutionMpp?: number; // meters per pixel
}

export interface FeaturePoint {
  id: number;
  x: number; // in pixels
  y: number; // in pixels
  size: number;
  angle: number;
  response: number;
  octave?: number;
}

export interface FeatureMatch {
  id: number;
  refPointIndex: number;
  targetPointIndex: number;
  refPoint: FeaturePoint;
  targetPoint: FeaturePoint;
  distance: number; // descriptor distance / metric
  confidence: number; // 0 to 1
  isInlier: boolean;
  reprojectionError?: number; // in pixels
}

export interface TransformationMatrix {
  type: 'Homography' | 'Affine' | 'Rigid' | 'ThinPlateSpline';
  matrix: number[][]; // 3x3 for Homography or 2x3 for Affine
  determinant?: number;
  scaleX?: number;
  scaleY?: number;
  rotationDeg?: number;
  translationX?: number;
  translationY?: number;
}

export interface RegistrationMetrics {
  detectedRefFeatures: number;
  detectedTargetFeatures: number;
  initialMatches: number;
  validMatches: number;
  inlierRatio: number; // percentage (e.g. 63.5%)
  registrationError: number; // mean RMSE in px (e.g. 1.82)
  maxReprojectionError: number;
  transformationModel: 'Homography' | 'Affine' | 'Rigid';
  confidence: 'High' | 'Medium' | 'Low';
  confidenceScore: number; // percentage (e.g. 94.2%)
  processingTimeMs: number;
  spatialOverlapPercent: number;
  subpixelPrecision: boolean;
  isSimulated: boolean;
}

export interface PipelineStage {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  durationMs?: number;
  details?: string;
}

export interface RegistrationParams {
  detectorType: 'SIFT' | 'ORB' | 'LoFTR' | 'SuperPoint' | 'AKAZE';
  matcherType: 'FLANN' | 'BFMatcher' | 'LoweRatio' | 'DualSoftmax';
  outlierFilter: 'RANSAC' | 'MAGSAC++' | 'USAC' | 'LMedS';
  transformType: 'Homography' | 'Affine' | 'Rigid';
  ransacThreshold: number; // e.g. 3.0 px
  maxFeatures: number; // e.g. 2000
  ratioTestValue: number; // e.g. 0.75
}

export interface RegistrationResult {
  id: string;
  referenceImage: LunarImageMeta;
  targetImage: LunarImageMeta;
  registeredImageCanvasUrl: string; // The warped target image
  differenceHeatmapUrl: string;
  refFeatures: FeaturePoint[];
  targetFeatures: FeaturePoint[];
  matches: FeatureMatch[];
  transformation: TransformationMatrix;
  metrics: RegistrationMetrics;
  params: RegistrationParams;
  createdAt: string;
  pipelineStages: PipelineStage[];
}

export interface RegistrationHistoryItem {
  id: string;
  title: string;
  date: string;
  refImageName: string;
  targetImageName: string;
  refThumbnail: string;
  targetThumbnail: string;
  inlierCount: number;
  inlierRatio: number;
  errorPx: number;
  model: string;
  datasetType: string;
  result: RegistrationResult;
}

export type ViewTab = 'side-by-side' | 'overlay' | 'matches' | 'difference';
export type NavPage = 'dashboard' | 'new-registration' | 'processing' | 'results' | 'history' | 'about';
