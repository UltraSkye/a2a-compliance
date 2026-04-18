import type { ComplianceReport } from '../report.js';

/**
 * Render a ComplianceReport as JUnit XML.
 * Compatible with most CI test-result viewers (GitHub Actions, GitLab, Jenkins).
 *
 * Each testsuite carries `<properties>` with the compliance tier and
 * spec version so dashboards that group by property (e.g. GitLab test
 * reports, Buildkite) can filter across runs without re-parsing the
 * test-case list.
 */
export function toJUnitXml(report: ComplianceReport): string {
  const { target, checks, startedAt, summary } = report;
  const durationSec = (sumDuration(checks) / 1000).toFixed(3);

  const testcases = checks.map((c) => {
    const nameAttr = xmlAttr(`${c.severity}: ${c.title}`);
    const classAttr = xmlAttr(c.category ? `${c.category}.${c.id}` : c.id);
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

  const suiteProperties = [
    `      <property name="tier" value="${xmlAttr(summary.tier)}"/>`,
    `      <property name="specVersion" value="${xmlAttr(report.specVersion)}"/>`,
  ].join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuites name="a2a-compliance" time="${durationSec}" tests="${summary.total}" failures="${summary.fail}" errors="0" skipped="${summary.skip}">`,
    `  <testsuite name="${xmlAttr(target)}" timestamp="${startedAt}" tests="${summary.total}" failures="${summary.fail}" skipped="${summary.skip}" time="${durationSec}">`,
    '    <properties>',
    suiteProperties,
    '    </properties>',
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
  return (
    s
      // XML 1.0 forbids most control characters entirely. Strip them so a
      // hostile agent card message can't make downstream XML parsers choke
      // or inject unintended structure.
      // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional.
      .replaceAll(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      // Normalise whitespace to plain spaces so multi-line messages stay on
      // one line in attribute values.
      .replaceAll(/[\r\n\t]/g, ' ')
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
  );
}
