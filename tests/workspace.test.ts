import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  discoverWorkspace,
  parsePnpmWorkspaceYaml,
  resolvePackageForFile,
} from '../src/core/workspace.js';

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'crap4ts-ws-'));
}

describe('parsePnpmWorkspaceYaml', () => {
  it('extracts the list of package globs', () => {
    const yaml = `
packages:
  - 'packages/*'
  - "apps/**"
  - tools/lint
catalog:
  vitest: ^2.0.0
`;
    expect(parsePnpmWorkspaceYaml(yaml)).toEqual([
      'packages/*',
      'apps/**',
      'tools/lint',
    ]);
  });

  it('ignores comments and blanks', () => {
    expect(
      parsePnpmWorkspaceYaml(
        '# comment\npackages:\n  # nested comment\n  - foo\n',
      ),
    ).toEqual(['foo']);
  });

  it('returns an empty list when there is no packages: block', () => {
    expect(parsePnpmWorkspaceYaml('catalog:\n  - vitest\n')).toEqual([]);
  });
});

describe('discoverWorkspace', () => {
  it('expands pnpm-workspace.yaml globs into package roots', () => {
    const root = tmp();
    writeFileSync(
      join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\n",
    );
    mkdirSync(join(root, 'packages', 'alpha'), { recursive: true });
    mkdirSync(join(root, 'packages', 'beta'), { recursive: true });
    writeFileSync(
      join(root, 'packages', 'alpha', 'package.json'),
      JSON.stringify({ name: '@scope/alpha' }),
    );
    writeFileSync(
      join(root, 'packages', 'beta', 'package.json'),
      JSON.stringify({ name: '@scope/beta' }),
    );

    const packages = discoverWorkspace(root);
    expect(packages.map((p) => p.name).sort()).toEqual([
      '@scope/alpha',
      '@scope/beta',
    ]);
  });

  it('reads package.json#workspaces (npm/yarn shape)', () => {
    const root = tmp();
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ name: 'root', workspaces: ['libs/*'] }),
    );
    mkdirSync(join(root, 'libs', 'one'), { recursive: true });
    writeFileSync(
      join(root, 'libs', 'one', 'package.json'),
      JSON.stringify({ name: 'lib-one' }),
    );
    const packages = discoverWorkspace(root);
    expect(packages).toHaveLength(1);
    expect(packages[0]!.name).toBe('lib-one');
  });

  it('falls back to directory name when package.json lacks "name"', () => {
    const root = tmp();
    writeFileSync(
      join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\n",
    );
    mkdirSync(join(root, 'packages', 'unnamed'), { recursive: true });
    writeFileSync(
      join(root, 'packages', 'unnamed', 'package.json'),
      JSON.stringify({}),
    );
    const packages = discoverWorkspace(root);
    expect(packages[0]!.name).toBe('unnamed');
  });

  it('returns [] when no workspace config is found', () => {
    expect(discoverWorkspace(tmp())).toEqual([]);
  });
});

describe('resolvePackageForFile', () => {
  const packages = [
    { name: 'short', path: `${sep}repo${sep}packages${sep}foo` },
    {
      name: 'long',
      path: `${sep}repo${sep}packages${sep}foo${sep}internal`,
    },
  ];

  it('picks the longest matching prefix', () => {
    expect(
      resolvePackageForFile(
        `${sep}repo${sep}packages${sep}foo${sep}internal${sep}x.ts`,
        packages,
      ),
    ).toBe('long');
  });

  it('returns undefined for files outside any package', () => {
    expect(
      resolvePackageForFile(`${sep}elsewhere${sep}x.ts`, packages),
    ).toBeUndefined();
  });
});
