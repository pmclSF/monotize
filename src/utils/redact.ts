/**
 * Redact credentials from URLs and strings.
 *
 * Prevents tokens, passwords, and usernames from leaking
 * into logs, error messages, plan files, or disk output.
 */

/**
 * Regex matching credentials embedded in URLs:
 *   https://user:token@host  →  https://***@host
 *   https://token@host       →  https://***@host
 *   git://user:pass@host     →  git://***@host
 */
const CREDENTIAL_URL_RE =
  /(?<=\/\/)[^/@\s]+@/g;

/**
 * Known environment-variable token patterns that should never appear in output.
 * Matches GitHub PATs (ghp_, gho_, ghu_, ghs_, ghr_), GitLab tokens (glpat-),
 * and npm tokens (npm_).
 */
const TOKEN_PATTERNS = [
  /ghp_[A-Za-z0-9_]{36,}/g,
  /gho_[A-Za-z0-9_]{36,}/g,
  /ghu_[A-Za-z0-9_]{36,}/g,
  /ghs_[A-Za-z0-9_]{36,}/g,
  /ghr_[A-Za-z0-9_]{36,}/g,
  /glpat-[A-Za-z0-9\-_]{20,}/g,
  /npm_[A-Za-z0-9]{36,}/g,
];

/**
 * Strip credentials from a URL.
 *
 * Examples:
 *   https://user:ghp_abc123@github.com/o/r  →  https://***@github.com/o/r
 *   https://ghp_abc123@github.com/o/r       →  https://***@github.com/o/r
 *   git@github.com:owner/repo.git           →  git@github.com:owner/repo.git (unchanged, SSH)
 *   /local/path                              →  /local/path (unchanged)
 */
export function redactUrl(url: string): string {
  return url.replace(CREDENTIAL_URL_RE, '***@');
}

/**
 * Redact any known token patterns from an arbitrary string.
 * Useful for sanitizing error messages and log output.
 */
export function redactTokens(text: string): string {
  let result = text;
  for (const pattern of TOKEN_PATTERNS) {
    result = result.replace(pattern, '***');
  }
  return result;
}

/**
 * Fully redact a string: strip URL credentials and known tokens.
 */
export function redact(text: string): string {
  return redactTokens(redactUrl(text));
}
