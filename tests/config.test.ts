import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, loadFileConfig, mergeConfig } from '../src/config.js';

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'crap4ts-cfg-'));
}

describe('loadFileConfig', () => {
  it('returns {} when neither crap.config.json nor package.json#crap exists', () => {
    const dir = tmpDir();
    expect(loadFileConfig(dir)).toEqual({});
  });

  it('reads crap.config.json when present', () => {
    const dir = tmpDir();
    writeFileSync(
      join(dir, 'crap.config.json'),
      JSON.stringify({ threshold: 42, ignore: ['x.ts'] }),
    );
    expect(loadFileConfig(dir)).toEqual({ threshold: 42, ignore: ['x.ts'] });
  });

  it('reads the "crap" section of package.json when no dedicated file exists', () => {
    const dir = tmpDir();
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({
        name: 'demo',
        crap: { threshold: 25, reporter: 'json' },
      }),
    );
    expect(loadFileConfig(dir)).toEqual({ threshold: 25, reporter: 'json' });
  });

  it('prefers crap.config.json over package.json#crap', () => {
    const dir = tmpDir();
    writeFileSync(
      join(dir, 'crap.config.json'),
      JSON.stringify({ threshold: 100 }),
    );
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ crap: { threshold: 50 } }),
    );
    expect(loadFileConfig(dir)).toEqual({ threshold: 100 });
  });

  it('honours --config <explicit path>', () => {
    const dir = tmpDir();
    const custom = join(dir, 'custom.json');
    writeFileSync(custom, JSON.stringify({ threshold: 7 }));
    expect(loadFileConfig(dir, custom)).toEqual({ threshold: 7 });
  });

  it('throws a useful error on malformed JSON', () => {
    const dir = tmpDir();
    writeFileSync(join(dir, 'crap.config.json'), '{ not json');
    expect(() => loadFileConfig(dir)).toThrow(/Failed to read config/);
  });
});

describe('mergeConfig', () => {
  it('falls back to defaults when nothing is provided', () => {
    expect(mergeConfig({}, {})).toEqual(DEFAULT_CONFIG);
  });

  it('CLI overrides config file', () => {
    const merged = mergeConfig(
      { threshold: 25, reporter: 'json' },
      { threshold: 10 },
    );
    expect(merged.threshold).toBe(10);
    expect(merged.reporter).toBe('json'); // not overridden, kept from file
  });

  it('concatenates ignore lists (file then CLI)', () => {
    const merged = mergeConfig({ ignore: ['a.ts'] }, { ignore: ['b.ts'] });
    expect(merged.ignore).toEqual(['a.ts', 'b.ts']);
  });

  it('uses CLI paths when provided, otherwise config include, otherwise default', () => {
    expect(mergeConfig({}, {}).paths).toEqual(DEFAULT_CONFIG.paths);

    expect(mergeConfig({ include: ['src/x'] }, {}).paths).toEqual(['src/x']);

    expect(
      mergeConfig({ include: ['src/x'] }, { paths: ['cli/y'] }).paths,
    ).toEqual(['cli/y']);
  });

  it('preserves coverage configuration from either source', () => {
    const fromFile = mergeConfig(
      { coverage: '/abs/cov.json', coverageFormat: 'lcov' },
      {},
    );
    expect(fromFile.coverageFile).toBe('/abs/cov.json');
    expect(fromFile.coverageFormat).toBe('lcov');

    const fromCli = mergeConfig(
      {},
      { coverageFile: '/cli/cov.json', coverageFormat: 'v8' },
    );
    expect(fromCli.coverageFile).toBe('/cli/cov.json');
    expect(fromCli.coverageFormat).toBe('v8');
  });
});
