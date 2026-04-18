import type { ComplianceReport, ComplianceTier } from '../report.js';

export interface BadgeOptions {
  /** Text before the colon. Default 'a2a'. */
  label?: string;
  /** Override the spec version label rendered on the right. */
  specVersionLabel?: string;
  /**
   * Render the compliance-tier label on the right instead of the spec
   * version. Default: false to preserve v0.1 badge contract.
   */
  tier?: boolean;
}

/**
 * Render the report as a minimal Shields-style SVG badge.
 * Green if every MUST passed, yellow if any warnings, red on MUST failure.
 * Text width is approximated with a fixed 7px-per-char estimate — good
 * enough for README use without shipping a font-metrics table.
 */
export function toBadgeSvg(report: ComplianceReport, opts: BadgeOptions = {}): string {
  const label = opts.label ?? 'a2a';
  const rightLabel = opts.tier
    ? tierLabel(report.summary.tier)
    : (opts.specVersionLabel ?? `v${report.specVersion}`);
  const { status, message, color } = classify(report, rightLabel, opts.tier === true);

  const leftText = label;
  const rightText = message;
  const leftWidth = textWidth(leftText) + 12;
  const rightWidth = textWidth(rightText) + 12;
  const totalWidth = leftWidth + rightWidth;

  const title = `${label}: ${message} (${status})`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${escapeXml(title)}">
  <title>${escapeXml(title)}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <rect width="${totalWidth}" height="20" fill="#555"/>
  <rect x="${leftWidth}" width="${rightWidth}" height="20" fill="${color}"/>
  <rect width="${totalWidth}" height="20" fill="url(#s)"/>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="${leftWidth / 2}" y="14">${escapeXml(leftText)}</text>
    <text x="${leftWidth + rightWidth / 2}" y="14">${escapeXml(rightText)}</text>
  </g>
</svg>`;
}

function classify(
  report: ComplianceReport,
  rightLabel: string,
  tierMode: boolean,
): { status: 'pass' | 'warn' | 'fail'; message: string; color: string } {
  if (tierMode) {
    switch (report.summary.tier) {
      case 'FULL_FEATURED':
        return { status: 'pass', message: rightLabel, color: '#4c1' };
      case 'RECOMMENDED':
        return { status: 'pass', message: rightLabel, color: '#97ca00' };
      case 'MANDATORY':
        return { status: 'warn', message: rightLabel, color: '#dfb317' };
      case 'NON_COMPLIANT':
        return { status: 'fail', message: rightLabel, color: '#e05d44' };
    }
  }

  const mustFailed = report.checks.some((c) => c.status === 'fail' && c.severity === 'must');
  if (mustFailed) return { status: 'fail', message: 'failing', color: '#e05d44' };

  const anyWarn = report.checks.some((c) => c.status === 'warn' || c.status === 'fail');
  if (anyWarn) return { status: 'warn', message: `${rightLabel} (warn)`, color: '#dfb317' };

  return { status: 'pass', message: rightLabel, color: '#4c1' };
}

function tierLabel(tier: ComplianceTier): string {
  switch (tier) {
    case 'FULL_FEATURED':
      return 'full-featured';
    case 'RECOMMENDED':
      return 'recommended';
    case 'MANDATORY':
      return 'mandatory';
    case 'NON_COMPLIANT':
      return 'non-compliant';
  }
}

function textWidth(s: string): number {
  return s.length * 7;
}

function escapeXml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
