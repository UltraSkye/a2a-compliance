import { describe, expect, it } from 'vitest';
import { isPrivateIPv4, isPrivateIPv6, normalizeV6ToV4 } from './security.js';

describe('isPrivateIPv4', () => {
  it.each([
    ['10.0.0.1', true],
    ['127.0.0.1', true],
    ['169.254.169.254', true],
    ['172.16.0.1', true],
    ['172.31.255.255', true],
    ['172.32.0.1', false], // outside RFC 1918
    ['192.168.1.1', true],
    ['100.64.0.1', true], // CGN
    ['0.0.0.0', true],
    ['8.8.8.8', false],
    ['1.1.1.1', false],
  ])('%s → %s', (ip, expected) => {
    expect(isPrivateIPv4(ip)).toBe(expected);
  });
});

describe('normalizeV6ToV4', () => {
  it.each([
    ['::ffff:127.0.0.1', '127.0.0.1'], // IPv4-mapped dotted
    ['::ffff:169.254.169.254', '169.254.169.254'],
    ['::ffff:7f00:1', '127.0.0.1'], // IPv4-mapped hex
    ['::ffff:a9fe:a9fe', '169.254.169.254'],
    ['::192.168.1.1', '192.168.1.1'], // IPv4-compat (deprecated)
    ['64:ff9b::10.0.0.1', '10.0.0.1'], // NAT64
    // Public v6 passes through unchanged
    ['2001:db8::1', '2001:db8::1'],
    ['fe80::1', 'fe80::1'],
    // ::1 is IPv4-compat-encoded (top 12 bytes all zero) → unwraps to 0.0.0.1,
    // which isPrivateIPv4 classifies as 0.0.0.0/8 private → correct security
    ['::1', '0.0.0.1'],
    // Fully expanded mapped form must still unwrap
    ['0:0:0:0:0:ffff:7f00:1', '127.0.0.1'],
  ])('%s → %s', (v6, expected) => {
    expect(normalizeV6ToV4(v6)).toBe(expected);
  });
});

describe('isPrivateIPv6 catches IPv4-mapped / NAT64 / IPv4-compat bypasses', () => {
  it.each([
    // IPv4-mapped loopback + metadata + RFC1918 — previously bypassed
    ['::ffff:127.0.0.1', true],
    ['::ffff:169.254.169.254', true],
    ['::ffff:10.0.0.5', true],
    ['::ffff:7f00:1', true], // hex form of 127.0.0.1
    ['::ffff:a9fe:a9fe', true], // hex form of 169.254.169.254
    ['64:ff9b::192.168.1.1', true], // NAT64 of RFC1918
    ['::192.168.1.1', true], // deprecated IPv4-compat

    // Genuine private IPv6 ranges
    ['::1', true],
    ['fe80::1', true],
    ['fc00::1', true],
    ['fd00::1', true],

    // Public IPv6 addresses — must NOT match
    ['2001:db8::1', false],
    ['2606:4700:4700::1111', false], // Cloudflare DNS
  ])('%s → %s', (ip, expected) => {
    expect(isPrivateIPv6(ip)).toBe(expected);
  });
});
