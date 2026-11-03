import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useDocStore } from '../store/doc-store';
import { useUiStore } from '../store/ui-store';
import { flushAutosave } from '../store/persistence';
import { TopBar } from './TopBar';
import { LeftRail } from './LeftRail';
import { LeftPanel } from './LeftPanel';
import { RightPanel } from './RightPanel';
import { StatusBar } from './StatusBar';

export function AppShell({ children }: { children: ReactNode }) {
  const leftCollapsed = useUiStore((state) => state.leftCollapsed);
  const rightCollapsed = useUiStore((state) => state.rightCollapsed);
  const pushToast = useUiStore((state) => state.pushToast);
  const [compact, setCompact] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 1180,
  );
  // On narrow screens the side panels become drawers: start collapsed and let the
  // rail/top-bar toggles open them over the canvas.
  useEffect(() => {
    const media = window.matchMedia('(max-width: 1179px)');
    const apply = (matches: boolean) => {
      setCompact(matches);
      if (matches) {
        useUiStore.setState({ leftCollapsed: true, rightCollapsed: true });
      }
    };
    apply(media.matches);
    const handler = (event: MediaQueryListEvent) => apply(event.matches);
    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (useDocStore.getState().dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void flushAutosave()
          .then(() => pushToast('已保存到本机', 'success'))
          .catch(() => pushToast('保存失败，请导出备份', 'error'));
      }
    },
    [pushToast],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-app" onKeyDown={onKeyDown}>
      <TopBar />
      <div className="relative flex min-h-0 flex-1">
        <LeftRail />
        {leftCollapsed ? null : <LeftPanel />}
        {compact && (!leftCollapsed || !rightCollapsed) ? (
          <button
            type="button"
            aria-label="关闭侧栏"
            className="absolute inset-0 z-20 bg-[rgba(12,15,13,0.24)]"
            onClick={() => useUiStore.setState({ leftCollapsed: true, rightCollapsed: true })}
          />
        ) : null}
        <main className="relative min-w-0 flex-1 overflow-hidden bg-app" aria-label="设计画布">
          {children}
        </main>
        {rightCollapsed ? null : <RightPanel />}
      </div>
      <StatusBar />
    </div>
  );
}
