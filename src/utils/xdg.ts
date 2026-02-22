import { join } from "path";
import { mkdirSync } from "fs";

export function getCacheDir(): string {
  const xdgCache = process.env.XDG_CACHE_HOME;
  const base = xdgCache || join(process.env.HOME || "~", ".cache");
  const dir = join(base, "nota");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function getCachePath(): string {
  return join(getCacheDir(), "cache.json");
}
