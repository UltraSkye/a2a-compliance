import { CHECK_CATALOG } from './catalog.js';
import type { CheckResult } from './report.js';

/**
 * Fill in `category` and `specRef` from the catalog for any check whose
 * id is known. Assertion sites only emit id/title/severity/status/message
 * — metadata lives centrally so reporters, filters, and the `explain`
 * CLI command all read from one place.
 *
 * Values already present on the check take precedence over the catalog:
 * a probe that deliberately emits a non-default severity (capability
 * promotion) is never overridden here.
 */
export function decorate(check: CheckResult): CheckResult {
  const meta = CHECK_CATALOG[check.id];
  if (!meta) return check;
  const ref = check.specRef ?? meta.specRef;
  return {
    ...check,
    category: check.category ?? meta.category,
    ...(ref ? { specRef: ref } : {}),
  };
}

export function decorateAll(checks: CheckResult[]): CheckResult[] {
  return checks.map(decorate);
}
