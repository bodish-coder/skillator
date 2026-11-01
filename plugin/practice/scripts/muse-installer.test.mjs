// Run only extracted Muse functions, never the full installer or a real Muse.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, delimiter } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = resolve(import.meta.dirname, '../..');
const q = s => "'" + s.replaceAll("'", "'\\''") + "'";
const psq = s => "'" + s.replaceAll("'", "''") + "'";
const shell = process.platform === 'win32' ? join(process.env.ProgramFiles, 'Git/usr/bin/sh.exe') : '/bin/sh';
const powershell = process.platform === 'win32' ? join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe') : 'pwsh';
const fake = `import fs from 'node:fs';
const file=process.env.MUSE_STATE, s=JSON.parse(fs.readFileSync(file)), a=process.argv.slice(2);
s.calls.push(a); fs.writeFileSync(file,JSON.stringify(s));
if(process.env.MUSE_NO_AUTO_UPDATE!=='1') process.exit(98);
const op=a[1];
if(op==='list') {
 if(s.mode==='list-fail') process.exit(2);
 if(s.mode==='malformed') { console.log('{bad'); process.exit(0); }
 if(s.mode==='bad-shape') { console.log('{}'); process.exit(0); }
 const record=s.record && (s.mode==='post-mismatch' && s.calls.length>1 ? {...s.record,version:'0.0.0'} : s.record);
 if(s.mode==='source-mismatch' && s.calls.length>1) record.source.path+='-wrong';
 console.log(JSON.stringify({plugins:record?[{record,active_scope:'installed-plugin'}]:[{record:{id:'other'},plugin:{id:'skillator'}}]}));
} else if(op==='remove') { if(s.mode==='remove-fail') process.exit(2); s.record=null;
} else if(op==='install') {
 if(s.mode==='install-fail' && a[2].replaceAll('\\\\','/')===s.selected.replaceAll('\\\\','/')) { console.error('fixture install rejected'); process.exit(2); }
 const manifest=JSON.parse(fs.readFileSync(a[2]+'/.muse-plugin/plugin.json'));
 s.record={id:'skillator',version:manifest.version,enabled:true,scope:a[a.indexOf('--scope')+1] || 'user',source:{provenance:'native-local',path:a[2]}};
} else if(op==='update') {
 if(s.mode==='update-fail') process.exit(2);
 if(s.mode!=='stale' && s.record.source.provenance==='native-local') s.record.version=JSON.parse(fs.readFileSync(s.record.source.path+'/.muse-plugin/plugin.json')).version;
} else process.exit(97);
fs.writeFileSync(file,JSON.stringify(s));`;

