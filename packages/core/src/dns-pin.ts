import { promises as dns } from 'node:dns';
import { isIP } from 'node:net';
import { Agent } from 'undici';
import { isPrivateIPv4, isPrivateIPv6 } from './private-network.js';

export interface PinnedDispatcherResult {
  /** undici dispatcher that pins every lookup for `hostname` to `pinnedIp`. */
  dispatcher: Agent;
  /** Address we pinned the hostname to. */
  pinnedIp: string;
  /** AF family: 4 or 6. */
  family: 4 | 6;
}

/**
 * Resolve `hostname` once, refuse if the resolution is a private-space
 * address, then return an undici dispatcher that will force every
 * subsequent connect attempt for that hostname to the pinned IP. Kills
 * the DNS-rebinding TOCTOU: the `dns.lookup` run by ssrfCheckForUrl and
 * the one run by fetch against the same name always agree because the
 * second lookup doesn't happen — the dispatcher replaces it.
 *
 * TLS SNI / certificate validation is unaffected because undici's
 * `connect` hook receives the hostname separately from the resolved
 * address — we only override DNS, not the hostname used for the
 * handshake.
 */
export async function pinnedDispatcherFor(hostname: string): Promise<PinnedDispatcherResult> {
  if (isIP(hostname)) {
    // Literal IP — no DNS to rebind. Still refuse private targets here
    // so a caller using a pinned dispatcher never connects to RFC 1918.
    const family = isIP(hostname);
    if (family === 4 && isPrivateIPv4(hostname)) {
      throw new Error(`literal IPv4 ${hostname} is in a private range`);
    }
    if (family === 6 && isPrivateIPv6(hostname)) {
      throw new Error(`literal IPv6 ${hostname} is in a private range`);
    }
    return {
      dispatcher: new Agent(),
      pinnedIp: hostname,
      family: family === 6 ? 6 : 4,
    };
  }

  const records = await dns.lookup(hostname, { all: true, verbatim: false });
  if (records.length === 0) {
    throw new Error(`hostname did not resolve: ${hostname}`);
  }

  for (const r of records) {
    if (r.family === 4 && isPrivateIPv4(r.address)) {
      throw new Error(`${hostname} resolves to private IPv4 ${r.address}`);
    }
    if (r.family === 6 && isPrivateIPv6(r.address)) {
      throw new Error(`${hostname} resolves to private IPv6 ${r.address}`);
    }
  }

  const first = records[0];
  if (!first) {
    throw new Error(`hostname did not resolve: ${hostname}`);
  }
  const pinnedIp = first.address;
  const family: 4 | 6 = first.family === 6 ? 6 : 4;

  type LookupCb = (err: NodeJS.ErrnoException | null, address: string, family: number) => void;
  const dispatcher = new Agent({
    connect: {
      // When undici asks the kernel to resolve the host, short-circuit
      // with our already-checked IP. This is the TOCTOU closure.
      lookup: (host: string, _opts: unknown, cb: LookupCb) => {
        if (host === hostname) {
          cb(null, pinnedIp, family);
          return;
        }
        // Unrelated hostnames (e.g. redirect to a different host) go
        // through the normal resolver — the redirect hook re-pins them.
        dns
          .lookup(host)
          .then((resolved) => cb(null, resolved.address, resolved.family))
          .catch((err: NodeJS.ErrnoException) => cb(err, '', 0));
      },
    },
  });

  return { dispatcher, pinnedIp, family };
}
