import { useEffect } from 'react';
import { flushAutosave } from '../store/persistence';
import { useDocStore } from '../store/doc-store';
import { useUiStore } from '../store/ui-store';

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]'),
  );
}

export function useGlobalShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      const ui = useUiStore.getState();
      const doc = useDocStore.getState();
      const typing = isTypingTarget(event.target);

      if (meta && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        ui.openDialog('command');
        return;
      }
      if (meta && event.key.toLowerCase() === 'j') {
        event.preventDefault();
        if (ui.rightPanel === 'ai' && !ui.rightCollapsed) {
          ui.setRightPanel('properties');
        } else {
          ui.setRightPanel('ai');
        }
        return;
      }
      if (meta && event.key === ',') {
        event.preventDefault();
        ui.openDialog('settings');
        return;
      }
      if (meta && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void flushAutosave().then(
          () => ui.pushToast('已保存到本机', 'success'),
          () => ui.pushToast('保存失败，请导出备份', 'error'),
        );
        return;
      }
      if (meta && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) doc.redo();
        else doc.undo();
        return;
      }
      if (meta && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        doc.redo();
        return;
      }
      if (typing) return;
      if (event.key === '?') {
        event.preventDefault();
        ui.openDialog('shortcuts');
        return;
      }
      if (event.key === 'Escape') {
        if (ui.activeDialog) return;
        if (ui.tool !== 'select') ui.setTool('select');
        ui.clearSelection();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
