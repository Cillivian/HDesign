import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileUp,
  Moon,
  PanelLeftClose,
  PanelRightClose,
  Redo2,
  Search,
  Settings,
  Sparkles,
  Sun,
  Undo2,
} from 'lucide-react';
import { useDocStore } from '../store/doc-store';
import { useUiStore } from '../store/ui-store';
import { useProjectStats } from '../store/selectors';
import { Button, IconButton, Kbd, Segmented, Tip, cn } from '../design-system/primitives';
import { flushAutosave } from '../store/persistence';

function BrandMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <rect x="1.5" y="1.5" width="19" height="19" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M6 5.5V16.5M6 11H16M16 5.5V16.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
      <path d="M3 3H5M17 3H19M3 19H5M17 19H19" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

export function TopBar() {
  const navigate = useNavigate();
  const doc = useDocStore((state) => state.doc);
  const dirty = useDocStore((state) => state.dirty);
  const pastLength = useDocStore((state) => state.past.length);
  const futureLength = useDocStore((state) => state.future.length);
  const updateProjectName = useDocStore((state) => state.updateProjectName);
  const undo = useDocStore((state) => state.undo);
  const redo = useDocStore((state) => state.redo);
  const stats = useProjectStats();

  const view = useUiStore((state) => state.view);
  const setView = useUiStore((state) => state.setView);
  const theme = useUiStore((state) => state.theme);
  const setTheme = useUiStore((state) => state.setTheme);
  const openDialog = useUiStore((state) => state.openDialog);
  const setLeftPanel = useUiStore((state) => state.setLeftPanel);
  const setRightPanel = useUiStore((state) => state.setRightPanel);
  const viewport = useUiStore((state) => state.viewport);
  const leftCollapsed = useUiStore((state) => state.leftCollapsed);
  const rightCollapsed = useUiStore((state) => state.rightCollapsed);
  const toggleLeft = useUiStore((state) => state.toggleLeftCollapsed);
  const toggleRight = useUiStore((state) => state.toggleRightCollapsed);

  const [name, setName] = useState(doc.name);
  const nameFocused = useRef(false);
  useEffect(() => {
    if (!nameFocused.current) setName(doc.name);
  }, [doc.name]);

  const resolvedDark =
    theme === 'dark' ||
    (theme === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-color-scheme: dark)').matches);

  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-surface px-2.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-ink"
          aria-label="返回项目列表"
          title="项目列表"
        >
          <span className="text-accent">
            <BrandMark />
          </span>
          <span className="font-serif text-[15px] font-semibold tracking-tight">HDesign</span>
        </button>
        <span className="h-4 w-px bg-line" aria-hidden="true" />
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onFocus={() => {
            nameFocused.current = true;
          }}
          onBlur={() => {
            nameFocused.current = false;
            const next = name.trim();
            if (next && next !== doc.name) updateProjectName(next);
            else setName(doc.name);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
          aria-label="项目名称"
          className="hidden w-[150px] rounded-[2px] border border-transparent bg-transparent px-1.5 py-1 text-[13px] font-medium text-ink hover:border-line focus-visible:border-accent focus-visible:outline-none md:block lg:w-[190px]"
        />
        <span
          aria-hidden="true"
          title={dirty ? '有未保存改动' : '已自动保存'}
          className={cn('h-1.5 w-1.5 rounded-full', dirty ? 'bg-accent' : 'bg-ok/70')}
        />
      </div>

      <div className="flex min-w-0 flex-1 items-center justify-center gap-3">
        <Segmented
          ariaLabel="视图模式"
          value={view}
          onChange={(next) => setView(next)}
          options={[
            {
              value: '2d',
              label: (
                <>
                  <span className="hidden sm:inline">2D 平面</span>
                  <span className="sm:hidden">2D</span>
                </>
              ),
            },
            {
              value: '3d',
              label: (
                <>
                  <span className="hidden sm:inline">3D 场景</span>
                  <span className="sm:hidden">3D</span>
                </>
              ),
            },
          ]}
        />
        <span className="num hidden items-center gap-1 text-[10px] text-faint xl:flex">
          <span>{Math.round(viewport.scale * 100)}%</span>
          <span className="text-line-strong">·</span>
          <span>1:100</span>
          <span className="text-line-strong">·</span>
          <span>
            {stats.areaSqm > 0 ? `${stats.areaSqm.toFixed(1)} ㎡` : '未测量'} / {stats.roomCount} 房间
          </span>
        </span>
      </div>

      <div className="flex items-center gap-1">
        <div className="hidden items-center gap-0.5 lg:flex">
          <Tip label={<>撤销 <Kbd>⌘Z</Kbd></>}>
            <IconButton label="撤销" variant="ghost" size="icon-sm" disabled={pastLength === 0} onClick={undo}>
              <Undo2 size={15} />
            </IconButton>
          </Tip>
          <Tip label={<>重做 <Kbd>⇧⌘Z</Kbd></>}>
            <IconButton label="重做" variant="ghost" size="icon-sm" disabled={futureLength === 0} onClick={redo}>
              <Redo2 size={15} />
            </IconButton>
          </Tip>
        </div>
        <span className="mx-1 hidden h-4 w-px bg-line sm:block" aria-hidden="true" />

        <Button variant="ghost" size="sm" onClick={() => openDialog('command')} className="hidden xl:inline-flex">
          <Search size={14} />
          搜索命令
          <Kbd>⌘K</Kbd>
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setLeftPanel('import')}>
          <FileUp size={14} />
          <span className="hidden lg:inline">导入图纸</span>
        </Button>
        <Button
          variant="soft"
          size="sm"
          onClick={() => {
            setRightPanel('ai');
          }}
        >
          <Sparkles size={14} />
          <span className="hidden lg:inline">AI 设计</span>
        </Button>
        <Button variant="primary" size="sm" onClick={() => openDialog('sheets')}>
          <Download size={14} />
          出图
        </Button>
        <span className="mx-0.5 h-4 w-px bg-line" aria-hidden="true" />
        <Tip label={resolvedDark ? '切换到浅色' : '切换到深色'}>
          <IconButton
            label="切换主题"
            variant="ghost"
            size="icon-sm"
            onClick={() => setTheme(resolvedDark ? 'light' : 'dark')}
          >
            {resolvedDark ? <Sun size={15} /> : <Moon size={15} />}
          </IconButton>
        </Tip>
        <Tip label="设置">
          <IconButton label="设置" variant="ghost" size="icon-sm" onClick={() => openDialog('settings')}>
            <Settings size={15} />
          </IconButton>
        </Tip>
        <span className="mx-0.5 hidden h-4 w-px bg-line xl:block" aria-hidden="true" />
        <div className="hidden items-center gap-0.5 md:flex">
          <Tip label={leftCollapsed ? '展开左栏' : '收起左栏'}>
            <IconButton label="切换左栏" variant="ghost" size="icon-sm" onClick={toggleLeft}>
              {leftCollapsed ? <ChevronRight size={15} /> : <PanelLeftClose size={15} />}
            </IconButton>
          </Tip>
          <Tip label={rightCollapsed ? '展开右栏' : '收起右栏'}>
            <IconButton label="切换右栏" variant="ghost" size="icon-sm" onClick={toggleRight}>
              {rightCollapsed ? <ChevronLeft size={15} /> : <PanelRightClose size={15} />}
            </IconButton>
          </Tip>
        </div>
      </div>
    </header>
  );
}

export function applyThemeNow() {
  const { theme, accent, canvasStyle } = useUiStore.getState();
  const root = document.documentElement;
  const dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  root.dataset.theme = dark ? 'dark' : 'light';
  root.dataset.accent = accent;
  root.dataset.canvas = canvasStyle;
}

export async function saveNow() {
  await flushAutosave();
}
