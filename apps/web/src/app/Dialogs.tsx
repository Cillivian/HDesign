import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Check,
  CircleHelp,
  FileUp,
  Keyboard,
  Layers,
  Palette,
  Search,
  Settings,
  Sparkles,
  SquarePen,
  Trash2,
  Zap,
} from 'lucide-react';
import {
  Badge,
  Button,
  Callout,
  Dialog,
  IconButton,
  Kbd,
  Segmented,
  cn,
} from '../design-system/primitives';
import {
  ACCENT_PRESETS,
  type AccentId,
  type CanvasStyle,
  type ThemeMode,
} from '../design-system/theme';
import { useUiStore } from '../store/ui-store';
import { useDocStore } from '../store/doc-store';
import { flushAutosave, clearAllData } from '../store/persistence';
import { SheetsPanel } from '../panels/sheets/SheetsPanel';
import { ImportPanel } from '../panels/import/ImportPanel';

/* ------------------------------------------------------------------ */
/* Command palette                                                    */
/* ------------------------------------------------------------------ */

interface Command {
  id: string;
  label: string;
  group: string;
  hint?: string;
  keys?: string;
  keywords?: string;
  run: () => void;
}

function buildCommands(navigate: (to: string) => void): Command[] {
  const ui = () => useUiStore.getState();
  const doc = () => useDocStore.getState();
  return [
    { id: 'projects', label: '返回项目列表', group: '项目', hint: '所有方案与示例', run: () => navigate('/') },
    { id: 'view-2d', label: '切换到 2D 平面', group: '视图', run: () => ui().setView('2d') },
    { id: 'view-3d', label: '切换到 3D 场景', group: '视图', run: () => ui().setView('3d') },
    {
      id: 'fit',
      label: '适应窗口',
      group: '视图',
      hint: '缩放到全图',
      keys: 'F',
      run: () => window.dispatchEvent(new CustomEvent('hdesign:fit')),
    },
    { id: 'undo', label: '撤销', group: '编辑', keys: '⌘Z', run: () => doc().undo() },
    { id: 'redo', label: '重做', group: '编辑', keys: '⇧⌘Z', run: () => doc().redo() },
    { id: 'panel-assets', label: '素材库', group: '面板', run: () => ui().setLeftPanel('assets') },
    { id: 'panel-styles', label: '风格方案', group: '面板', run: () => ui().setLeftPanel('styles') },
    { id: 'panel-materials', label: '材质', group: '面板', run: () => ui().setLeftPanel('materials') },
    { id: 'panel-import', label: '导入图纸并识别尺寸', group: '面板', run: () => ui().setLeftPanel('import') },
    { id: 'panel-mep', label: '水电点位', group: '面板', run: () => ui().setLeftPanel('mep') },
    { id: 'panel-ai', label: 'AI 设计助手', group: '面板', keys: '⌘J', run: () => ui().setRightPanel('ai') },
    { id: 'panel-properties', label: '属性面板', group: '面板', run: () => ui().setRightPanel('properties') },
    { id: 'panel-layers', label: '图层面板', group: '面板', run: () => ui().setRightPanel('layers') },
    { id: 'panel-scene', label: '场景面板', group: '面板', run: () => ui().setRightPanel('scene') },
    { id: 'panel-sheets', label: '图纸与出图', group: '面板', run: () => ui().openDialog('sheets') },
    { id: 'theme-light', label: '主题：浅色', group: '外观', run: () => ui().setTheme('light') },
    { id: 'theme-dark', label: '主题：深色', group: '外观', run: () => ui().setTheme('dark') },
    { id: 'theme-system', label: '主题：跟随系统', group: '外观', run: () => ui().setTheme('system') },
    ...ACCENT_PRESETS.map((preset) => ({
      id: `accent-${preset.id}`,
      label: `主题色：${preset.label}`,
      group: '外观',
      keywords: `accent ${preset.id}`,
      run: () => ui().setAccent(preset.id),
    })),
    { id: 'canvas-paper', label: '画布：纸面', group: '外观', run: () => ui().setCanvasStyle('paper') },
    { id: 'canvas-blueprint', label: '画布：蓝晒', group: '外观', run: () => ui().setCanvasStyle('blueprint') },
    { id: 'shortcuts', label: '快捷键与帮助', group: '帮助', keys: '?', run: () => ui().openDialog('shortcuts') },
    { id: 'settings', label: '设置', group: '帮助', keys: '⌘,', run: () => ui().openDialog('settings') },
  ];
}

