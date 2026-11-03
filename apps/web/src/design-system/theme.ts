export type ThemeMode = 'light' | 'dark' | 'system';
export type AccentId = 'rust' | 'indigo' | 'pine' | 'graphite';
export type CanvasStyle = 'paper' | 'blueprint';

export interface UiPrefs {
  theme: ThemeMode;
  accent: AccentId;
  canvasStyle: CanvasStyle;
}

const THEME_KEY = 'hdesign.theme';
const ACCENT_KEY = 'hdesign.accent';
const CANVAS_KEY = 'hdesign.canvas';

const ACCENTS: AccentId[] = ['rust', 'indigo', 'pine', 'graphite'];
const THEMES: ThemeMode[] = ['light', 'dark', 'system'];
const CANVASES: CanvasStyle[] = ['paper', 'blueprint'];

export const ACCENT_PRESETS: Array<{ id: AccentId; label: string; swatch: string; dark: string }> = [
  { id: 'rust', label: '朱砂', swatch: '#C4442B', dark: '#E0674E' },
  { id: 'indigo', label: '靛青', swatch: '#2B5178', dark: '#6C9BC7' },
  { id: 'pine', label: '松绿', swatch: '#2F6B57', dark: '#6BBF9C' },
  { id: 'graphite', label: '石墨', swatch: '#2A2D2A', dark: '#C9CEC6' },
];

export function readUiPrefs(): UiPrefs {
  const fallback: UiPrefs = { theme: 'system', accent: 'rust', canvasStyle: 'paper' };
  try {
    const theme = localStorage.getItem(THEME_KEY) as ThemeMode | null;
    const accent = localStorage.getItem(ACCENT_KEY) as AccentId | null;
    const canvas = localStorage.getItem(CANVAS_KEY) as CanvasStyle | null;
    return {
      theme: theme && THEMES.includes(theme) ? theme : fallback.theme,
      accent: accent && ACCENTS.includes(accent) ? accent : fallback.accent,
      canvasStyle: canvas && CANVASES.includes(canvas) ? canvas : fallback.canvasStyle,
    };
  } catch {
    return fallback;
  }
}

export function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'light' || mode === 'dark') return mode;
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function applyTheme(mode: ThemeMode, accent: AccentId, canvas: CanvasStyle): void {
  const root = document.documentElement;
  root.dataset.theme = resolveTheme(mode);
  root.dataset.accent = accent;
  root.dataset.canvas = canvas;
  try {
    localStorage.setItem(THEME_KEY, mode);
    localStorage.setItem(ACCENT_KEY, accent);
    localStorage.setItem(CANVAS_KEY, canvas);
  } catch {
    /* storage may be unavailable in private mode */
  }
}

export interface CanvasColors {
  bg: string;
  grid: string;
  major: string;
  ink: string;
  subtle: string;
  wall: string;
  wallFill: string;
  furniture: string;
  select: string;
  water: string;
  electric: string;
}

const CANVAS_FALLBACK: CanvasColors = {
  bg: '#FBFAF6',
  grid: '#E2E4DC',
  major: '#D2D6CC',
  ink: '#23261F',
  subtle: '#6B7168',
  wall: '#2B2F29',
  wallFill: '#3C4139',
  furniture: '#8A8578',
  select: '#C4442B',
  water: '#2E6FA3',
  electric: '#A96F0B',
};

export function readCanvasColors(): CanvasColors {
  if (typeof window === 'undefined') return CANVAS_FALLBACK;
  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    bg: read('--canvas-bg', CANVAS_FALLBACK.bg),
    grid: read('--canvas-grid', CANVAS_FALLBACK.grid),
    major: read('--canvas-major', CANVAS_FALLBACK.major),
    ink: read('--canvas-ink', CANVAS_FALLBACK.ink),
    subtle: read('--canvas-subtle', CANVAS_FALLBACK.subtle),
    wall: read('--canvas-wall', CANVAS_FALLBACK.wall),
    wallFill: read('--canvas-wall-fill', CANVAS_FALLBACK.wallFill),
    furniture: read('--canvas-furniture', CANVAS_FALLBACK.furniture),
    select: read('--canvas-select', CANVAS_FALLBACK.select),
    water: read('--canvas-water', CANVAS_FALLBACK.water),
    electric: read('--canvas-electric', CANVAS_FALLBACK.electric),
  };
}
