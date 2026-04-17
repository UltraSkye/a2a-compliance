import { describe, expect, it } from 'vitest';
import { VERSION } from './version.js';

describe('VERSION', () => {
  it('is a non-empty string', () => {
    expect(typeof VERSION).toBe('string');
    expect(VERSION.length).toBeGreaterThan(0);
  });

  it('matches semver or is the "unknown" fallback', () => {
    // Either the real version from package.json (e.g. 0.1.0, 0.1.0-rc.1)
    // or the explicit fallback when package.json could not be read.
    expect(VERSION).toMatch(/^(\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?|unknown)$/);
  });
});
