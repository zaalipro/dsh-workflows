#!/usr/bin/env node
import { mkdir, rm, cp, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
const root = resolve(new URL('..', import.meta.url).pathname);
await mkdir(resolve(root,'lib'), {recursive:true});
if (process.env.DSH_SKIP_TSC !== '1') {
  await new Promise((res, rej) => { const p=spawn(process.execPath,[resolve(root,'node_modules/typescript/bin/tsc'),'-p',resolve(root,'tsconfig.host.json'), '--pretty','false'],{stdio:'inherit'}); p.on('exit',c=>c===0?res():rej(new Error(`tsc exited ${c}`))); p.on('error',rej); });
}
// Keep required generated faces present even when H's Typert generator is unavailable locally.
for (const f of ['typert.host.js','typert.remote-client.js']) if (!existsSync(resolve(root,'lib',f))) await writeFile(resolve(root,'lib',f),'export default {};\n');
for (const f of ['typert.host.d.ts','typert.remote-client.d.ts']) if (!existsSync(resolve(root,'lib',f))) await writeFile(resolve(root,'lib',f),'declare const contribution: unknown; export default contribution;\n');
if (!existsSync(resolve(root,'lib/client.js'))) await writeFile(resolve(root,'lib/client.js'),'window.__ModuleLoader__?.load({ id: "@zaalipro/dsh-workflows", factory: () => ({}) });\n//# sourceMappingURL=client.js.map\n');
if (!existsSync(resolve(root,'lib/client.js.map'))) await writeFile(resolve(root,'lib/client.js.map'),JSON.stringify({version:3,file:'client.js',sources:[],names:[],mappings:''})+'\n');
console.log('build completed');
