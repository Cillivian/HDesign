import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Copy,
  FileUp,
  FolderOpen,
  Moon,
  Plus,
  Settings,
  Sparkles,
  Sun,
  Trash2,
} from 'lucide-react';
import {
  createEmptyProject,
  createId,
  polygonAreaSqm,
  type Project,
} from '@hdesign/domain';
import { MiniPlan } from '../app/MiniPlan';
import { createDemoProjects } from '../store/seed';
import {
  deleteProject,
  duplicateProject,
  listProjects,
  saveProject,
} from '../store/persistence';
import { ensureSeedProjects } from '../store/seed';
import { Badge, Button, Dialog, IconButton, Kbd, Spinner, TextField } from '../design-system/primitives';
import { useUiStore } from '../store/ui-store';

function BrandMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" aria-hidden="true">
      <rect x="1.5" y="1.5" width="19" height="19" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M6 5.5V16.5M6 11H16M16 5.5V16.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
      <path d="M3 3H5M17 3H19M3 19H5M17 19H19" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
}

function projectStats(project: Project) {
  const area = project.rooms.reduce((sum, room) => sum + polygonAreaSqm(room.polygon), 0);
  return { area, rooms: project.rooms.length, furniture: project.furniture.length };
}

const PROMPT_EXAMPLES = [
  '89㎡两居，奶油风，预算 15 万，有猫，客厅要投影',
  '三居改四居，日式原木，主卧大衣柜，厨房开放',
  '一居出租房，轻改造，预算 5 万，耐用好打理',
];

