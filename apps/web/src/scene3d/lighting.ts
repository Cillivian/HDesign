import { clamp } from '@hdesign/domain';
import type { SceneBounds } from './camera';

/**
 * Daylight model: sun position / intensity derived from a 7–18 hour slider.
 * Units — position in metres, intensities are three.js light intensities.
 */

export const DAY_START = 7;
export const DAY_END = 18;

/** 0 at sunrise/sunset, 1 at solar noon. */
export function daylightFactor(hour: number): number {
  const t = clamp((hour - DAY_START) / (DAY_END - DAY_START), 0, 1);
  return Math.sin(t * Math.PI);
}

export function sunPosition(hour: number, bounds: SceneBounds): [number, number, number] {
  const t = clamp((hour - DAY_START) / (DAY_END - DAY_START), 0, 1);
  const azimuth = Math.PI * t; // 0 = east (+x), π = west (-x)
  const elevation = (12 + daylightFactor(hour) * 58) * (Math.PI / 180);
  const radius = Math.max(bounds.spanMm * 0.001 * 2.2, 8);
  const cx = bounds.center.x * 0.001;
  const cz = bounds.center.y * 0.001;
  return [
    cx + Math.cos(azimuth) * Math.cos(elevation) * radius,
    Math.sin(elevation) * radius,
    cz + Math.sin(azimuth) * Math.cos(elevation) * radius * 0.55,
  ];
}

export function sunColor(hour: number): string {
  const t = clamp((hour - DAY_START) / (DAY_END - DAY_START), 0, 1);
  // Warm at the edges of the day, near-neutral around noon.
  const edge = Math.min(t, 1 - t) * 2; // 0 edges, 1 noon
  if (edge < 0.35) return '#FFC98A';
  if (edge < 0.7) return '#FFE3BC';
  return '#FFF7EA';
}

export interface LightingState {
  sunIntensity: number;
  sunColor: string;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  ambientIntensity: number;
  /** Warm interior point-light intensity per room. */
  interiorIntensity: number;
  exposure: number;
}

export function lightingState(hour: number, night: boolean): LightingState {
  if (night) {
    return {
      sunIntensity: 0,
      sunColor: '#8FA8C8',
      hemiSky: '#3A4657',
      hemiGround: '#1A1D21',
      hemiIntensity: 0.22,
      ambientIntensity: 0.16,
      interiorIntensity: 1.15,
      exposure: 0.95,
    };
  }
  const factor = daylightFactor(hour);
  const dusk = factor < 0.25;
  return {
    sunIntensity: 0.35 + factor * 2.25,
    sunColor: sunColor(hour),
    hemiSky: dusk ? '#E9C9A8' : '#DDE6EC',
    hemiGround: dusk ? '#9A8E7D' : '#B9BDB1',
    hemiIntensity: 0.35 + factor * 0.45,
    ambientIntensity: 0.12 + factor * 0.18,
    interiorIntensity: dusk ? 0.55 : 0.22,
    exposure: 1.02,
  };
}
