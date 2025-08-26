// worker/src/services/sqldump.ts
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { resolve as pathResolve } from "node:path";
import { createWriteStream, promises as fs } from "node:fs";
import { spawn } from "node:child_process";

// Spawn a shell pipeline safely: we only construct strings from our controlled args
export function spawnPipe(cmd: string, env: NodeJS.ProcessEnv, timeoutMs?: number) {
  // run through /bin/sh -c (or busybox/ash on alpine) so we can pipe to gzip
  const proc = spawn("sh", ["-c", cmd], {
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });

  let timedOut = false;
  let timeout: NodeJS.Timeout | undefined;
  if (timeoutMs && timeoutMs > 0) {
    timeout = setTimeout(() => {
      timedOut = true;
      killTree(proc);
    }, timeoutMs);
  }

  return { proc, done: new Promise<void>((resolve, reject) => {
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", (e) => {
      if (timeout) clearTimeout(timeout);
      reject(e);
    });
    proc.on("close", (code) => {
      if (timeout) clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(timedOut ? `Command timed out after ${timeoutMs}ms` : `Command failed (exit ${code}): ${stderr.trim()}`));
    });
  })};
}


// ---------- Tiny quoting helper ----------
// We keep it simple: wrap with single quotes and escape existing single quotes.
export function shellQuote(s: string) {
  if (s === "") return "''";
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

// ---------- Helpers ----------
export function tmpPath(dumptype : string , ext = 'bk') : string {
  const id = randomBytes(8).toString("hex");
  return pathResolve(tmpdir(), `${dumptype}-${id}${ext}`);
}

export function gzipArgs(level?: number) {
  const lvl = Math.min(9, Math.max(1, level ?? 6));
  return ["-c", `gzip -${lvl}`]; // used with `sh -c "cmd | gzip -6"`
}

export async function fileExists(p: string) {
  try { await fs.access(p); return true; } catch { return false; }
}

export function killTree(proc: ReturnType<typeof spawn>) {
  try { process.platform === "win32" ? proc.kill("SIGTERM") : process.kill(-proc.pid!, "SIGTERM"); } catch {}
}

