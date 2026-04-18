import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Reads package.json at runtime so the advertised MCP server version
// always matches the tag that was actually published. Same pattern the
// CLI uses for `--version`.
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
