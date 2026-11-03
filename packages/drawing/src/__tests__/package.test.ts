import { describe, expect, it } from 'vitest';
import {
  HDZ_MAX_BYTES,
  HdzError,
  createHdzDocument,
  decodeBase64,
  encodeBase64,
  hdzFileName,
  parseHdzDocument,
  utf8Length,
} from '../index';
import { fixtureProject } from './fixtures';

describe('.hdz package format', () => {
  it('round-trips project data and embedded assets', () => {
    const project = fixtureProject();
    const bytes = new Uint8Array([0, 1, 2, 250, 255, 42, 7]);
    const text = createHdzDocument({
      project,
      assets: [{ id: 'asset-plan', mime: 'image/png', bytes }],
      exportedAt: '2026-01-05T00:00:00.000Z',
    });
    const pkg = JSON.parse(text) as Record<string, unknown>;
    expect(pkg.format).toBe('hdesign-hdz');
    expect(pkg.formatVersion).toBe(1);
    expect(pkg.schemaVersion).toBe(project.schemaVersion);
    expect(pkg.exportedAt).toBe('2026-01-05T00:00:00.000Z');

    const parsed = parseHdzDocument(text);
    expect(parsed.warnings).toEqual([]);
    expect(parsed.project.id).toBe(project.id);
    expect(parsed.project.name).toBe(project.name);
    expect(parsed.assets).toHaveLength(1);
    expect([...parsed.assets[0]!.bytes]).toEqual([...bytes]);
    expect(parsed.assets[0]!.mime).toBe('image/png');
  });

  it('base64 encodes and decodes binary data deterministically', () => {
    expect(encodeBase64(new Uint8Array([]))).toBe('');
    expect(encodeBase64(new Uint8Array([0, 0, 0]))).toBe('AAAA');
    expect(encodeBase64(new Uint8Array([1, 2, 3, 4]))).toBe('AQIDBA==');
    expect([...decodeBase64('AQIDBA==')]).toEqual([1, 2, 3, 4]);
    const bytes = new Uint8Array(1000).map((_, index) => (index * 37) % 256);
    expect([...decodeBase64(encodeBase64(bytes))]).toEqual([...bytes]);
  });

  it('rejects malformed, foreign and oversized packages', () => {
    expect(() => parseHdzDocument('')).toThrow(HdzError);
    expect(() => parseHdzDocument('not json')).toThrow(HdzError);
    expect(() => parseHdzDocument(JSON.stringify({ format: 'other' }))).toThrow(/不是 HDesign 项目包/);
    expect(() =>
      parseHdzDocument(JSON.stringify({ format: 'hdesign-hdz', formatVersion: 9, project: {} })),
    ).toThrow(/高于当前支持/);
    const huge = 'x'.repeat(HDZ_MAX_BYTES + 1);
    expect(() => parseHdzDocument(huge)).toThrow(/上限/);
  });

  it('skips broken assets with warnings instead of failing the import', () => {
    const text = createHdzDocument({ project: fixtureProject() });
    const raw = JSON.parse(text) as Record<string, unknown>;
    raw.assets = [
      { id: 'broken', mime: 'image/png', base64: '***not-base64***' },
      { id: 'ok', mime: 'image/jpeg', base64: encodeBase64(new Uint8Array([9, 9, 9])) },
      { base64: 'AAAA' },
    ];
    const parsed = parseHdzDocument(JSON.stringify(raw));
    expect(parsed.assets).toHaveLength(1);
    expect(parsed.assets[0]!.id).toBe('ok');
    expect(parsed.warnings.length).toBeGreaterThanOrEqual(2);
  });

  it('exports oversized payloads with a clear error', () => {
    const bytes = new Uint8Array(HDZ_MAX_BYTES + 4);
    expect(() => createHdzDocument({ project: fixtureProject(), assets: [{ id: 'x', mime: 'image/png', bytes }] })).toThrow(
      /上限/,
    );
  });

  it('counts utf8 bytes and suggests safe file names', () => {
    expect(utf8Length('abc')).toBe(3);
    expect(utf8Length('中文')).toBe(6);
    expect(hdzFileName('三居 方案/2026', new Date('2026-02-03T00:00:00Z'))).toBe('三居-方案-2026-20260203.hdz');
    expect(hdzFileName('   ', new Date('2026-02-03T00:00:00Z'))).toBe('hdesign-project-20260203.hdz');
  });
});
