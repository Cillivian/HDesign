import { getFurnitureSymbol, getMepSymbol, type SymbolDef } from '@hdesign/symbols';
import { cn } from '../../design-system/primitives';

/**
 * Renders a shared plan symbol (pure SVG path data from @hdesign/symbols) inside
 * a thumbnail. The same definitions feed the 2D canvas and drawing sheets.
 */
export function SymbolPaths({ def, className }: { def: SymbolDef; className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${def.viewBox.w} ${def.viewBox.d}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      className={cn('h-full w-full', className)}
    >
      {def.paths.map((path, index) => (
        <path
          key={`${def.key}-${index}`}
          d={path.d}
          fill={path.fill === 'currentColor' ? 'currentColor' : (path.fill ?? 'none')}
          stroke={path.stroke === 'currentColor' ? 'currentColor' : (path.stroke ?? 'none')}
          strokeWidth={path.strokeWidth ?? 1.2}
          strokeDasharray={path.strokeDasharray}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={path.opacity ?? 1}
        />
      ))}
    </svg>
  );
}

export function FurnitureSymbolPreview({
  symbolKey,
  className,
}: {
  symbolKey: string;
  className?: string;
}) {
  return (
    <span className={cn('block text-muted', className)}>
      <SymbolPaths def={getFurnitureSymbol(symbolKey)} />
    </span>
  );
}

export function MepSymbolPreview({ kind, className }: { kind: string; className?: string }) {
  return (
    <span className={cn('block', className)}>
      <SymbolPaths def={getMepSymbol(kind)} />
    </span>
  );
}