function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const commands = useMemo(() => buildCommands(navigate), [navigate]);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((command) =>
      `${command.label} ${command.group} ${command.keywords ?? ''}`.toLowerCase().includes(q),
    );
  }, [commands, query]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setActiveIndex(0);
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    const el = listRef.current?.querySelector('[data-active="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const run = (command: Command) => {
    onOpenChange(false);
    window.setTimeout(() => command.run(), 0);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="命令面板"
      description="搜索工具、面板、外观与操作，回车执行。"
      width="max-w-[560px]"
      contentClassName="overflow-hidden"
    >
      <div className="border-b border-line p-2">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-faint" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActiveIndex((index) => Math.min(index + 1, filtered.length - 1));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActiveIndex((index) => Math.max(index - 1, 0));
              } else if (event.key === 'Enter') {
                event.preventDefault();
                const command = filtered[activeIndex];
                if (command) run(command);
              }
            }}
            placeholder="输入命令，例如「图层」「3D」「深色」"
            aria-label="搜索命令"
            className="h-9 w-full rounded-[2px] border border-line bg-raised pl-8 pr-2 text-[13px] text-ink placeholder:text-faint focus-visible:border-accent focus-visible:outline-none"
          />
        </div>
      </div>
      <div ref={listRef} className="max-h-[340px] overflow-y-auto py-1">
        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-[12px] text-muted">没有匹配的命令</p>
        ) : (
          filtered.map((command, index) => {
            const showGroup = index === 0 || filtered[index - 1]?.group !== command.group;
            return (
              <div key={command.id}>
                {showGroup ? (
                  <p className="px-3 pb-1 pt-2 text-[10px] font-medium text-faint">{command.group}</p>
                ) : null}
                <button
                  type="button"
                  data-active={index === activeIndex}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => run(command)}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px]',
                    index === activeIndex ? 'bg-accent-soft text-ink' : 'text-ink hover:bg-subtle',
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{command.label}</span>
                  {command.hint ? <span className="truncate text-[10px] text-faint">{command.hint}</span> : null}
                  {command.keys ? <Kbd>{command.keys}</Kbd> : null}
                </button>
              </div>
            );
          })
        )}
      </div>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Settings                                                           */
/* ------------------------------------------------------------------ */

interface HealthState {
  status: string;
  ai: { configured: boolean; provider: string; model: string; mock: boolean };
}

