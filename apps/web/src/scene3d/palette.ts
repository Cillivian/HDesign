import { useMemo } from 'react';
import { readCanvasColors, type CanvasColors } from '../design-system/theme';
import { useUiStore } from '../store/ui-store';

/** Token-derived colours for the 3D scene (kept out of the lazy chunk's imports of the DOM helpers). */
export interface ScenePalette extends CanvasColors {
  ground: string;
  outline: string;
  accent: string;
  labelBg: string;
  labelInk: string;
  backdrop: string;
  wallPaint: string;
  wallLoadBearing: string;
  wallLow: string;
  ceiling: string;
}

export function useScenePalette(): ScenePalette {
  const theme = useUiStore((state) => state.theme);
  const accent = useUiStore((state) => state.accent);
  const canvasStyle = useUiStore((state) => state.canvasStyle);

  // recompute whenever the canvas/theme tokens change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => buildScenePalette(), [theme, accent, canvasStyle]);
}

export function buildScenePalette(): ScenePalette {
  const colors = readCanvasColors();
  const backdrop =
    typeof window === 'undefined'
      ? colors.bg
      : getComputedStyle(document.documentElement).getPropertyValue('--canvas-backdrop').trim() || colors.bg;
  return {
    ...colors,
    backdrop,
    ground: colors.grid,
    outline: colors.major,
    accent: colors.select,
    labelBg: colors.bg,
    labelInk: colors.ink,
    wallPaint: '#E6E1D5',
    wallLoadBearing: '#D6CEC0',
    wallLow: '#EDE8DD',
    ceiling: '#F2EFE8',
  };
}
