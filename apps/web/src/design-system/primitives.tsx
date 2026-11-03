import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

export function cn(...inputs: Array<string | false | null | undefined>): string {
  return twMerge(clsx(inputs));
}

/* ------------------------------------------------------------------ */
/* Button                                                             */
/* ------------------------------------------------------------------ */

type ButtonVariant = 'primary' | 'accent' | 'outline' | 'ghost' | 'soft' | 'danger';
type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm';

const variantClass: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-surface hover:bg-ink/85 border border-transparent',
  accent: 'bg-accent text-on-accent hover:bg-accent-hover border border-transparent',
  outline: 'bg-surface text-ink border border-line hover:bg-subtle',
  ghost: 'bg-transparent text-muted border border-transparent hover:bg-subtle hover:text-ink',
  soft: 'bg-accent-soft text-accent border border-transparent hover:bg-accent-soft/75',
  danger: 'bg-danger text-white border border-transparent hover:opacity-90',
};

const sizeClass: Record<ButtonSize, string> = {
  xs: 'h-6 px-2 text-[11px] gap-1 rounded-[2px]',
  sm: 'h-7 px-2.5 text-xs gap-1.5 rounded-[2px]',
  md: 'h-8 px-3 text-[13px] gap-1.5 rounded-[2px]',
  lg: 'h-9 px-4 text-sm gap-2 rounded-[3px]',
  icon: 'h-8 w-8 justify-center rounded-[2px]',
  'icon-sm': 'h-7 w-7 justify-center rounded-[2px]',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  active?: boolean;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'outline', size = 'sm', active, block, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center whitespace-nowrap font-medium transition-colors select-none',
        'disabled:pointer-events-none disabled:opacity-40',
        variantClass[variant],
        sizeClass[size],
        active && 'bg-accent-soft text-accent border-accent/40',
        block && 'w-full',
        className,
      )}
      {...props}
    />
  );
});

export interface IconButtonProps extends Omit<ButtonProps, 'children' | 'aria-label'> {
  label: string;
  children: ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, className, size = 'icon', ...props },
  ref,
) {
  return <Button ref={ref} aria-label={label} title={label} size={size} className={className} {...props} />;
});

/* ------------------------------------------------------------------ */
/* Tooltip                                                            */
/* ------------------------------------------------------------------ */

export function Tip({
  label,
  side = 'bottom',
  children,
}: {
  label: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  children: ReactNode;
}) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content side={side} sideOffset={6} className="hd-tooltip z-[80]">
          {label}
          <TooltipPrimitive.Arrow className="fill-[var(--border-default)]" width={8} height={4} />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

/* ------------------------------------------------------------------ */
/* Layout primitives                                                  */
/* ------------------------------------------------------------------ */

export function Section({
  title,
  subtitle,
  actions,
  dense,
  children,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  dense?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn(dense ? 'px-3 py-2' : 'px-3 py-3', className)}>
      <header className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[11px] font-semibold tracking-[0.02em] text-muted">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-[11px] leading-snug text-faint">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}

export function Field({
  label,
  hint,
  children,
  className,
  htmlFor,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={htmlFor} className="flex items-center justify-between text-[11px] text-muted">
        <span>{label}</span>
        {hint ? <span className="num text-[10px] text-faint">{hint}</span> : null}
      </label>
      {children}
    </div>
  );
}

export const inputClass =
  'h-7 w-full rounded-[2px] border border-line bg-surface px-2 text-xs text-ink placeholder:text-faint focus-visible:border-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/40';

export function TextField(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputClass, props.className)} />;
}

export function NumberField(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      inputMode="decimal"
      {...props}
      className={cn(inputClass, 'num text-right', props.className)}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Badge / Kbd / callouts                                             */
/* ------------------------------------------------------------------ */

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'water' | 'electric' | 'ok' | 'danger' | 'outline';
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: 'bg-subtle text-muted',
    accent: 'bg-accent-soft text-accent',
    water: 'bg-water-soft text-water',
    electric: 'bg-electric-soft text-electric',
    ok: 'bg-ok-soft text-ok',
    danger: 'bg-danger-soft text-danger',
    outline: 'border border-line text-muted',
  };
  return (
    <span
      className={cn(
        'inline-flex h-[18px] items-center rounded-[2px] px-1.5 text-[10px] font-medium leading-none',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="hd-kbd">{children}</kbd>;
}

export function Callout({
  tone = 'neutral',
  title,
  children,
  action,
}: {
  tone?: 'neutral' | 'warning' | 'danger' | 'ok' | 'accent';
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const tones = {
    neutral: 'border-line bg-raised text-muted',
    warning: 'border-electric/30 bg-electric-soft text-electric',
    danger: 'border-danger/30 bg-danger-soft text-danger',
    ok: 'border-ok/30 bg-ok-soft text-ok',
    accent: 'border-accent/30 bg-accent-soft text-accent',
  } as const;
  return (
    <div className={cn('flex items-start gap-2 rounded-[3px] border px-2.5 py-2 text-[11px]', tones[tone])}>
      <div className="min-w-0 flex-1">
        {title ? <p className="font-medium text-ink">{title}</p> : null}
        {children ? <div className={cn(title ? 'mt-0.5' : false, 'leading-relaxed')}>{children}</div> : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-10 text-center', className)}>
      {icon ? <div className="mb-3 text-faint">{icon}</div> : null}
      <p className="text-[13px] font-medium text-ink">{title}</p>
      {description ? <p className="mt-1 max-w-[260px] text-[11px] leading-relaxed text-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="加载中"
      className={cn(
        'inline-block h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-current border-r-transparent opacity-70',
        className,
      )}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Dialog                                                             */
/* ------------------------------------------------------------------ */

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  width = 'max-w-lg',
  contentClassName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  width?: string;
  contentClassName?: string;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-[rgba(12,15,13,0.42)] backdrop-blur-[1px]" />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-[61] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 rounded-[4px] border border-line bg-surface shadow-[var(--shadow-pop)] focus:outline-none',
            width,
            contentClassName,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line px-4 py-3">
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
              <IconButton label="关闭" size="icon-sm" variant="ghost" className="-mr-1 -mt-0.5">
                <X size={15} />
              </IconButton>
            </DialogPrimitive.Close>
          </div>
          <div className="hd-scroll max-h-[min(72vh,680px)] overflow-y-auto">{children}</div>
          {footer ? (
            <div className="flex items-center justify-end gap-2 border-t border-line bg-raised px-4 py-2.5">
              {footer}
            </div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/* ------------------------------------------------------------------ */
/* Segmented control                                                  */
/* ------------------------------------------------------------------ */

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  size = 'sm',
  className,
}: {
  value: T;
  options: Array<{ value: T; label: ReactNode; title?: string }>;
  onChange: (value: T) => void;
  ariaLabel: string;
  size?: 'xs' | 'sm';
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('inline-flex rounded-[2px] border border-line bg-subtle p-[2px]', className)}
    >
      {options.map((option) => (
        <button
          key={option.value}
          role="tab"
          type="button"
          title={option.title}
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'inline-flex items-center justify-center gap-1 rounded-[1px] font-medium transition-colors',
            size === 'xs' ? 'h-5 px-1.5 text-[10px]' : 'h-6 px-2 text-[11px]',
            value === option.value
              ? 'bg-surface text-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
              : 'text-muted hover:text-ink',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Separator({ className }: { className?: string }) {
  return <div role="separator" className={cn('h-px w-full bg-line', className)} />;
}
