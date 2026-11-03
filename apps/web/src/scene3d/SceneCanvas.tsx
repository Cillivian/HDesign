import { Component, lazy, Suspense, useState, type ErrorInfo, type ReactNode } from 'react';
import { Rotate3d } from 'lucide-react';
import { Button, Spinner } from '../design-system/primitives';
import { useUiStore } from '../store/ui-store';
import { supportsWebGL2 } from './webgl';

/**
 * Lightweight 3D entry point: this module must stay free of three.js so it can be
 * statically imported by EditorPage; the heavy renderer is a lazy chunk.
 */
const SceneView = lazy(() => import('./SceneView'));

export function SceneCanvas() {
  const setView = useUiStore((state) => state.setView);
  const [supported] = useState(supportsWebGL2);
  const [attempt, setAttempt] = useState(0);

  return (
    <div className="absolute inset-0 overflow-hidden bg-[var(--canvas-backdrop)]">
      {supported ? (
        <SceneErrorBoundary key={attempt} onRetry={() => setAttempt((value) => value + 1)}>
          <Suspense fallback={<SceneLoading />}>
            <SceneView />
          </Suspense>
        </SceneErrorBoundary>
      ) : (
        <SceneUnsupported onBack={() => setView('2d')} />
      )}
    </div>
  );
}

function SceneLoading() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[var(--canvas-backdrop)]">
      <Spinner className="h-5 w-5 text-accent" />
      <p className="text-[12px] text-muted">正在构建三维场景…</p>
      <p className="text-[10px] text-faint">3D 场景 · 墙体 / 门窗 / 家具 / 水电</p>
    </div>
  );
}

function SceneUnsupported({ onBack }: { onBack: () => void }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center px-6">
      <div className="w-full max-w-[380px] rounded-[4px] border border-line bg-surface p-6 text-center shadow-[var(--shadow-pop)]">
        <Rotate3d size={22} className="mx-auto mb-3 text-electric" />
        <h2 className="text-[15px] font-semibold text-ink">当前环境不支持 WebGL2</h2>
        <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
          三维渲染需要 WebGL2。请升级浏览器、开启硬件加速，或关闭无痕/省电模式后重试。平面编辑不受影响。
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <Button variant="primary" size="sm" onClick={onBack}>
            返回 2D 平面
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            重试
          </Button>
        </div>
      </div>
    </div>
  );
}

interface BoundaryProps {
  children: ReactNode;
  onRetry: () => void;
}

interface BoundaryState {
  error: Error | null;
}

class SceneErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('3D 场景渲染失败', error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="absolute inset-0 flex items-center justify-center px-6">
          <div className="w-full max-w-[400px] rounded-[4px] border border-line bg-surface p-6 text-center shadow-[var(--shadow-pop)]">
            <Rotate3d size={22} className="mx-auto mb-3 text-electric" />
            <h2 className="text-[15px] font-semibold text-ink">三维场景加载失败</h2>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
              渲染器遇到异常，可能是显卡驱动问题。可以重试三维视图，或返回平面继续编辑。
            </p>
            <p className="mt-2 break-words rounded-[2px] bg-raised px-2 py-1 text-left font-mono text-[10px] text-faint">
              {this.state.error.message}
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <Button variant="primary" size="sm" onClick={this.props.onRetry}>
                重试
              </Button>
              <Button variant="outline" size="sm" onClick={() => useUiStore.getState().setView('2d')}>
                返回 2D 平面
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
