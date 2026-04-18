import { describe, expect, it } from 'vitest';
import { CHECK_CATALOG, explain, listCheckIds, metaFor } from './catalog.js';

describe('catalog', () => {
  it('every catalog entry has a category and severity', () => {
    for (const [id, meta] of Object.entries(CHECK_CATALOG)) {
      expect(meta.id).toBe(id);
      expect(['card', 'protocol', 'methods', 'security', 'spec', 'auth']).toContain(meta.category);
      expect(['must', 'should', 'info']).toContain(meta.severity);
      expect(meta.title).toBeTruthy();
      expect(meta.description).toBeTruthy();
    }
  });

  it('listCheckIds returns all catalog ids sorted', () => {
    const ids = listCheckIds();
    expect(ids.length).toBe(Object.keys(CHECK_CATALOG).length);
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
  });

  it('explain returns metadata for a known id', () => {
    const meta = explain('card.reachable');
    expect(meta?.category).toBe('card');
    expect(meta?.severity).toBe('must');
  });

  it('explain returns undefined for unknown id', () => {
    expect(explain('does.not.exist')).toBeUndefined();
    expect(metaFor('does.not.exist')).toBeUndefined();
  });

  it('spec-ref URLs point at known hosts', () => {
    for (const meta of Object.values(CHECK_CATALOG)) {
      if (!meta.specRef) continue;
      expect(meta.specRef.url).toMatch(/^https:\/\/(a2a-protocol\.org|www\.jsonrpc\.org)\//);
      expect(meta.specRef.section).toBeTruthy();
    }
  });
});
