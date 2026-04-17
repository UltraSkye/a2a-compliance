// Redact credential-looking bits from URLs before they land in reports,
// error messages, or the JUnit/Badge artefacts. Agent operators often
// paste URLs with bearer tokens in query strings — if we preserve them
// verbatim, a shared report leaks those tokens.

const SECRET_QUERY_PARAMS = new Set([
  'token',
  'access_token',
  'api_key',
  'apikey',
  'key',
  'secret',
  'password',
  'auth',
  'authorization',
  'session',
  'sid',
  'cookie',
]);

/**
 * Strip `user:pass@` userinfo and replace any query-string parameters that
 * match a common secret name with `<redacted>`. Any input that isn't a
 * valid URL is returned unchanged.
 */
export function redactUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.username = '';
    u.password = '';
    for (const name of [...u.searchParams.keys()]) {
      if (SECRET_QUERY_PARAMS.has(name.toLowerCase())) {
        u.searchParams.set(name, '<redacted>');
      }
    }
    return u.toString();
  } catch {
    return raw;
  }
}

/**
 * Sanitise a free-text message string that might embed a URL with
 * credentials. Finds anything matching `https?://…` (bounded by whitespace
 * or quotes) and redacts that substring via redactUrl.
 */
export function redactInText(s: string): string {
  return s.replace(/https?:\/\/[^\s"'<>]+/gi, (match) => redactUrl(match));
}
