import { useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useUiStore, type ToastItem } from '../store/ui-store';
import { IconButton, cn } from '../design-system/primitives';

const ICONS = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
} as const;

const TONES = {
  info: 'border-line text-ink',
  success: 'border-ok/40 text-ink',
  warning: 'border-electric/40 text-ink',
  error: 'border-danger/40 text-ink',
} as const;

function ToastRow({ toast }: { toast: ToastItem }) {
  const dismissToast = useUiStore((state) => state.dismissToast);
  const Icon = ICONS[toast.kind];

  useEffect(() => {
    const timer = window.setTimeout(() => dismissToast(toast.id), 4200);
    return () => window.clearTimeout(timer);
  }, [toast.id, dismissToast]);

  return (
    <div
      role="status"
      className={cn(
        'pointer-events-auto flex w-[320px] items-start gap-2 rounded-[3px] border bg-surface px-3 py-2 shadow-[var(--shadow-pop)]',
        TONES[toast.kind],
      )}
    >
      <Icon
        size={15}
        className={cn(
          'mt-0.5 shrink-0',
          toast.kind === 'success' && 'text-ok',
          toast.kind === 'warning' && 'text-electric',
          toast.kind === 'error' && 'text-danger',
          toast.kind === 'info' && 'text-water',
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="text-[12px] leading-snug text-ink">{toast.message}</p>
        {toast.detail ? (
          <p className="mt-0.5 break-words text-[11px] leading-snug text-muted">{toast.detail}</p>
        ) : null}
      </div>
      <IconButton
        label="关闭提示"
        variant="ghost"
        size="icon-sm"
        className="-mr-1.5 -mt-1 h-6 w-6 shrink-0"
        onClick={() => dismissToast(toast.id)}
      >
        <X size={12} />
      </IconButton>
    </div>
  );
}

export function Toaster() {
  const toasts = useUiStore((state) => state.toasts);
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed bottom-9 right-3 z-[100] flex flex-col items-end gap-1.5"
    >
      {toasts.map((toast) => (
        <ToastRow key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
