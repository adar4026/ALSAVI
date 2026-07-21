/*
 * Build-time cache-version stamping for the app-shell service worker (TASK_016).
 *
 * public/sw.js is copied into dist/ verbatim by Vite (public assets are not
 * bundled, so `import.meta.env` / `define` substitution cannot reach them).
 * This tiny inline plugin therefore stamps the version into dist/sw.js at the
 * end of the build. No separate npm plugin/package is introduced.
 *
 * The cache version is derived SOLELY from the current HEAD commit — it
 * represents the deployed build identity, not the working-tree state. If the
 * git context is unavailable, the build fails explicitly rather than falling
 * back to a non-deterministic or hardcoded version.
 *
 * sw.js owns the 'alsavi-shell-' prefix (its single source of truth) and
 * composes CACHE_VERSION as SHELL_CACHE_PREFIX + <this sha>; the stamp injects
 * only the sha.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, relative, resolve, sep } from 'node:path';
import type { Plugin } from 'vite';

/** Placeholder token in public/sw.js, replaced with the HEAD sha at build time. */
export const SW_VERSION_TOKEN = '__ALSAVI_SW_CACHE_VERSION__';

/** Injectable command runner, so resolveCacheVersion is deterministically testable. */
export type GitRunner = (command: string, args: readonly string[]) => string;

const defaultGitRunner: GitRunner = (command, args) =>
  execFileSync(command, [...args], { encoding: 'utf8' });

/**
 * Resolve the cache-version identifier: the 12-char HEAD commit sha.
 *
 * Derived solely from the current HEAD commit; the working tree is never
 * inspected. Throws if the git context is unavailable (not a repo, git missing,
 * command fails), so `vite build` aborts explicitly. sw.js composes the full
 * cache name as SHELL_CACHE_PREFIX + <this value>.
 */
export function resolveCacheVersion(run: GitRunner = defaultGitRunner): string {
  let sha: string;
  try {
    sha = run('git', ['rev-parse', '--short=12', 'HEAD']).trim();
  } catch (cause) {
    throw new Error(
      'TASK_016: cannot determine the HEAD commit for the service-worker cache ' +
        'version; a git context is required. Build aborted.',
      { cause },
    );
  }
  if (!/^[0-9a-f]{12}$/.test(sha)) {
    throw new Error(
      `TASK_016: unexpected git HEAD sha "${sha}"; expected 12 hex chars. Build aborted.`,
    );
  }
  return sha;
}

/**
 * Replace the version token in the service-worker source with `version`.
 *
 * Pure: no git, no fs. Throws if the token is absent, guarding against a silent
 * no-op if sw.js is renamed or edited so the stamp stops matching.
 */
export function stampServiceWorker(source: string, version: string): string {
  if (!source.includes(SW_VERSION_TOKEN)) {
    throw new Error(
      `TASK_016: service-worker source does not contain ${SW_VERSION_TOKEN}; nothing to stamp.`,
    );
  }
  return source.split(SW_VERSION_TOKEN).join(version);
}

/**
 * Placeholder in public/sw.js for the build-discovered precache manifest
 * (TASK_017). Quoted as a one-element JSON array literal so the file stays
 * valid, harmless JS if the token is ever left unstamped (dev; this worker
 * never registers outside a production build — see registerSW.ts).
 */
export const SW_PRECACHE_MANIFEST_TOKEN = "['__ALSAVI_SW_PRECACHE_MANIFEST__']";

/** Injectable directory lister, so resolvePrecacheManifest is deterministically testable. */
export type DirWalker = (dir: string) => readonly string[];

const defaultDirWalker: DirWalker = (dir) => {
  const files: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const abs = resolve(current, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
      } else {
        files.push(relative(dir, abs).split(sep).join('/'));
      }
    }
  };
  walk(dir);
  return files;
};

/** Files present in every build output that are not app-shell assets to precache. */
const PRECACHE_EXCLUDED_FILES = new Set(['sw.js', 'index.html']);

/**
 * Extensions excluded from the eager install-time precache even though they
 * are real build output: large, on-demand assets not required to render the
 * app's initial usable state (e.g. the sql.js WASM binary, fetched only when
 * the user actually imports an .apkg file). These still get cached the first
 * time they're actually requested, via the existing runtime
 * stale-while-revalidate fetch handler — they are simply not force-downloaded
 * on every install. Forcing every install through hundreds of KB of a rarely
 * used feature would work against the app feeling instant (SPEED principle).
 */
const PRECACHE_EXCLUDED_EXTENSIONS = new Set(['.wasm']);

/**
 * Resolve the full app-shell precache manifest: every build-output file
 * except the service worker itself and index.html (the navigation document is
 * precached separately, under its own './' key — see sw.js install handler),
 * as scope-relative URLs ('./assets/index-<hash>.js', './manifest.webmanifest',
 * './icons/icon-192.png', ...). Walking the actual dist/ output (rather than
 * Rollup's in-memory bundle metadata) captures both bundled, content-hashed
 * chunks and files Vite copies verbatim from public/ (manifest, icons) with a
 * single mechanism. Sorted for deterministic output.
 */
export function resolvePrecacheManifest(
  outDir: string,
  walk: DirWalker = defaultDirWalker,
): string[] {
  return walk(outDir)
    .filter((f) => !PRECACHE_EXCLUDED_FILES.has(f))
    .filter((f) => !PRECACHE_EXCLUDED_EXTENSIONS.has(extname(f)))
    .slice()
    .sort()
    .map((f) => `./${f}`);
}

/**
 * Replace the precache-manifest token in the service-worker source with the
 * JSON-serialized `manifest`.
 *
 * Pure: no fs. Throws if the token is absent, guarding against a silent
 * no-op if sw.js is renamed or edited so the stamp stops matching.
 */
export function stampPrecacheManifest(source: string, manifest: readonly string[]): string {
  if (!source.includes(SW_PRECACHE_MANIFEST_TOKEN)) {
    throw new Error(
      `TASK_017: service-worker source does not contain ${SW_PRECACHE_MANIFEST_TOKEN}; nothing to stamp.`,
    );
  }
  return source.split(SW_PRECACHE_MANIFEST_TOKEN).join(JSON.stringify(manifest));
}

/**
 * Vite plugin (build only): stamps dist/sw.js with the HEAD-derived cache
 * version and the build-discovered app-shell precache manifest. Resolves the
 * version early (buildStart) to fail fast before bundling if the git context
 * is missing; rewrites dist/sw.js in closeBundle, after Vite has copied the
 * public/ directory and written all bundled output — so the precache manifest
 * walk sees the complete, final dist/ tree.
 */
export function serviceWorkerVersionPlugin(): Plugin {
  let version: string;
  let outDir: string;
  return {
    name: 'alsavi-sw-version',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    buildStart() {
      version = resolveCacheVersion();
    },
    closeBundle() {
      const swPath = resolve(outDir, 'sw.js');
      if (!existsSync(swPath)) {
        throw new Error(
          `TASK_016: expected built service worker at ${swPath}, but it is missing. Build aborted.`,
        );
      }
      const manifest = resolvePrecacheManifest(outDir);
      let contents = stampServiceWorker(readFileSync(swPath, 'utf8'), version);
      contents = stampPrecacheManifest(contents, manifest);
      writeFileSync(swPath, contents);
    },
  };
}
