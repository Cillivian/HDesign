import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { ProjectsPage } from './pages/ProjectsPage';
import { EditorPage } from './pages/EditorPage';
import { NotFound } from './pages/NotFound';
import { Toaster } from './app/Toaster';
import { GlobalDialogs } from './app/Dialogs';
import { useGlobalShortcuts } from './app/useGlobalShortcuts';
import { applyTheme } from './design-system/theme';
import { useUiStore } from './store/ui-store';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('HDesign crashed', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-full items-center justify-center bg-app px-6">
        <div className="w-full max-w-[440px] rounded-[4px] border border-line bg-surface p-6">
          <p className="text-[11px] font-medium text-danger">界面出现异常</p>
          <h1 className="mt-1 font-serif text-[20px] font-semibold text-ink">这一页没有画完</h1>
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            错误已被拦截，本机项目数据不会因此丢失。可以先刷新重试，或返回项目列表。
          </p>
          <pre className="mt-3 max-h-[120px] overflow-auto rounded-[2px] bg-subtle p-2 text-[10px] text-muted">
            {this.state.error.message}
          </pre>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="h-8 rounded-[2px] bg-[var(--ink)] px-3 text-[12px] text-[var(--bg-surface)]"
            >
              刷新页面
            </button>
            <button
              type="button"
              onClick={() => {
                window.location.href = '/';
              }}
              className="h-8 rounded-[2px] border border-line bg-surface px-3 text-[12px] text-ink hover:bg-subtle"
            >
              返回项目列表
            </button>
          </div>
        </div>
      </div>
    );
  }
}

function GlobalShortcuts() {
  useGlobalShortcuts();
  return null;
}

function ThemeSync() {
  const theme = useUiStore((state) => state.theme);
  const accent = useUiStore((state) => state.accent);
  const canvasStyle = useUiStore((state) => state.canvasStyle);

  useEffect(() => {
    applyTheme(theme, accent, canvasStyle);
  }, [theme, accent, canvasStyle]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      const state = useUiStore.getState();
      if (state.theme === 'system') applyTheme('system', state.accent, state.canvasStyle);
    };
    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
  }, []);

  return null;
}

export function App() {
  return (
    <ErrorBoundary>
      <TooltipPrimitive.Provider delayDuration={280} skipDelayDuration={120}>
        <BrowserRouter>
          <ThemeSync />
          <GlobalShortcuts />
          <Routes>
            <Route path="/" element={<ProjectsPage />} />
            <Route path="/project/:id" element={<EditorPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          <GlobalDialogs />
          <Toaster />
        </BrowserRouter>
      </TooltipPrimitive.Provider>
    </ErrorBoundary>
  );
}
