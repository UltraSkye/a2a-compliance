import type { ComplianceReport } from '../report.js';

/**
 * Render a ComplianceReport as JUnit XML.
 * Compatible with most CI test-result viewers (GitHub Actions, GitLab, Jenkins).
 */
export function toJUnitXml(report: ComplianceReport): string {
  const { target, checks, startedAt, summary } = report;
  const durationSec = (sumDuration(checks) / 1000).toFixed(3);

  const testcases = checks.map((c) => {
    const nameAttr = xmlAttr(`${c.severity}: ${c.title}`);
    const classAttr = xmlAttr(c.id);
    const timeAttr = (c.durationMs / 1000).toFixed(3);
    const head = `    <testcase classname="${classAttr}" name="${nameAttr}" time="${timeAttr}">`;

    if (c.status === 'pass') {
      return `${head}</testcase>`;
    }
    if (c.status === 'skip') {
      return `${head}\n      <skipped/>\n    </testcase>`;
    }
    const tag = c.status === 'fail' ? 'failure' : 'warning';
    const msg = xmlAttr(c.message ?? '');
    return `${head}\n      <${tag} message="${msg}" type="${c.severity}"/>\n    </testcase>`;
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuites name="a2a-compliance" time="${durationSec}" tests="${summary.total}" failures="${summary.fail}" errors="0" skipped="${summary.skip}">`,
    `  <testsuite name="${xmlAttr(target)}" timestamp="${startedAt}" tests="${summary.total}" failures="${summary.fail}" skipped="${summary.skip}" time="${durationSec}">`,
    ...testcases,
    '  </testsuite>',
    '</testsuites>',
    '',
  ].join('\n');
}

function sumDuration(checks: ComplianceReport['checks']): number {
  return checks.reduce((acc, c) => acc + c.durationMs, 0);
}

function xmlAttr(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('\n', ' ');
}
