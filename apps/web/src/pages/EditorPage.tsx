import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileWarning } from 'lucide-react';
import { AppShell } from '../app/AppShell';
import { StageCanvas } from '../editor/StageCanvas';
import { SceneCanvas } from '../scene3d/SceneCanvas';
import { useDocStore } from '../store/doc-store';
import { useUiStore } from '../store/ui-store';
import { getProject, startAutosave } from '../store/persistence';
import { Button, Spinner } from '../design-system/primitives';

type LoadState = 'loading' | 'ready' | 'missing' | 'error';

export function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const loadProject = useDocStore((state) => state.loadProject);
  const view = useUiStore((state) => state.view);
  const [state, setState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    if (!id) {
      setState('missing');
      return;
    }
    getProject(id)
      .then((project) => {
        if (cancelled) return;
        if (!project) {
          setState('missing');
          return;
        }
        loadProject(project);
        setState('ready');
        const prompt = sessionStorage.getItem('hdesign.pendingPrompt');
        if (prompt) {
          sessionStorage.removeItem('hdesign.pendingPrompt');
          useUiStore.getState().setRightPanel('ai');
          window.setTimeout(() => {
            window.dispatchEvent(new CustomEvent('hdesign:ai-prompt', { detail: prompt }));
          }, 120);
        }
        if (sessionStorage.getItem('hdesign.openImport') === '1') {
          sessionStorage.removeItem('hdesign.openImport');
          useUiStore.getState().setLeftPanel('import');
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setErrorMessage(error instanceof Error ? error.message : String(error));
        setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [id, loadProject]);

  useEffect(() => {
    if (state !== 'ready') return;
    const stop = startAutosave();
    return stop;
  }, [state]);

  if (state === 'loading') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-app">
        <Spinner className="h-5 w-5 text-accent" />
        <p className="text-[12px] text-muted">正在载入本机方案…</p>
      </div>
    );
  }

  if (state === 'missing' || state === 'error') {
    return (
      <div className="flex h-full items-center justify-center bg-app px-6">
        <div className="w-full max-w-[380px] rounded-[4px] border border-line bg-surface p-6 text-center shadow-[var(--shadow-pop)]">
          <FileWarning size={24} className="mx-auto mb-3 text-electric" />
          <h1 className="text-[15px] font-semibold text-ink">
            {state === 'missing' ? '找不到这个项目' : '项目读取失败'}
          </h1>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
            {state === 'missing'
              ? '项目可能已被删除，或链接来自另一台设备。'
              : errorMessage ?? '数据可能损坏，请尝试导出备份或重新导入。'}
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Button variant="primary" size="sm" onClick={() => navigate('/')}>
              <ArrowLeft size={14} /> 返回项目列表
            </Button>
            <Link
              to="/"
              className="inline-flex h-7 items-center rounded-[2px] border border-line px-2.5 text-[11px] text-muted hover:bg-subtle hover:text-ink"
            >
              从示例开始
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <AppShell>{view === '2d' ? <StageCanvas /> : <SceneCanvas />}</AppShell>;
}
