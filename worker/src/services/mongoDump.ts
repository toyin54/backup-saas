import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { resolve as pathResolve } from "node:path";
import { createWriteStream, promises as fs } from "node:fs";
import { spawn } from "node:child_process";

export async function dumpMongo(cfg: {
  uri: string;
  db?: string;
  collections?: string[];
  compression?: "gzip" | "zstd";
}) {
  const ts = Date.now();
  const out = `/tmp/mongo-${ts}.archive`; // we’ll pipe to gzip below
  // Build command
  const base = [`mongodump`, `--uri="${cfg.uri}"`, `--archive`];
  if (cfg.db) base.push(`--db=${cfg.db}`);
  if (cfg.collections?.length)
    cfg.collections.forEach((c) => base.push(`--collection=${c}`));

  // Compress to gzip file
  const archivePath = `${out}.gz`;
  const cmd = `${base.join(" ")} | gzip > ${archivePath}`;
  await exec(cmd);
  return archivePath;
}
