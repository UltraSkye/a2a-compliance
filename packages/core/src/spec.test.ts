import { describe, expect, it } from 'vitest';
import { methodsFor, profileFor, resolveSpecVersion, SPEC_METHODS } from './spec.js';

describe('resolveSpecVersion', () => {
  it('maps known versions to themselves', () => {
    expect(resolveSpecVersion('0.2')).toBe('0.2');
    expect(resolveSpecVersion('0.3')).toBe('0.3');
    expect(resolveSpecVersion('1.0')).toBe('1.0');
  });
  it('ignores patch digits per spec §6', () => {
    expect(resolveSpecVersion('0.2.6')).toBe('0.2');
    expect(resolveSpecVersion('0.3.0')).toBe('0.3');
    expect(resolveSpecVersion('1.0.0')).toBe('1.0');
  });
  it('falls back to 0.3 for unknown or absent versions', () => {
    expect(resolveSpecVersion(undefined)).toBe('0.3');
    expect(resolveSpecVersion('0.1')).toBe('0.3');
    expect(resolveSpecVersion('2.0')).toBe('0.3');
    expect(resolveSpecVersion('')).toBe('0.3');
    expect(resolveSpecVersion('garbage')).toBe('0.3');
  });
});

describe('methodsFor', () => {
  it('returns 1.0 PascalCase names', () => {
    const m = methodsFor('1.0');
    expect(m.send).toBe('SendMessage');
    expect(m.stream).toBe('SendStreamingMessage');
    expect(m.get).toBe('GetTask');
    expect(m.cancel).toBe('CancelTask');
    expect(m.resubscribe).toBe('SubscribeToTask');
    expect(m.pushSet).toBe('CreateTaskPushNotificationConfig');
    expect(m.pushGet).toBe('GetTaskPushNotificationConfig');
  });
  it('returns 0.3 message/* names', () => {
    const m = methodsFor('0.3');
    expect(m.send).toBe('message/send');
    expect(m.stream).toBe('message/stream');
    expect(m.pushSet).toBe('tasks/pushNotificationConfig/set');
  });
  it('returns 0.2 tasks/* names', () => {
    const m = methodsFor('0.2');
    expect(m.send).toBe('tasks/send');
    expect(m.stream).toBe('tasks/sendSubscribe');
    expect(m.pushSet).toBe('tasks/pushNotification/set');
  });
  it('known versions list matches map keys', () => {
    expect(Object.keys(SPEC_METHODS)).toEqual(['0.2', '0.3', '1.0']);
  });
});

describe('profileFor', () => {
  it('sends A2A-Version on 0.3 and 1.0', () => {
    expect(profileFor('0.3').headers).toEqual({ 'A2A-Version': '0.3' });
    expect(profileFor('1.0').headers).toEqual({ 'A2A-Version': '1.0' });
  });
  it('sends no version header on 0.2', () => {
    expect(profileFor('0.2').headers).toEqual({});
  });
});
