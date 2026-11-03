import type { ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn, IconButton } from './primitives';

/**
 * Mobile bottom sheet built on the Radix dialog primitive (focus trap, Escape,
 * aria wiring). Slides up from the bottom edge and never grows past the
 * viewport; used for menus ("更多"), tool palettes and secondary panels on
 * phone-sized screens.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  bodyClassName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-[rgba(12,15,13,0.38)] backdrop-blur-[1px]" />
        <DialogPrimitive.Content
          className={cn(
            'fixed inset-x-0 bottom-0 z-[61] flex max-h-[84dvh] flex-col rounded-t-[10px] border border-line border-b-0 bg-surface shadow-[var(--shadow-pop)] focus:outline-none',
            'pb-[var(--safe-bottom)]',
            className,
          )}
        >
          <div className="flex shrink-0 flex-col items-center pt-2">
            <span className="h-1 w-9 rounded-full bg-line-strong" aria-hidden="true" />
          </div>
          <div className="flex shrink-0 items-start justify-between gap-4 px-4 pb-2 pt-2">
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-[14px] font-semibold text-ink">
                {title}
              </DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-0.5 text-[11px] leading-relaxed text-muted">
                  {description}
                </DialogPrimitive.Description>
              ) : null}
            </div>
            <DialogPrimitive.Close asChild>
              <IconButton label="关闭" size="icon" variant="ghost" className="-mr-1 -mt-1">
                <X size={16} />
              </IconButton>
            </DialogPrimitive.Close>
          </div>
          <div className={cn('hd-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4', bodyClassName)}>
            {children}
          </div>
          {footer ? (
            <div className="shrink-0 border-t border-line bg-raised px-4 py-2.5">{footer}</div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