for (const host of ['ps1', 'sh']) {
 for (const scenario of ['migrate','same','normalized','fresh','list-fail','malformed','bad-shape','bad-manifest','remove-fail','install-fail','update-fail','stale','post-mismatch','source-mismatch','marketplace','unknown','disabled','project','unsupported-scope','dry','absent', ...(host==='sh'?['no-node']:[])]) {
  test(`${host}: ${scenario}`, () => {
   const dir=mkdtempSync(join(tmpdir(),'muse isolated '));
   try {
    const selected=join(dir,'selected café'), old=join(dir,'old cache');
    for (const [p,version] of [[selected,'4.23.0'],[old,'4.22.0']]) {mkdirSync(join(p,'.muse-plugin'),{recursive:true});writeFileSync(join(p,'.muse-plugin/plugin.json'),JSON.stringify({name:'skillator',version}));}
    const record={id:'skillator',version:'4.22.0',enabled:true,source:{provenance:'native-local',path:old}};
    if(['same','stale','update-fail'].includes(scenario)) record.source.path=selected;
    if(scenario==='normalized') record.source.path=process.platform==='win32'?'\\\\?\\'+selected+'\\':selected+'/';
    if(scenario==='bad-manifest') writeFileSync(join(selected,'.muse-plugin/plugin.json'),'{bad');
    if(scenario==='marketplace') record.source.provenance='marketplace-user-added';
    if(scenario==='unknown') record.source.provenance='unknown';
    if(scenario==='disabled') record.enabled=false;
    if(scenario==='project') record.scope='project';
    if(scenario==='unsupported-scope') record.scope='other';
    const state=join(dir,'state.json');writeFileSync(state,JSON.stringify({record:scenario==='fresh'?null:record,selected,calls:[],mode:scenario}));
    const stub=join(dir,'fake.mjs');writeFileSync(stub,fake);
    const cli=join(dir,host==='ps1'?'muse.ps1':'muse');
    writeFileSync(cli,host==='ps1'?`& ${psq(process.execPath)} ${psq(stub)} @args\nexit $LASTEXITCODE\n`:`#!/bin/sh\nexec ${q(process.execPath.replaceAll('\\','/'))} ${q(stub.replaceAll('\\','/'))} "$@"\n`);chmodSync(cli,0o755);
    const source=readFileSync(join(root,`install.${host}`),'utf8');
    const body=host==='ps1'?source.slice(source.indexOf('function Write-Muse {'),source.indexOf('# Write-AgyExt')):source.slice(source.indexOf('put_muse() {'),source.indexOf('\n# put_agy_ext'));
    assert(body.includes(host==='ps1'?'function Write-Muse':'put_muse()'));
    const runner=join(selected,`runner.${host}`);
    const shellRoot=selected.replaceAll('\\','/').replace(/^([A-Za-z]):/,(_,drive)=>'/'+drive.toLowerCase());
    writeFileSync(runner,host==='ps1'?`$ErrorActionPreference='Stop'\n$DryRun=$${scenario==='dry'}\n${body}\ntry { Write-Muse } finally { if ($env:MUSE_NO_AUTO_UPDATE -ne 'original') { throw 'environment leaked' } }\n`:`set -eu\nroot=${q(shellRoot)}\ndry=${q(scenario==='dry'?'1':'')}\n${body}\nput_muse\n[ "$MUSE_NO_AUTO_UPDATE" = original ]\n`,'utf8');
    // No user CLI directories on PATH: even a regression in fallback discovery
    // cannot reach the real Muse. Explicit fake CLI and isolated homes always.
    const safePath=(scenario==='no-node'?[dir]:[dir, dirname(process.execPath), dirname(shell), ...(process.platform==='win32'?[join(process.env.SystemRoot,'System32')]:['/usr/bin','/bin'])]).join(delimiter);
    const env={...process.env,PATH:safePath,HOME:dir,USERPROFILE:dir,SKILLATOR_MUSE:scenario==='absent'?join(dir,'nonexistent'):cli,MUSE_STATE:state,MUSE_NO_AUTO_UPDATE:'original'};
    const result=spawnSync(host==='ps1'?powershell:shell,host==='ps1'?['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',runner]:[runner],{env,encoding:'utf8',timeout:15000});
    const out=result.stdout+result.stderr, end=JSON.parse(readFileSync(state)), ops=end.calls.map(a=>a[1]);
    if(['dry','absent'].includes(scenario)) {assert.equal(result.status,0,out);assert.deepEqual(ops,[]);return;}
    if(scenario==='no-node') { assert.notEqual(result.status,0,out); assert.match(out,/Node is required/); assert.deepEqual(ops,[]); return; }
    if(['migrate','same','normalized','fresh'].includes(scenario)) {assert.equal(result.status,0,out);assert.equal(end.record.version,'4.23.0',out);assert.equal(end.record.source.path.replaceAll('\\','/').replace(/^\/\/\?\//,'').replace(/\/$/,''),selected.replaceAll('\\','/'));}
    else {assert.notEqual(result.status,0,out);assert(!out.includes('* Muse plugin skillator updated'),out);}
    if(['same','normalized'].includes(scenario)) assert.deepEqual(ops,['list','update','list']);
    if(['list-fail','malformed','bad-shape','unknown','disabled','project','unsupported-scope'].includes(scenario)) assert.deepEqual(ops,['list']);
    if(scenario==='bad-manifest') assert.deepEqual(ops,[]);
    if(scenario==='marketplace') assert.deepEqual(ops,['list','update','list']);
    if(scenario==='install-fail') {assert.deepEqual(ops,['list','remove','install','install']);assert.equal(end.record.source.path,old);}
    if(scenario==='remove-fail') assert.deepEqual(ops,['list','remove']);
    assert(!end.calls.flat().includes('--delete-data'));assert(!ops.includes('approve'));
   } finally {rmSync(dir,{recursive:true,force:true});}
  });
 }
}
