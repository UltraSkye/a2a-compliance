import { AGENT_CARD_WELL_KNOWN_PATH, AgentCardSchema } from '@a2a-compliance/schemas';
import { fetchWithTimeout, now, readCappedJson } from '../http.js';
import { redactInText } from '../redact.js';
import type { CheckResult } from '../report.js';

export async function agentCardChecks(baseUrl: string): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const cardUrl = new URL(AGENT_CARD_WELL_KNOWN_PATH, baseUrl).toString();

  const t0 = now();
  let res: Response | undefined;
  try {
    res = await fetchWithTimeout(cardUrl);
    results.push({
      id: 'card.reachable',
      title: `Agent card reachable at ${AGENT_CARD_WELL_KNOWN_PATH}`,
      severity: 'must',
      status: res.ok ? 'pass' : 'fail',
      ...(res.ok ? {} : { message: `HTTP ${res.status} ${res.statusText}` }),
      durationMs: now() - t0,
    });
  } catch (err) {
    results.push({
      id: 'card.reachable',
      title: `Agent card reachable at ${AGENT_CARD_WELL_KNOWN_PATH}`,
      severity: 'must',
      status: 'fail',
      message: redactInText(err instanceof Error ? err.message : String(err)),
      durationMs: now() - t0,
    });
    return results;
  }

  if (!res.ok) return results;

  const t1 = now();
  let body: unknown;
  try {
    body = await readCappedJson(res);
    results.push({
      id: 'card.json',
      title: 'Agent card body is valid JSON',
      severity: 'must',
      status: 'pass',
      durationMs: now() - t1,
    });
  } catch (err) {
    results.push({
      id: 'card.json',
      title: 'Agent card body is valid JSON',
      severity: 'must',
      status: 'fail',
      message: redactInText(err instanceof Error ? err.message : 'invalid JSON'),
      durationMs: now() - t1,
    });
    return results;
  }

  const t2 = now();
  const parsed = AgentCardSchema.safeParse(body);
  results.push({
    id: 'card.schema',
    title: 'Agent card conforms to A2A schema',
    severity: 'must',
    status: parsed.success ? 'pass' : 'fail',
    ...(parsed.success
      ? {}
      : {
          message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          evidence: parsed.error.issues,
        }),
    durationMs: now() - t2,
  });

  const ct = res.headers.get('content-type') ?? '';
  const ctOk = ct.toLowerCase().includes('application/json');
  results.push({
    id: 'card.contentType',
    title: 'Content-Type is application/json',
    severity: 'should',
    status: ctOk ? 'pass' : 'warn',
    message: ct ? `got ${ct}` : 'missing Content-Type',
    durationMs: 0,
  });

  // Only run the url/skills deep checks when the schema parsed — they'd
  // produce redundant noise on a card that already failed card.schema.
  if (parsed.success) {
    const card = parsed.data;
    let urlOk = false;
    try {
      urlOk = new URL(card.url).protocol.startsWith('http');
    } catch {
      urlOk = false;
    }
    results.push({
      id: 'card.urlAbsolute',
      title: 'card.url is absolute http(s) URL',
      severity: 'must',
      status: urlOk ? 'pass' : 'fail',
      ...(urlOk ? {} : { message: `got ${redactInText(card.url)}` }),
      durationMs: 0,
    });

    results.push({
      id: 'card.skillsNonEmpty',
      title: 'card.skills has at least one entry',
      severity: 'must',
      status: card.skills.length > 0 ? 'pass' : 'fail',
      durationMs: 0,
    });
  }

  return results;
}
