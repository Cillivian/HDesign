import Dexie, { type Table } from 'dexie';
import { normalizeProject, type Project } from '@hdesign/domain';
import { useDocStore } from './doc-store';

export interface AssetRecord {
  id: string;
  mime: string;
  size: number;
  blob: Blob;
  createdAt: string;
}

export interface ThumbnailRecord {
  projectId: string;
  dataUrl: string;
  updatedAt: string;
}

export interface AiChatRecord {
  id?: number;
  projectId: string;
  messages: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface CustomStyleRecord {
  id: string;
  name: string;
  tokens: Record<string, string>;
  materials: string[];
  createdAt: string;
}

class HDesignDatabase extends Dexie {
  projects!: Table<Project, string>;
  assets!: Table<AssetRecord, string>;
  thumbnails!: Table<ThumbnailRecord, string>;
  aiChats!: Table<AiChatRecord, number>;
  customStyles!: Table<CustomStyleRecord, string>;

  constructor() {
    super('hdesign');
    this.version(1).stores({
      projects: 'id, updatedAt, name',
      assets: 'id, createdAt',
      thumbnails: 'projectId, updatedAt',
      aiChats: '++id, projectId, updatedAt',
      customStyles: 'id, name, createdAt',
    });
  }
}

export const db = new HDesignDatabase();

/* ------------------------------------------------------------------ */
/* Projects                                                           */
/* ------------------------------------------------------------------ */

export async function listProjects(): Promise<Project[]> {
  const rows = await db.projects.toArray();
  return rows.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export async function getProject(id: string): Promise<Project | null> {
  const row = await db.projects.get(id);
  if (!row) return null;
  try {
    return normalizeProject(row).project;
  } catch (error) {
    console.error('Unable to read project', id, error);
    return null;
  }
}

export async function saveProject(project: Project): Promise<void> {
  await db.projects.put(project);
}

export async function deleteProject(id: string): Promise<void> {
  await db.transaction('rw', db.projects, db.thumbnails, db.aiChats, async () => {
    await db.projects.delete(id);
    await db.thumbnails.delete(id);
    await db.aiChats.where('projectId').equals(id).delete();
  });
}

export async function duplicateProject(project: Project, name?: string): Promise<Project> {
  const now = new Date().toISOString();
  const copy: Project = {
    ...structuredClone(project),
    id: `prj_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: name ?? `${project.name} 副本`,
    createdAt: now,
    updatedAt: now,
  };
  await saveProject(copy);
  return copy;
}

export async function setThumbnail(projectId: string, dataUrl: string): Promise<void> {
  await db.thumbnails.put({ projectId, dataUrl, updatedAt: new Date().toISOString() });
}

export async function getThumbnail(projectId: string): Promise<string | undefined> {
  const row = await db.thumbnails.get(projectId);
  return row?.dataUrl;
}

/* ------------------------------------------------------------------ */
/* Assets                                                             */
/* ------------------------------------------------------------------ */

const urlCache = new Map<string, string>();

export async function putAsset(id: string, blob: Blob, mime?: string): Promise<void> {
  await db.assets.put({
    id,
    mime: mime ?? (blob.type || 'application/octet-stream'),
    size: blob.size,
    blob,
    createdAt: new Date().toISOString(),
  });
}

export async function getAsset(id: string): Promise<AssetRecord | undefined> {
  return db.assets.get(id);
}

export async function getAssetUrl(id: string): Promise<string | null> {
  const cached = urlCache.get(id);
  if (cached) return cached;
  const record = await db.assets.get(id);
  if (!record) return null;
  const url = URL.createObjectURL(record.blob);
  urlCache.set(id, url);
  return url;
}

export async function deleteAsset(id: string): Promise<void> {
  const url = urlCache.get(id);
  if (url) URL.revokeObjectURL(url);
  urlCache.delete(id);
  await db.assets.delete(id);
}

/* ------------------------------------------------------------------ */
/* Custom styles & AI chats                                           */
/* ------------------------------------------------------------------ */

export async function listCustomStyles(): Promise<CustomStyleRecord[]> {
  return db.customStyles.toArray();
}

export async function saveCustomStyle(style: CustomStyleRecord): Promise<void> {
  await db.customStyles.put(style);
}

export async function deleteCustomStyle(id: string): Promise<void> {
  await db.customStyles.delete(id);
}

export async function listAiChats(projectId: string): Promise<AiChatRecord[]> {
  return db.aiChats.where('projectId').equals(projectId).toArray();
}

/* ------------------------------------------------------------------ */
/* Autosave                                                           */
/* ------------------------------------------------------------------ */

const AUTOSAVE_DELAY = 800;
let timer: ReturnType<typeof setTimeout> | null = null;
let saving: Promise<void> | null = null;

async function persistCurrent(): Promise<void> {
  const state = useDocStore.getState();
  if (!state.loaded) return;
  const snapshot = state.doc;
  saving = saveProject(snapshot).then(() => {
    const latest = useDocStore.getState();
    if (latest.doc === snapshot) latest.setDirty(false);
  });
  await saving;
}

export function scheduleAutosave(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void persistCurrent().catch((error) => {
      console.error('Autosave failed', error);
      useDocStore.getState().setDirty(true);
    });
  }, AUTOSAVE_DELAY);
}

export function startAutosave(): () => void {
  const unsubscribe = useDocStore.subscribe((state, previous) => {
    if (!state.loaded || !state.dirty) return;
    if (state.doc === previous.doc) return;
    scheduleAutosave();
  });
  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    void persistCurrent().catch((error) => console.error('Flush failed', error));
  };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', flush);
  return () => {
    unsubscribe();
    window.removeEventListener('pagehide', flush);
    document.removeEventListener('visibilitychange', flush);
    flush();
  };
}

export async function flushAutosave(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (saving) await saving;
  await persistCurrent();
}

export async function clearAllData(): Promise<void> {
  await db.transaction('rw', db.projects, db.assets, db.thumbnails, db.aiChats, db.customStyles, async () => {
    await Promise.all([
      db.projects.clear(),
      db.assets.clear(),
      db.thumbnails.clear(),
      db.aiChats.clear(),
      db.customStyles.clear(),
    ]);
  });
  for (const url of urlCache.values()) URL.revokeObjectURL(url);
  urlCache.clear();
}

/* ------------------------------------------------------------------ */
/* Import / export additions (workstream E)                           */
/* ------------------------------------------------------------------ */

/** All saved thumbnails keyed by project id, for the project list. */
export async function listProjectThumbnails(): Promise<Map<string, string>> {
  const rows = await db.thumbnails.toArray();
  return new Map(rows.map((row) => [row.projectId, row.dataUrl]));
}

/** Removes a thumbnail (e.g. after the project geometry becomes empty). */
export async function clearThumbnail(projectId: string): Promise<void> {
  await db.thumbnails.delete(projectId);
}

/** Stores an asset from raw bytes (used by `.hdz` import). */
export async function putAssetBytes(id: string, mime: string, bytes: Uint8Array): Promise<void> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], { type: mime || 'application/octet-stream' });
  await putAsset(id, blob, mime);
}

/** Reads an asset as raw bytes (used by `.hdz` export). */
export async function getAssetBytes(
  id: string,
): Promise<{ id: string; mime: string; bytes: Uint8Array; size: number } | null> {
  const record = await db.assets.get(id);
  if (!record) return null;
  const buffer = await record.blob.arrayBuffer();
  return { id: record.id, mime: record.mime, bytes: new Uint8Array(buffer), size: record.size };
}

/** Checks whether an asset exists without loading its blob. */
export async function hasAsset(id: string): Promise<boolean> {
  const count = await db.assets.where('id').equals(id).count();
  return count > 0;
}

/** Every asset id currently stored on this device. */
export async function listAssetIds(): Promise<string[]> {
  return db.assets.toCollection().primaryKeys();
}
