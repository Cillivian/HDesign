import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Row {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

const state = vi.hoisted(() => ({
  rows: [] as Row[],
  puts: [] as unknown[],
  bulkPuts: [] as unknown[],
}));

vi.mock('./persistence', () => ({
  db: {
    projects: {
      count: async () => state.rows.length,
      toArray: async () => state.rows.map((row) => ({ ...row })),
      put: async (project: unknown) => {
        state.puts.push(project);
      },
      bulkPut: async (projects: unknown[]) => {
        state.bulkPuts.push(projects);
      },
    },
  },
}));

/** Re-import so the module-level `seedPromise` cache is fresh per test. */
async function loadSeed() {
  vi.resetModules();
  return import('./seed');
}

function legacyRow(name: string, index: number): Row {
  const stamp = new Date(Date.UTC(2024, 0, 1 + index)).toISOString();
  return { id: `prj_legacy_${index}`, name, createdAt: stamp, updatedAt: stamp };
}

const CLASSIC = ['两室两厅 · 样板 A', '一居开间 · 样板 B', '三居 · 样板 C'];

describe('seed version migration', () => {
  beforeEach(() => {
    state.rows = [];
    state.puts = [];
    state.bulkPuts = [];
    localStorage.clear();
  });

  it('seeds all four samples on a fresh install', async () => {
    const { ensureSeedProjects } = await loadSeed();
    await expect(ensureSeedProjects()).resolves.toBe(4);
    expect(state.bulkPuts).toHaveLength(1);
    expect((state.bulkPuts[0] as Row[]).map((row) => row.name)).toEqual([
      ...CLASSIC,
      '复式跃层 · 样板 D',
    ]);
    expect(localStorage.getItem('hdesign.seeded')).toBe('1');
    expect(localStorage.getItem('hdesign.seedVersion')).toBe('2');
  });

  it('adds only the duplex sample to an existing v1 install', async () => {
    state.rows = CLASSIC.map(legacyRow);
    localStorage.setItem('hdesign.seeded', '1');
    const { ensureSeedProjects } = await loadSeed();

    await expect(ensureSeedProjects()).resolves.toBe(1);
    // Existing projects are never overwritten.
    expect(state.bulkPuts).toHaveLength(0);
    expect(state.puts).toHaveLength(1);
    expect((state.puts[0] as Row).name).toBe('复式跃层 · 样板 D');
    expect(localStorage.getItem('hdesign.seedVersion')).toBe('2');
    // The new sample is stamped older than the existing ones so the gallery
    // order (and the classic first card) stays stable.
    expect((state.puts[0] as Row).updatedAt < state.rows[0]!.updatedAt).toBe(true);
  });

  it('is a no-op once the install is already at the current version', async () => {
    state.rows = CLASSIC.map(legacyRow);
    localStorage.setItem('hdesign.seeded', '1');
    localStorage.setItem('hdesign.seedVersion', '2');
    const { ensureSeedProjects } = await loadSeed();

    await expect(ensureSeedProjects()).resolves.toBe(0);
    expect(state.puts).toHaveLength(0);
    expect(state.bulkPuts).toHaveLength(0);
  });

  it('does not duplicate the duplex sample if one already exists', async () => {
    state.rows = [...CLASSIC.map(legacyRow), legacyRow('复式跃层 · 样板 D', 3)];
    localStorage.setItem('hdesign.seeded', '1');
    const { ensureSeedProjects } = await loadSeed();

    await expect(ensureSeedProjects()).resolves.toBe(0);
    expect(state.puts).toHaveLength(0);
    expect(localStorage.getItem('hdesign.seedVersion')).toBe('2');
  });

  it('re-seeds everything after local data is cleared', async () => {
    // The settings "clear data" action removes only the legacy flag; the
    // version key may linger, so the flag must remain the source of truth.
    localStorage.setItem('hdesign.seedVersion', '2');
    const { ensureSeedProjects } = await loadSeed();

    await expect(ensureSeedProjects()).resolves.toBe(4);
    expect((state.bulkPuts[0] as Row[]).map((row) => row.name)).toContain('复式跃层 · 样板 D');
  });

  it('leaves a library with the user’s own projects untouched on upgrade', async () => {
    state.rows = [legacyRow('我自己的方案', 0)];
    localStorage.setItem('hdesign.seeded', '1');
    const { ensureSeedProjects } = await loadSeed();

    await expect(ensureSeedProjects()).resolves.toBe(1);
    expect(state.puts).toHaveLength(1);
    expect(state.bulkPuts).toHaveLength(0);
    expect(state.rows[0]!.name).toBe('我自己的方案');
  });
});
