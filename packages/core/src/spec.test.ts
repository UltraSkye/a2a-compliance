import { describe, expect, it } from 'vitest';
import { methodsFor, resolveSpecVersion, SPEC_METHODS } from './spec.js';

describe('resolveSpecVersion', () => {
  it('maps "0.3" and "1.0" to themselves', () => {
    expect(resolveSpecVersion('0.3')).toBe('0.3');
    expect(resolveSpecVersion('1.0')).toBe('1.0');
  });
  it('falls back to 1.0 for unknown versions', () => {
    expect(resolveSpecVersion(undefined)).toBe('1.0');
    expect(resolveSpecVersion('0.2')).toBe('1.0');
    expect(resolveSpecVersion('2.0')).toBe('1.0');
    expect(resolveSpecVersion('')).toBe('1.0');
  });
});

describe('methodsFor', () => {
  it('returns v1.0 canonical message/* names', () => {
    const m = methodsFor('1.0');
    expect(m.send).toBe('message/send');
    expect(m.stream).toBe('message/stream');
    expect(m.pushSet).toBe('tasks/pushNotificationConfig/set');
  });
  it('returns v0.3 legacy tasks/* names', () => {
    const m = methodsFor('0.3');
    expect(m.send).toBe('tasks/send');
    expect(m.stream).toBe('tasks/sendSubscribe');
    expect(m.pushSet).toBe('tasks/pushNotification/set');
  });
  it('known versions list matches map keys', () => {
    expect(Object.keys(SPEC_METHODS)).toEqual(['0.3', '1.0']);
  });
});
