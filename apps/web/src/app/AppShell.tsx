import { useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useDocStore } from '../store/doc-store';
import { useUiStore } from '../store/ui-store';
import { flushAutosave } from '../store/persistence';
import { useGlobalShortcuts } from './useGlobalShortcuts';
import { TopBar } from './TopBar';
import { LeftRail } from './LeftRail';
import { LeftPanel } from './LeftPanel';
import { RightPanel } from './RightPanel';
import { StatusBar } from './StatusBar';
import { GlobalDialogs } from './Dialogs';

export function AppShell({ children }: { children: ReactNode }) {
  const leftCollapsed = useUiStore((state) => state.leftCollapsed);
  const rightCollapsed = useUiStore((state) => state.rightCollapsed);
  const pushToast = useUiStore((state) => state.pushToast);
  useGlobalShortcuts();

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
        <main className="relative min-w-0 flex-1 overflow-hidden bg-app" aria-label="设计画布">
          {children}
        </main>
        {rightCollapsed ? null : <RightPanel />}
      </div>
      <StatusBar />
      <GlobalDialogs />
    </div>
  );
}
