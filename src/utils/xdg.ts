import { join } from "path";
import { mkdirSync } from "fs";
import { homedir } from "os";

export function getCacheDir(): string {
  const xdgCache = process.env.XDG_CACHE_HOME;
  const base = xdgCache || join(process.env.HOME || homedir(), ".cache");
  const dir = join(base, "nota");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function getCachePath(): string {
  return join(getCacheDir(), "cache.json");
}

export function getPagesDir(): string {
  const dir = join(getCacheDir(), "pages");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function getBlocksDir(): string {
  const dir = join(getCacheDir(), "blocks");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function getSearchesDir(): string {
  const dir = join(getCacheDir(), "searches");
  mkdirSync(dir, { recursive: true });
  return dir;
}
