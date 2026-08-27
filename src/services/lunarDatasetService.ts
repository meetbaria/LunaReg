import { LunarImageMeta } from '../types/registration';

export interface LunarDatasetPreset {
  id: string;
  name: string;
  mission: string;
  description: string;
  resolutionMpp: number;
  rotationDeg: number;
  scaleFactor: number;
  shiftX: number;
  shiftY: number;
  contrastDiff: number;
  craterCount: number;
  seed: number;
}

export const LUNAR_PRESETS: LunarDatasetPreset[] = [
  {
    id: 'shackleton-south-pole',
    name: 'Shackleton Crater Rim (South Pole PSR)',
    mission: 'Chandrayaan-2 TMC-2 / LRO NAC',
    description: 'Permanently Shadowed Region (PSR) with extreme low sun-angle lighting & high topography contrast.',
    resolutionMpp: 0.5,
    rotationDeg: 7.2,
    scaleFactor: 1.04,
    shiftX: 24,
    shiftY: -18,
    contrastDiff: 1.15,
    craterCount: 22,
    seed: 1042,
  },
  {
    id: 'tycho-crater-ejecta',
    name: 'Tycho Crater High-Albedo Rays',
    mission: 'Chandrayaan-2 OHRC (High Res)',
    description: 'Prominent radial ejecta rays, fractured impact floor, and complex craterlet clusters.',
    resolutionMpp: 0.32,
    rotationDeg: -5.4,
    scaleFactor: 0.97,
    shiftX: -32,
    shiftY: 28,
    contrastDiff: 0.9,
    craterCount: 30,
    seed: 2088,
  },
  {
    id: 'mare-tranquillitatis',
    name: 'Mare Tranquillitatis Regolith Plane',
    mission: 'ISRO TMC Basemap vs Multi-Orbit',
    description: 'Basaltic mare plain with micro-cratering, low relief, and subtle albedo variations.',
    resolutionMpp: 1.25,
    rotationDeg: 12.0,
    scaleFactor: 1.08,
    shiftX: 45,
    shiftY: -35,
    contrastDiff: 1.2,
    craterCount: 18,
    seed: 3341,
  },
  {
    id: 'aristarchus-plateau',
    name: 'Aristarchus Pyroclastic Plateau',
    mission: 'Lunar Reconnaissance Orbiter (LROC)',
    description: 'Geologically diverse volcanic plateau with sinuous rilles (Vallis Schröteri) and steep scarps.',
    resolutionMpp: 0.8,
    rotationDeg: -8.8,
    scaleFactor: 1.02,
    shiftX: 18,
    shiftY: 42,
    contrastDiff: 1.05,
    craterCount: 26,
    seed: 4912,
  },
];