export function ProjectsPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [prompt, setPrompt] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState('未命名方案');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const theme = useUiStore((state) => state.theme);
  const setTheme = useUiStore((state) => state.setTheme);
  const openDialog = useUiStore((state) => state.openDialog);
  const pushToast = useUiStore((state) => state.pushToast);

  const refresh = useCallback(async () => {
    const rows = await listProjects();
    setProjects(rows);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await ensureSeedProjects();
        const rows = await listProjects();
        if (!cancelled) setProjects(rows);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const resolvedDark =
    theme === 'dark' ||
    (theme === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-color-scheme: dark)').matches);

  const demo = useMemo(() => createDemoProjects(), []);
  const heroProject = projects?.[0] ?? demo[0]!;
  const heroStats = projectStats(heroProject);

  const openProject = (project: Project) => {
    navigate(`/project/${project.id}`);
  };

  const createBlank = async (name: string) => {
    setBusy(true);
    try {
      const project = createEmptyProject(name.trim() || '未命名方案');
      await saveProject(project);
      setNewOpen(false);
      navigate(`/project/${project.id}`);
    } catch (cause) {
      pushToast('创建项目失败', 'error', cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const createSample = async () => {
    setBusy(true);
    try {
      const project = createDemoProjects()[0]!;
      project.id = createId('prj');
      project.name = `${project.name} 副本`;
      await saveProject(project);
      navigate(`/project/${project.id}`);
    } catch (cause) {
      pushToast('创建示例失败', 'error', cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const startFromPrompt = async () => {
    const text = prompt.trim();
    if (text.length < 2) {
      pushToast('先用一句话描述你的需求', 'info');
      return;
    }
    setBusy(true);
    try {
      const project = createDemoProjects()[0]!;
      project.id = createId('prj');
      project.name = text.slice(0, 26);
      project.sheets = project.sheets.map((sheet) => ({
        ...sheet,
        titleBlock: { ...sheet.titleBlock, projectName: project.name },
      }));
      await saveProject(project);
      sessionStorage.setItem('hdesign.pendingPrompt', text);
      navigate(`/project/${project.id}`);
    } catch (cause) {
      pushToast('创建项目失败', 'error', cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const openImport = async () => {
    setBusy(true);
    try {
      const project = createEmptyProject('导入图纸方案');
      await saveProject(project);
      sessionStorage.setItem('hdesign.openImport', '1');
      navigate(`/project/${project.id}`);
    } finally {
      setBusy(false);
    }
  };

  const duplicate = async (project: Project) => {
    try {
      await duplicateProject(project);
      await refresh();
      pushToast('已复制方案', 'success');
    } catch (cause) {
      pushToast('复制失败', 'error', cause instanceof Error ? cause.message : String(cause));
    }
  };

  const remove = async (project: Project) => {
    if (!window.confirm(`删除「${project.name}」？此操作不可恢复。`)) return;
    try {
      await deleteProject(project.id);
      await refresh();
      pushToast('已删除方案', 'success');
    } catch (cause) {
      pushToast('删除失败', 'error', cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <div className="hd-scroll h-full overflow-y-auto bg-app">
      <header className="sticky top-0 z-20 flex h-12 items-center gap-3 border-b border-line bg-surface/95 px-5 backdrop-blur">
        <div className="flex items-center gap-2 text-ink">
          <span className="text-accent">
            <BrandMark size={22} />
          </span>
          <span className="font-serif text-[16px] font-semibold tracking-tight">HDesign</span>
          <span className="ml-1 hidden text-[10px] text-faint sm:inline">室内设计工作台</span>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => openDialog('shortcuts')} className="hidden sm:inline-flex">
            <Kbd>?</Kbd> 快捷键
          </Button>
          <IconButton
            label={resolvedDark ? '切换浅色主题' : '切换深色主题'}
            variant="ghost"
            size="icon-sm"
            onClick={() => setTheme(resolvedDark ? 'light' : 'dark')}
          >
            {resolvedDark ? <Sun size={15} /> : <Moon size={15} />}
          </IconButton>
          <IconButton label="设置" variant="ghost" size="icon-sm" onClick={() => openDialog('settings')}>
            <Settings size={15} />
          </IconButton>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1200px] px-5 pb-20 pt-10 sm:px-8">
        <section className="grid items-center gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <p className="mb-3 inline-flex items-center gap-1.5 rounded-[2px] border border-line bg-surface px-2 py-0.5 text-[10px] text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
              图纸识别 · 一句话方案 · 2D/3D · 水电出图
            </p>
            <h1 className="max-w-[560px] font-serif text-[30px] font-semibold leading-[1.22] tracking-tight text-ink sm:text-[38px]">
              把一张图纸，
              <br />
              变成一套落得下去的方案。
            </h1>
            <p className="mt-3 max-w-[500px] text-[13px] leading-relaxed text-muted">
              导入户型图或 PDF，识别尺寸生成草图；用一句话描述预算、风格与生活习惯，得到可编辑的家具、材质、水电与施工图。
            </p>

            <form
              className="mt-6 max-w-[560px]"
              onSubmit={(event) => {
                event.preventDefault();
                void startFromPrompt();
              }}
            >
              <div className="flex items-center gap-2 rounded-[3px] border border-line bg-surface p-1.5 shadow-sm focus-within:border-accent">
                <Sparkles size={16} className="ml-1.5 shrink-0 text-accent" />
                <input
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="说说你的房子：面积、户型、风格、预算和特别需求…"
                  aria-label="一句话描述你的设计需求"
                  className="h-8 min-w-0 flex-1 bg-transparent px-1 text-[13px] text-ink placeholder:text-faint focus:outline-none"
                />
                <Button type="submit" variant="primary" size="sm" disabled={busy}>
                  {busy ? <Spinner /> : <ArrowRight size={14} />}
                  生成方案
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {PROMPT_EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => setPrompt(example)}
                    className="rounded-[2px] border border-line bg-surface px-2 py-0.5 text-[10px] text-muted hover:border-accent/40 hover:text-ink"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </form>

            <div className="mt-6 flex flex-wrap items-center gap-2">
              <Button variant="primary" size="md" onClick={() => setNewOpen(true)}>
                <Plus size={15} /> 新建项目
              </Button>
              <Button variant="outline" size="md" onClick={() => void openImport()}>
                <FileUp size={15} /> 导入图纸
              </Button>
              <Button variant="ghost" size="md" onClick={() => void createSample()} disabled={busy}>
                <FolderOpen size={15} /> 打开示例户型
              </Button>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[480px]">
            <div className="absolute -left-2 -top-2 h-3 w-3 border-l border-t border-line-strong" aria-hidden="true" />
            <div className="absolute -right-2 -top-2 h-3 w-3 border-r border-t border-line-strong" aria-hidden="true" />
            <div className="absolute -bottom-2 -left-2 h-3 w-3 border-b border-l border-line-strong" aria-hidden="true" />
            <div className="absolute -bottom-2 -right-2 h-3 w-3 border-b border-r border-line-strong" aria-hidden="true" />
            <div className="sheet-edge overflow-hidden rounded-[3px] border border-line bg-surface">
              <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
                <span className="num text-[9px] text-faint">SCALE 1:100 · UNIT mm</span>
                <span className="num text-[9px] text-faint">SAMPLE</span>
              </div>
              <MiniPlan project={heroProject} className="h-[250px] w-full sm:h-[286px]" />
              <div className="grid grid-cols-[1.4fr_1fr_1fr] border-t border-line text-[9px]">
                <div className="border-r border-line px-3 py-2">
                  <p className="text-faint">方案</p>
                  <p className="mt-0.5 truncate font-medium text-ink">{heroProject.name}</p>
                </div>
                <div className="border-r border-line px-3 py-2">
                  <p className="text-faint">套内</p>
                  <p className="num mt-0.5 font-medium text-ink">{heroStats.area.toFixed(1)} ㎡</p>
                </div>
                <div className="px-3 py-2">
                  <p className="text-faint">空间</p>
                  <p className="num mt-0.5 font-medium text-ink">{heroStats.rooms} 房间</p>
                </div>
              </div>
            </div>
            <p className="mt-2 text-center text-[9px] text-faint">
              示例项目示意 · 你的方案默认保存在当前浏览器
            </p>
          </div>
        </section>

        <section className="mt-14" aria-labelledby="projects-heading">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2 border-b border-line pb-2">
            <div>
              <h2 id="projects-heading" className="text-[15px] font-semibold text-ink">
                项目
              </h2>
              <p className="mt-0.5 text-[10px] text-faint">
                本机保存 · 自动同步 · {projects ? `${projects.length} 个方案` : '读取中'}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <Button variant="ghost" size="sm" onClick={() => void refresh()}>
                刷新
              </Button>
              <Button variant="outline" size="sm" onClick={() => setNewOpen(true)}>
                <Plus size={13} /> 新建
              </Button>
            </div>
          </div>

          {error ? (
            <div className="rounded-[3px] border border-danger/30 bg-danger-soft px-3 py-2 text-[11px] text-danger">
              无法读取本机项目：{error}
            </div>
          ) : projects === null ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((index) => (
                <div key={index} className="overflow-hidden rounded-[4px] border border-line bg-surface">
                  <div className="aspect-[4/3] animate-pulse bg-subtle" />
                  <div className="space-y-2 p-3">
                    <div className="h-3 w-2/3 animate-pulse rounded bg-subtle" />
                    <div className="h-2 w-1/2 animate-pulse rounded bg-subtle" />
                  </div>
                </div>
              ))}
            </div>
          ) : projects.length === 0 ? (
            <div className="rounded-[4px] border border-dashed border-line bg-surface px-6 py-12 text-center">
              <p className="text-[13px] font-medium text-ink">还没有项目</p>
              <p className="mt-1 text-[11px] text-muted">新建空白图纸，导入户型图，或用一句话生成第一套方案。</p>
              <div className="mt-4 flex justify-center gap-2">
                <Button variant="primary" size="sm" onClick={() => setNewOpen(true)}>
                  <Plus size={13} /> 新建项目
                </Button>
                <Button variant="outline" size="sm" onClick={() => void createSample()}>
                  打开示例
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => {
                const stats = projectStats(project);
                return (
                  <article
                    key={project.id}
                    className="group relative overflow-hidden rounded-[4px] border border-line bg-surface transition-colors hover:border-line-strong"
                  >
                    <button
                      type="button"
                      onClick={() => openProject(project)}
                      className="block w-full text-left"
                      aria-label={`打开 ${project.name}`}
                    >
                      <div className="relative aspect-[4/3] overflow-hidden border-b border-line">
                        <MiniPlan project={project} className="h-full w-full" />
                        <div className="absolute left-2 top-2 flex gap-1">
                          <Badge tone="outline" className="bg-surface/90">本机</Badge>
                          {project.aiMeta?.lastBriefId ? <Badge tone="accent">AI 方案</Badge> : null}
                        </div>
                        <span className="absolute bottom-2 right-2 rounded-[2px] bg-surface/90 px-1.5 py-0.5 text-[9px] text-muted">
                          {project.rooms.length} 房间
                        </span>
                      </div>
                      <div className="p-3">
                        <h3 className="truncate text-[13px] font-medium text-ink">{project.name}</h3>
                        <p className="num mt-0.5 text-[10px] text-muted">
                          {stats.area.toFixed(1)} ㎡ · {stats.furniture} 件家具 · {project.layers.length} 图层
                        </p>
                        <p className="mt-1 text-[9px] text-faint">更新于 {formatDate(project.updatedAt)}</p>
                      </div>
                    </button>
                    <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                      <IconButton
                        label="复制项目"
                        variant="outline"
                        size="icon-sm"
                        className="bg-surface/95"
                        onClick={() => void duplicate(project)}
                      >
                        <Copy size={13} />
                      </IconButton>
                      <IconButton
                        label="删除项目"
                        variant="outline"
                        size="icon-sm"
                        className="bg-surface/95 hover:text-danger"
                        onClick={() => void remove(project)}
                      >
                        <Trash2 size={13} />
                      </IconButton>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <footer className="mt-14 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-[10px] text-faint">
          <span>HDesign 0.1.0 · 方案参考，不构成施工依据</span>
          <span>图纸与 AI 识别结果需人工确认 · 数据仅存本机</span>
        </footer>
      </main>

      <Dialog
        open={newOpen}
        onOpenChange={setNewOpen}
        title="新建项目"
        description="先创建一张空图纸，再绘制、导入或让 AI 生成方案。"
        width="max-w-[420px]"
        footer={
          <>
            <Button variant="ghost" onClick={() => setNewOpen(false)}>
              取消
            </Button>
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => void createBlank(newName)}
            >
              {busy ? <Spinner /> : <Plus size={14} />} 创建
            </Button>
          </>
        }
      >
        <div className="space-y-3 px-4 py-4">
          <label className="flex flex-col gap-1 text-[11px] text-muted">
            项目名称
            <TextField
              autoFocus
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void createBlank(newName);
              }}
            />
          </label>
          <p className="text-[10px] leading-relaxed text-faint">
            创建后自动保存在本机浏览器；也可从示例复制一套已布置好的户型。
          </p>
        </div>
      </Dialog>
    </div>
  );
}
