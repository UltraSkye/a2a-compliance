import { CHECK_CATALOG } from '../catalog.js';
import type { Category, CheckResult, ComplianceReport, Severity } from '../report.js';

const SARIF_VERSION = '2.1.0';
const SARIF_SCHEMA =
  'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-2.1.0.json';
const TOOL_NAME = 'a2a-compliance';
const INFO_URI = 'https://github.com/UltraSkye/a2a-compliance';

/**
 * Render a compliance report as SARIF 2.1.0 for GitHub code-scanning,
 * GitLab, and any other consumer that reads the OASIS SARIF spec.
 *
 * Rules are derived from the internal check catalog so every run emits
 * the same rule list even when a particular run didn't execute every
 * check (filters, skipped security block, etc). Results point at the
 * report target as a single logical location — SARIF requires *some*
 * physicalLocation to anchor a finding, and agent URLs are the closest
 * analogue to a "file" for this tool.
 */
export function toSarif(report: ComplianceReport, toolVersion = '0.0.0'): string {
  const rules = Object.values(CHECK_CATALOG).map((meta) => ({
    id: meta.id,
    name: meta.id,
    shortDescription: { text: meta.title },
    fullDescription: { text: meta.description },
    defaultConfiguration: { level: sarifLevel(meta.severity, 'fail') },
    properties: {
      category: meta.category,
      severity: meta.severity,
      ...(meta.specRef ? { specRef: meta.specRef } : {}),
    },
    ...(meta.specRef ? { helpUri: meta.specRef.url } : {}),
  }));

  const results = report.checks
    // Skips and passes produce noise in code-scanning dashboards — only
    // publish actionable findings. We keep `skip` out entirely since
    // GitHub treats anything with a result row as requiring triage.
    .filter((c) => c.status === 'fail' || c.status === 'warn')
    .map((c) => toSarifResult(c, report.target));

  const sarif = {
    $schema: SARIF_SCHEMA,
    version: SARIF_VERSION,
    runs: [
      {
        tool: {
          driver: {
            name: TOOL_NAME,
            version: toolVersion,
            informationUri: INFO_URI,
            rules,
          },
        },
        results,
        invocations: [
          {
            executionSuccessful: true,
            startTimeUtc: report.startedAt,
            endTimeUtc: report.finishedAt,
          },
        ],
        properties: {
          specVersion: report.specVersion,
          tier: report.summary.tier,
          target: report.target,
        },
      },
    ],
  };

  return JSON.stringify(sarif, null, 2);
}

function toSarifResult(c: CheckResult, target: string): Record<string, unknown> {
  const category: Category = c.category ?? 'protocol';
  return {
    ruleId: c.id,
    level: sarifLevel(c.severity, c.status),
    message: {
      text: c.message ? `${c.title}: ${c.message}` : c.title,
    },
    locations: [
      {
        physicalLocation: {
          artifactLocation: {
            uri: target,
            uriBaseId: 'TARGET',
          },
        },
        logicalLocations: [
          {
            name: c.id,
            kind: 'member',
            fullyQualifiedName: `${category}.${c.id}`,
          },
        ],
      },
    ],
    properties: {
      category,
      severity: c.severity,
      status: c.status,
      ...(c.specRef ? { specRef: c.specRef } : {}),
    },
  };
}

function sarifLevel(
  severity: Severity,
  status: CheckResult['status'],
): 'error' | 'warning' | 'note' | 'none' {
  if (status === 'pass' || status === 'skip') return 'none';
  if (status === 'warn') return 'warning';
  // status === 'fail'
  if (severity === 'must') return 'error';
  if (severity === 'should') return 'warning';
  return 'note';
}