// Generates high-fidelity lunar terrain with realistic craters, ejecta, noise, and shadow effects on an HTML Canvas
function generateLunarCanvas(
  width: number,
  height: number,
  preset: LunarDatasetPreset,
  isTarget: boolean
): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Base regolith gray tones (dark basalt to light anorthosite)
  const baseLuminance = isTarget ? 65 * preset.contrastDiff : 70;
  const baseColor = `rgb(${baseLuminance}, ${baseLuminance + 2}, ${baseLuminance + 4})`;
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, width, height);

  // Add regolith noise texture
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  let pseudoRandom = preset.seed;
  const rnd = () => {
    pseudoRandom = (pseudoRandom * 9301 + 49297) % 233280;
    return pseudoRandom / 233280;
  };

  for (let i = 0; i < data.length; i += 4) {
    const grain = (rnd() - 0.5) * 35;
    data[i] = Math.min(255, Math.max(0, data[i] + grain));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + grain));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + grain));
  }
  ctx.putImageData(imgData, 0, 0);

  // If this is the target image, apply geometric transformation and optical differences
  if (isTarget) {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d')!;
    tempCtx.drawImage(canvas, 0, 0);

    ctx.save();
    ctx.fillStyle = '#1c1c1e';
    ctx.fillRect(0, 0, width, height);
    ctx.translate(width / 2 + preset.shiftX, height / 2 + preset.shiftY);
    ctx.rotate((preset.rotationDeg * Math.PI) / 180);
    ctx.scale(preset.scaleFactor, preset.scaleFactor);
    ctx.drawImage(tempCanvas, -width / 2, -height / 2);
    ctx.restore();
  }

  // Draw procedural craters with distinct sun-illumination shadow and rim highlights
  // Illumination angle: Sun coming from top-left (e.g. 135 degrees)
  const sunAngle = isTarget ? Math.PI * 0.72 : Math.PI * 0.75;
  const craterSeeds: Array<{ x: number; y: number; r: number; depth: number }> = [];

  // Deterministic craters
  let cRnd = preset.seed * 3;
  const localRnd = () => {
    cRnd = (cRnd * 9301 + 49297) % 233280;
    return cRnd / 233280;
  };

  for (let c = 0; c < preset.craterCount; c++) {
    let cx = localRnd() * (width - 100) + 50;
    let cy = localRnd() * (height - 100) + 50;
    let radius = localRnd() * 45 + 12;
    if (c === 0) {
      // One dominant landmark crater
      cx = width * 0.45;
      cy = height * 0.42;
      radius = Math.min(width, height) * 0.22;
    } else if (c === 1) {
      cx = width * 0.72;
      cy = height * 0.68;
      radius = Math.min(width, height) * 0.14;
    }

    // If target, warp position
    if (isTarget) {
      const rad = (preset.rotationDeg * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const dx = (cx - width / 2) * preset.scaleFactor;
      const dy = (cy - height / 2) * preset.scaleFactor;
      cx = width / 2 + preset.shiftX + (dx * cos - dy * sin);
      cy = height / 2 + preset.shiftY + (dx * sin + dy * cos);
      radius *= preset.scaleFactor;
    }

    craterSeeds.push({ x: cx, y: cy, r: radius, depth: localRnd() * 0.5 + 0.5 });
  }

  // Render Craters
  craterSeeds.forEach(({ x, y, r, depth }) => {
    ctx.save();

    // 1. Ejecta blanket (light halo)
    const ejectaGrad = ctx.createRadialGradient(x, y, r * 0.8, x, y, r * 1.8);
    ejectaGrad.addColorStop(0, 'rgba(210, 215, 220, 0.45)');
    ejectaGrad.addColorStop(0.6, 'rgba(180, 185, 190, 0.15)');
    ejectaGrad.addColorStop(1, 'rgba(100, 100, 100, 0)');
    ctx.fillStyle = ejectaGrad;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.8, 0, Math.PI * 2);
    ctx.fill();

    // 2. Crater floor (dark depression)
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgb(${25 * depth}, ${25 * depth}, ${28 * depth})`;
    ctx.fill();

    // 3. Shadow side (interior cast shadow facing away from sun)
    const shadowOffsetX = Math.cos(sunAngle) * (r * 0.45);
    const shadowOffsetY = Math.sin(sunAngle) * (r * 0.45);
    const shadowGrad = ctx.createRadialGradient(
      x - shadowOffsetX,
      y - shadowOffsetY,
      r * 0.1,
      x,
      y,
      r
    );
    shadowGrad.addColorStop(0, 'rgba(5, 5, 8, 0.95)');
    shadowGrad.addColorStop(0.5, 'rgba(15, 15, 20, 0.7)');
    shadowGrad.addColorStop(1, 'rgba(40, 40, 45, 0)');
    ctx.fillStyle = shadowGrad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // 4. Illuminated rim crest (sun-facing bright ridge)
    ctx.lineWidth = Math.max(2, r * 0.08);
    const rimGrad = ctx.createLinearGradient(
      x - Math.cos(sunAngle) * r,
      y - Math.sin(sunAngle) * r,
      x + Math.cos(sunAngle) * r,
      y + Math.sin(sunAngle) * r
    );
    rimGrad.addColorStop(0, 'rgba(245, 248, 255, 0.88)');
    rimGrad.addColorStop(0.5, 'rgba(160, 165, 175, 0.4)');
    rimGrad.addColorStop(1, 'rgba(10, 10, 15, 0.9)');
    ctx.strokeStyle = rimGrad;
    ctx.stroke();

    // 5. Central peak for larger craters
    if (r > 35) {
      const peakX = x - shadowOffsetX * 0.2;
      const peakY = y - shadowOffsetY * 0.2;
      const peakR = r * 0.18;
      ctx.beginPath();
      ctx.arc(peakX, peakY, peakR, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(220, 225, 235, 0.7)';
      ctx.fill();
    }

    ctx.restore();
  });

  // Stamp scientific grid & fiducial crosshairs subtly in corner
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  // Border tick marks
  for (let gx = 50; gx < width; gx += 100) {
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, 8);
    ctx.moveTo(gx, height - 8);
    ctx.lineTo(gx, height);
  }
  for (let gy = 50; gy < height; gy += 100) {
    ctx.moveTo(0, gy);
    ctx.lineTo(8, gy);
    ctx.moveTo(width - 8, gy);
    ctx.lineTo(width, gy);
  }
  ctx.stroke();

  return canvas.toDataURL('image/png');
}

export function loadLunarDemoImages(presetId: string = 'shackleton-south-pole'): {
  reference: LunarImageMeta;
  target: LunarImageMeta;
  preset: LunarDatasetPreset;
} {
  const preset = LUNAR_PRESETS.find((p) => p.id === presetId) || LUNAR_PRESETS[0];
  const width = 640;
  const height = 480;

  const refUrl = generateLunarCanvas(width, height, preset, false);
  const targetUrl = generateLunarCanvas(width, height, preset, true);

  const reference: LunarImageMeta = {
    id: `ref-${preset.id}-${Date.now()}`,
    name: `LUNAR_REF_${preset.id.toUpperCase()}_TMC2.png`,
    url: refUrl,
    width,
    height,
    sizeBytes: 428 * 1024,
    format: 'image/png',
    uploadedAt: new Date().toISOString(),
    missionSource: preset.mission,
    resolutionMpp: preset.resolutionMpp,
  };

  const target: LunarImageMeta = {
    id: `target-${preset.id}-${Date.now()}`,
    name: `LUNAR_TARGET_${preset.id.toUpperCase()}_ORBIT24.png`,
    url: targetUrl,
    width,
    height,
    sizeBytes: 412 * 1024,
    format: 'image/png',
    uploadedAt: new Date().toISOString(),
    missionSource: preset.mission,
    resolutionMpp: preset.resolutionMpp * preset.scaleFactor,
  };

  return { reference, target, preset };
}
