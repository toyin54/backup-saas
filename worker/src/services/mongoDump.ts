import { exec as _exec } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(_exec);



export type MongoConfig = {
  uri: string;
  db?: string;
  collections?: string[];
  compression?: "gzip" | "zstd";

}
export async function dumpMongo(cfg: MongoConfig) : Promise<string> {
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
