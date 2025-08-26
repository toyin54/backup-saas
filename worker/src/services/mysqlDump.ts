// worker/src/services/sqldump.ts
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { resolve as pathResolve } from "node:path";
import { createWriteStream, promises as fs } from "node:fs";
import { spawn } from "node:child_process";

export type sqlParam = {
  host: string;
  port?: number; // default 3306
  database: string;
  user: string;
  password?: string; // via MYSQL_PWD env
  // Options
  includeTables?: string[]; // table names (no schema)
  excludeTables?: string[]; // table names
  routines?: boolean; // --routines
  triggers?: boolean; // --triggers (default true in mysqldump; we can force)
  events?: boolean; // --events
  noCreate?: boolean; // --no-create-info (data only)
  schemaOnly?: boolean; // --no-data
  extraArgs?: string[];
  gzipLevel?: number; // 1-9
  timeoutMs?: number;
};


const DEFAULT_CHUNK = 8 * 1024 * 1024; // 8MB gzip chunk


// Spawn a shell pipeline safely: we only construct strings from our controlled args
function spawnPipe(cmd: string, env: NodeJS.ProcessEnv, timeoutMs?: number) {
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
export async function dumpSQL(cfg: sqlParam) {
  const host = cfg.host;
  const port = cfg.port ?? 3306;
  const db = cfg.database;
  const user = cfg.user;
  const includeTables = cfg.includeTables ?? [];
  const excludeTables = (cfg.excludeTables ?? []).flatMap(t => ["--ignore-table", `${shellQuote(db)}.${shellQuote(t)}`]);
  const extras = cfg.extraArgs ?? [];

  const mode = cfg.schemaOnly ? ["--no-data"]
            : cfg.noCreate   ? ["--no-create-info"]
            : [];

  const triggers = cfg.triggers === false ? ["--skip-triggers"] : [];
  const routines = cfg.routines ? ["--routines"] : [];
  const events = cfg.events ? ["--events"] : [];


  // Build mysqldump cmd
  const cmd = [
    "mysqldump",
    "-h", shellQuote(host),
    "-P", String(port),
    "-u", shellQuote(user),
    "--single-transaction",
    "--skip-lock-tables",
    ...mode,
    ...triggers,
    ...routines,
    ...events,
    ...excludeTables,
    ...extras,
    shellQuote(db),
    ...includeTables.map(t => shellQuote(t)),
  ].join(" ");


  const pipeline = `${cmd} | ${gzipArgs(cfg.gzipLevel).join(" ")}` ;  
  const env: NodeJS.ProcessEnv = {}

  const {proc , done} = spawnPipe(pipeline , env , cfg.timeoutMs) 

  const ts = Date.now();
  const out = `/tmp/sql-${ts}.archive`;
  const outputStream = createWriteStream(out);
}



// ---------- Tiny quoting helper ----------
// We keep it simple: wrap with single quotes and escape existing single quotes.
function shellQuote(s: string) {
  if (s === "") return "''";
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

// ---------- Helpers ----------
function tmpPath(ext: string) {
  const id = randomBytes(8).toString("hex");
  return pathResolve(tmpdir(), `sqldump-${id}${ext}`);
}

function gzipArgs(level?: number) {
  const lvl = Math.min(9, Math.max(1, level ?? 6));
  return ["-c", `gzip -${lvl}`]; // used with `sh -c "cmd | gzip -6"`
}

async function fileExists(p: string) {
  try { await fs.access(p); return true; } catch { return false; }
}

function killTree(proc: ReturnType<typeof spawn>) {
  try { process.platform === "win32" ? proc.kill("SIGTERM") : process.kill(-proc.pid!, "SIGTERM"); } catch {}
}

