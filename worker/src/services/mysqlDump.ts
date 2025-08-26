// worker/src/services/sqldump.ts
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { resolve as pathResolve } from "node:path";
import { createWriteStream, promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import { spawnPipe , 
    shellQuote , 
    tmpPath , 
    gzipArgs  , 
    fileExists , 
    killTree} from "../helper";

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



export async function dumpSQL(cfg: sqlParam) : Promise<string> {
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

  proc.stdout!.pipe(outputStream);

   await done;
  await new Promise<void>((res) => outputStream.on("finish", () => res()));
  return out;
}



