/**
 * Mask a token string, showing only the first 10 and last 4 characters.
 * Example: "secret_abc1234567xyz" → "secret_abc…7xyz"
 */
export function maskToken(token: string): string {
  return `${token.slice(0, 10)}…${token.slice(-4)}`;
}
