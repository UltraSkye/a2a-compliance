import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Read the published package.json at runtime rather than hard-coding the
// version in source. Prevents 'a2a-compliance --version' from drifting
// out of sync with whatever tag was actually published.
//
// dist/index.js → ../package.json is the package root both in the
// workspace (where tsc emits dist/) and in the installed tarball (where
// npm places dist/ + package.json side by side).
function readVersion(): string {
  try {
    const pkgPath = fileURLToPath(new URL('../package.json', import.meta.url));
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string };
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

export const VERSION = readVersion();
