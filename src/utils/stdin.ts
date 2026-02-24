/**
 * Returns true when stdin is connected to a pipe (not a terminal).
 * Use this to detect `cat file.md | nota ...` style invocations.
 */
export function isStdinPiped(): boolean {
  return !process.stdin.isTTY;
}

/**
 * Read all of stdin and return as a string.
 * Only call after confirming isStdinPiped() — blocks until EOF.
 */
export async function readStdin(): Promise<string> {
  return await Bun.stdin.text();
}
