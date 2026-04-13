import fs from "fs";
import { homedir } from "os";
import path from "path";
import { Environment } from "@mockoon/commons";

/**
 * Returns the default directory where Mockoon stores environment files.
 * Windows: %APPDATA%\mockoon\storage
 * Linux/macOS: ~/.config/mockoon/storage
 */
export function getDefaultMockoonDir(): string {
  if (process.platform === "win32") {
    return path.join(process.env["APPDATA"] ?? homedir(), "mockoon", "storage");
  }
  return path.join(homedir(), ".config", "mockoon", "storage");
}

/**
 * Returns extra directories from the MOCKOON_DATA_DIRS environment variable.
 * Paths are separated by semicolons (;).
 */
export function getExtraDataDirs(): string[] {
  const raw = process.env["MOCKOON_DATA_DIRS"];
  if (!raw) return [];
  return raw
    .split(";")
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => path.resolve(p));
}

/**
 * Scans a single directory for Mockoon environment JSON files.
 * Returns entries for each valid environment found; silently skips unreadable files.
 */
function scanDirForEnvironments(dir: string): Array<{ id: string; name: string; port: number; filePath: string }> {
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((file) => {
      const filePath = path.join(dir, file);
      try {
        const env: Environment = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        if (!env.uuid) return null;
        return { id: env.uuid, name: env.name, port: env.port, filePath };
      } catch {
        return null;
      }
    })
    .filter(Boolean) as Array<{ id: string; name: string; port: number; filePath: string }>;
}

/**
 * Returns a deduplicated summary of all environments found across the given directories.
 * Deduplication is based on environment UUID.
 */
export function listEnvironments(dirs: string[]): Array<{ id: string; name: string; port: number; filePath: string }> {
  const seen = new Set<string>();
  const results: Array<{ id: string; name: string; port: number; filePath: string }> = [];

  for (const dir of dirs) {
    for (const entry of scanDirForEnvironments(dir)) {
      if (!seen.has(entry.id)) {
        seen.add(entry.id);
        results.push(entry);
      }
    }
  }

  return results;
}

/** Reads and parses a single Mockoon environment from a JSON file */
export function readEnvironment(filePath: string): Environment {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as Environment;
}

/** Writes (creates or overwrites) a Mockoon environment JSON file */
export function writeEnvironment(filePath: string, env: Environment): void {
  fs.writeFileSync(filePath, JSON.stringify(env, null, 2), "utf-8");
}

/** Finds the file path of an environment by its UUID across all known directories, or returns null if not found */
export function findEnvironmentFile(dirs: string[], uuid: string): string | null {
  return listEnvironments(dirs).find((e) => e.id === uuid)?.filePath ?? null;
}