function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const theme = useUiStore((state) => state.theme);
  const accent = useUiStore((state) => state.accent);
  const canvasStyle = useUiStore((state) => state.canvasStyle);
  const setTheme = useUiStore((state) => state.setTheme);
  const setAccent = useUiStore((state) => state.setAccent);
  const setCanvasStyle = useUiStore((state) => state.setCanvasStyle);
  const openDialog = useUiStore((state) => state.openDialog);
  const pushToast = useUiStore((state) => state.pushToast);
  const [health, setHealth] = useState<HealthState | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setHealth(null);
    setHealthError(null);
    fetch('/api/health')
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((data: HealthState) => {
        if (!cancelled) setHealth(data);
      })
      .catch(() => {
        if (!cancelled) setHealthError('API 服务未连接（开发模式请运行 pnpm dev）');
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const clear = async () => {
    if (!window.confirm('清空本机全部项目与素材？此操作不可恢复，建议先导出项目备份。')) return;
    setClearing(true);
    try {
      await flushAutosave();
      await clearAllData();
      localStorage.removeItem('hdesign.seeded');
      pushToast('本机数据已清空', 'success');
      onOpenChange(false);
      window.location.href = '/';
    } catch (error) {
      pushToast('清空失败', 'error', error instanceof Error ? error.message : String(error));
    } finally {
      setClearing(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="设置"
      description="外观、AI 连接与本机数据。所有项目默认只保存在当前浏览器。"
      width="max-w-[620px]"
      footer={
        <>
          <Button variant="ghost" onClick={() => openDialog('shortcuts')}>
            <Keyboard size={14} /> 快捷键
          </Button>
          <Button variant="primary" onClick={() => onOpenChange(false)}>
            完成
          </Button>
        </>
      }
    >
      <div className="divide-y divide-line">
        <section className="px-4 py-3">
          <h3 className="mb-2 text-[11px] font-semibold text-muted">外观</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] text-muted">主题</span>
              <Segmented<ThemeMode>
                ariaLabel="主题"
                value={theme}
                onChange={setTheme}
                options={[
                  { value: 'light', label: '浅色' },
                  { value: 'dark', label: '深色' },
                  { value: 'system', label: '跟随系统' },
                ]}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] text-muted">画布</span>
              <Segmented<CanvasStyle>
                ariaLabel="画布样式"
                value={canvasStyle}
                onChange={setCanvasStyle}
                options={[
                  { value: 'paper', label: '纸面' },
                  { value: 'blueprint', label: '蓝晒' },
                ]}
              />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-[11px] text-muted">主题色</span>
            <div className="flex items-center gap-1.5">
              {ACCENT_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setAccent(preset.id as AccentId)}
                  aria-label={`主题色 ${preset.label}`}
                  aria-pressed={accent === preset.id}
                  title={preset.label}
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-full border transition-transform',
                    accent === preset.id ? 'scale-110 border-ink' : 'border-line hover:scale-105',
                  )}
                  style={{ background: preset.swatch }}
                >
                  {accent === preset.id ? <Check size={12} color="#fff" /> : null}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[11px] font-semibold text-muted">AI 连接（DeepSeek · OpenAI 兼容）</h3>
            {health ? (
              <Badge tone={health.ai.configured ? 'ok' : 'neutral'}>
                {health.ai.configured ? '已连接' : health.ai.mock ? '演示模式' : '未配置'}
              </Badge>
            ) : null}
          </div>
          {healthError ? (
            <Callout tone="warning" title="API 服务不可用">
              {healthError}。CAD 编辑、风格、3D 与出图不依赖 AI，可继续使用。
            </Callout>
          ) : health ? (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-[2px] border border-line bg-raised px-2 py-1.5">
                  <span className="text-faint">端点</span>
                  <p className="num mt-0.5 text-ink">{health.ai.provider}</p>
                </div>
                <div className="rounded-[2px] border border-line bg-raised px-2 py-1.5">
                  <span className="text-faint">模型</span>
                  <p className="num mt-0.5 text-ink">{health.ai.model}</p>
                </div>
              </div>
              <p className="text-[11px] leading-relaxed text-muted">
                在仓库根目录的 <code className="num rounded bg-subtle px-1">.env</code> 中设置{' '}
                <code className="num rounded bg-subtle px-1">AI_API_KEY</code>（可另设{' '}
                <code className="num rounded bg-subtle px-1">AI_BASE_URL</code>、{' '}
                <code className="num rounded bg-subtle px-1">AI_MODEL</code>），重启后生效。
              </p>
            </div>
          ) : (
            <p className="text-[11px] text-faint">正在检查连接…</p>
          )}
        </section>

        <section className="px-4 py-3">
          <h3 className="mb-1 text-[11px] font-semibold text-muted">本机数据</h3>
          <p className="mb-2 text-[11px] leading-relaxed text-muted">
            项目、底图与对话保存在浏览器 IndexedDB，不上传服务器。清理站点数据会一并丢失，请定期导出备份。
          </p>
          <Button variant="outline" size="sm" onClick={() => void clear()} disabled={clearing}>
            <Trash2 size={14} /> 清空本机全部数据
          </Button>
        </section>

        <section className="px-4 py-3 text-[11px] leading-relaxed text-faint">
          HDesign 0.1.0 · 识别与 AI 生成结果为方案参考，需人工确认，不构成施工依据。
        </section>
      </div>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Shortcuts                                                          */
/* ------------------------------------------------------------------ */

const SHORTCUT_GROUPS: Array<{ title: string; rows: Array<[string, string]> }> = [
  {
    title: '编辑',
    rows: [
      ['V / H', '选择 / 平移'],
      ['W / R', '画墙 / 房间'],
      ['D / Shift+D', '门 / 窗'],
      ['M / T', '测量 / 文字'],
      ['C', '两点比例校准'],
      ['⌘Z / ⇧⌘Z', '撤销 / 重做'],
      ['⌘D / Delete', '创建副本 / 删除'],
      ['方向键', '微调 10mm（Shift 100mm）'],
    ],
  },
  {
    title: '视图与面板',
    rows: [
      ['⌘K', '命令面板'],
      ['⌘J', 'AI 设计助手'],
      ['Tab', '2D / 3D 切换'],
      ['F', '适应窗口'],
      ['空格 + 拖动', '临时平移'],
      ['[ / ]', '收起左 / 右栏'],
      ['⌘,', '设置'],
      ['?', '快捷键帮助'],
    ],
  },
  {
    title: 'AI 与文件',
    rows: [
      ['⌘S', '立即保存到本机'],
      ['1 / 2 / 3', '3D 视角预设（顶视 / 鸟瞰 / 四角）'],
      ['G', '显示 / 隐藏网格'],
    ],
  },
];

function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="快捷键"
      description="画布获得焦点后生效；输入框内不会触发单键快捷键。"
      width="max-w-[660px]"
      footer={
        <Button variant="primary" onClick={() => onOpenChange(false)}>
          知道了
        </Button>
      }
    >
      <div className="grid gap-4 px-4 py-3 sm:grid-cols-3">
        {SHORTCUT_GROUPS.map((group) => (
          <section key={group.title}>
            <h3 className="mb-1.5 text-[11px] font-semibold text-muted">{group.title}</h3>
            <dl className="space-y-1">
              {group.rows.map(([keys, label]) => (
                <div key={keys} className="flex items-start justify-between gap-2">
                  <dt className="text-[11px] leading-relaxed text-muted">{label}</dt>
                  <dd className="shrink-0">
                    <Kbd>{keys}</Kbd>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Sheets / import dialogs                                            */
/* ------------------------------------------------------------------ */

function SheetsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="出图与图纸"
      description="生成平面布置、地面、天花、水位、电位与物料清单，并导出 PNG / PDF / SVG。"
      width="max-w-[1180px]"
      footer={
        <Button variant="primary" onClick={() => onOpenChange(false)}>
          关闭
        </Button>
      }
    >
      <div className="h-[72vh] min-h-[420px]">
        <SheetsPanel />
      </div>
    </Dialog>
  );
}

function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="导入图纸"
      description="支持 PNG / JPG / WebP / PDF；识别后需人工校对与校准比例。"
      width="max-w-[720px]"
    >
      <div className="min-h-[280px]">
        <ImportPanel />
      </div>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Global switch                                                      */
/* ------------------------------------------------------------------ */

export function GlobalDialogs() {
  const activeDialog = useUiStore((state) => state.activeDialog);
  const closeDialog = useUiStore((state) => state.closeDialog);
  const openDialog = useUiStore((state) => state.openDialog);

  const open = (id: typeof activeDialog) => activeDialog === id;
  const onChange = (id: NonNullable<typeof activeDialog>) => (next: boolean) => {
    if (next) openDialog(id);
    else closeDialog();
  };

  return (
    <>
      <CommandPalette open={open('command')} onOpenChange={onChange('command')} />
      <SettingsDialog open={open('settings')} onOpenChange={onChange('settings')} />
      <ShortcutsDialog open={open('shortcuts')} onOpenChange={onChange('shortcuts')} />
      <SheetsDialog open={open('sheets')} onOpenChange={onChange('sheets')} />
      <ImportDialog open={open('import')} onOpenChange={onChange('import')} />
    </>
  );
}

/* Small helper used by panels to open the AI assistant consistently. */
export function openAiAssistant() {
  useUiStore.getState().setRightPanel('ai');
}

export const DIALOG_ICONS = { Files: FileUp, Layers, Palette, Sparkles, Zap, Help: CircleHelp, Settings } as const;
export type DialogIcon = keyof typeof DIALOG_ICONS;
export function DialogGlyph({ icon }: { icon: DialogIcon }) {
  const Icon = DIALOG_ICONS[icon];
  return <Icon size={14} />;
}
export { IconButton as DialogCloseButton, SquarePen as ComposeIcon };
