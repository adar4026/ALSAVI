import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  SW_PRECACHE_MANIFEST_TOKEN,
  SW_VERSION_TOKEN,
  resolveCacheVersion,
  resolvePrecacheManifest,
  stampPrecacheManifest,
  stampServiceWorker,
  type DirWalker,
  type GitRunner,
} from '../build/serviceWorkerVersion';

describe('stampServiceWorker', () => {
  it('replaces the version token with the given version', () => {
    const src = `const CACHE_VERSION = SHELL_CACHE_PREFIX + '${SW_VERSION_TOKEN}';`;
    expect(stampServiceWorker(src, '10cc838985b6')).toBe(
      "const CACHE_VERSION = SHELL_CACHE_PREFIX + '10cc838985b6';",
    );
  });

  it('throws when the token is absent (guards against a silent no-op)', () => {
    expect(() => stampServiceWorker('const CACHE_VERSION = "hardcoded";', 'abc')).toThrow();
  });
});

describe('resolveCacheVersion', () => {
  it('returns the 12-char HEAD sha and consults nothing but the commit', () => {
    const calls: string[][] = [];
    const run: GitRunner = (command, args) => {
      calls.push([command, ...args]);
      return '10cc838985b6\n';
    };
    expect(resolveCacheVersion(run)).toBe('10cc838985b6');
    // Exactly one git command; the working-tree state is never inspected.
    expect(calls).toEqual([['git', 'rev-parse', '--short=12', 'HEAD']]);
  });

  it('throws when the git context is unavailable (build must fail explicitly)', () => {
    const run: GitRunner = () => {
      throw new Error('not a git repository');
    };
    expect(() => resolveCacheVersion(run)).toThrow();
  });

  it('rejects an unexpected (non-sha) git output rather than stamping garbage', () => {
    const run: GitRunner = () => 'not-a-sha\n';
    expect(() => resolveCacheVersion(run)).toThrow();
  });
});

describe('resolvePrecacheManifest', () => {
  it('excludes sw.js and index.html, sorts, and prefixes each entry with ./', () => {
    const walk: DirWalker = () => [
      'index.html',
      'sw.js',
      'manifest.webmanifest',
      'assets/index-b.css',
      'assets/index-a.js',
      'icons/icon-192.png',
    ];
    expect(resolvePrecacheManifest('/dist', walk)).toEqual([
      './assets/index-a.js',
      './assets/index-b.css',
      './icons/icon-192.png',
      './manifest.webmanifest',
    ]);
  });

  it('excludes .wasm assets from the eager precache (lazy, runtime-cached only on actual use)', () => {
    const walk: DirWalker = () => [
      'assets/index-a.js',
      'assets/sql-wasm-x.wasm',
      'manifest.webmanifest',
    ];
    expect(resolvePrecacheManifest('/dist', walk)).toEqual([
      './assets/index-a.js',
      './manifest.webmanifest',
    ]);
  });

  it('passes the given outDir through to the walker unchanged', () => {
    const seen: string[] = [];
    const walk: DirWalker = (dir) => {
      seen.push(dir);
      return [];
    };
    resolvePrecacheManifest('/some/dist', walk);
    expect(seen).toEqual(['/some/dist']);
  });
});

describe('stampPrecacheManifest', () => {
  it('replaces the manifest token with the JSON-serialized manifest', () => {
    const src = `const PRECACHE_MANIFEST = ${SW_PRECACHE_MANIFEST_TOKEN};`;
    expect(stampPrecacheManifest(src, ['./a.js', './b.css'])).toBe(
      'const PRECACHE_MANIFEST = ["./a.js","./b.css"];',
    );
  });

  it('throws when the token is absent (guards against a silent no-op)', () => {
    expect(() => stampPrecacheManifest('const PRECACHE_MANIFEST = [];', ['./a.js'])).toThrow();
  });
});

describe('public/sw.js source invariants', () => {
  const source = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../public/sw.js'),
    'utf8',
  );

  it('contains the version placeholder token (keeps source and stamper in sync)', () => {
    expect(source).toContain(SW_VERSION_TOKEN);
  });

  it('defines the shell-cache prefix exactly once and reuses it', () => {
    const prefixDefs = source.match(/const SHELL_CACHE_PREFIX = /g) ?? [];
    expect(prefixDefs).toHaveLength(1);
    // CACHE_VERSION is composed from the prefix; the activate filter reuses it.
    expect(source).toContain('SHELL_CACHE_PREFIX +');
    expect(source).toContain('startsWith(SHELL_CACHE_PREFIX)');
  });

  it('scopes the activate prune to the prefix, never a blanket filter', () => {
    expect(source).toContain('k.startsWith(SHELL_CACHE_PREFIX) && k !== CACHE_VERSION');
  });

  it('contains the precache-manifest placeholder token (keeps source and stamper in sync)', () => {
    expect(source).toContain(SW_PRECACHE_MANIFEST_TOKEN);
  });

  it('precaches the navigation document and the full manifest atomically on install', () => {
    expect(source).toContain("const shell = ['./', ...PRECACHE_MANIFEST];");
    expect(source).toContain('cache.addAll(shell.map(');
  });

  it('uses scope-relative (not origin-root) URLs for the navigation-document cache key', () => {
    expect(source).not.toContain("cache.add('/')");
    expect(source).not.toContain("cache.match('/')");
  });
});
