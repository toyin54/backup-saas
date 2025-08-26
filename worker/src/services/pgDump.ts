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
    


export type PGConfig = {

    user : string,
    host? : number,
    db : string
}


export async function pgDump(cfg : PGConfig){


}
