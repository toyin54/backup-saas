// worker/src/services/sqldump.ts
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { resolve as pathResolve } from "node:path";
import { createWriteStream, promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import {
  spawnPipe,
  shellQuote,
  tmpPath,
  gzipArgs,
  fileExists,
  killTree,
} from "../helper";

export type PGConfig = {
  host: string;
  port?: number;
  database: string;
  user: string;
  password?: string;
  sslMode?:
    | "disable"
    | "allow"
    | "prefer"
    | "require"
    | "verify-ca"
    | "verify-full";
  includeTables?: string[]; // schema.table
  excludeTables?: string[]; // schema.table
  schemaOnly?: boolean;
  dataOnly?: boolean;
  extraArgs?: string[];
  gzipLevel?: number;
  timeoutMs?: number;
};
export async function pgDump(cfg: PGConfig): Promise<string> {
  const outPath = tmpPath("pgdump", ".sql.gz");
  const port = cfg.port ?? 5432;
  const ssl = cfg.sslMode ? `--sslmode=${cfg.sslMode}` : "";
  const include = (cfg.includeTables ?? []).flatMap((t) => ["-t", shellQuote(t)]);
  const exclude = (cfg.excludeTables ?? []).flatMap((t) => ["-T", shellQuote(t)]);
  const mode = cfg.schemaOnly
    ? ["--schema-only"]
    : cfg.dataOnly
    ? ["--data-only"]
    : [];
  const extras = cfg.extraArgs ?? [];


    const cmd = [
    "mysqldump",
    "-h", shellQuote(cfg.host),
    "-P", String(cfg.port),
    ssl,
    ...mode,
    ...include,
    ...exclude,
    ...extras,
    shellQuote(cfg.database),
  ]
  .filter(Boolean)
  .join(" ");

  const pipeline  = `${cmd} | ${gzipArgs(cfg.gzipLevel).join(" ")}` 
  const env: NodeJS.ProcessEnv = {}
if (cfg.password) env.PGPASSWORD = cfg.password;
  const {proc , done} = spawnPipe(pipeline , env , cfg.timeoutMs) 

  const outputStream = createWriteStream(outPath);

  proc.stdout!.pipe(outputStream);
  try {
    await done;
    await new Promise<void>((res, rej) => {
      outputStream.on("error", rej);
      outputStream.on("finish", () => res());
    });
  } catch (e) {
    try { if (await fileExists(outPath)) await fs.unlink(outPath); } catch {}
    throw e;
  }
  return outPath;

}
