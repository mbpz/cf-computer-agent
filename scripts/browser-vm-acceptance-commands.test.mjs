import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptPackages, acceptGit } from '../tools/browser-vm/acceptance/commands.mjs';
// These boundary tests protect failure/identity handling, not guest execution claims.
test('package acceptance cannot succeed after any guest nonzero exit or wrong version output',async()=>{
 for(const badStep of [0,1,2,3]){let n=0;await assert.rejects(acceptPackages(async()=>({exitCode:n++===badStep?1:0,output:'git version 2.54.0\ncurl 8.22.0'})),/Guest command failed/);assert.equal(n,badStep+1);}
 await assert.rejects(acceptPackages(async()=>({exitCode:0,output:'not installed'})),/version/);
 const commands=[];const result=await acceptPackages(async text=>{commands.push(text);return {exitCode:0,output:text==='git --version'?'git version 2.54.0':text==='curl --version'?'curl 8.22.0 (i686-alpine-linux-musl)':'OK'};});
 assert.equal(result.gitVersion,'git version 2.54.0');assert.equal(result.curlVersion,'curl 8.22.0 (i686-alpine-linux-musl)');assert.equal(commands[0],'apk update');assert.equal(commands[1],'apk add --no-cache git curl');
});
test('git acceptance requires clone then fetch, two commits and API repository identity',async()=>{
 const calls=[];const good=async text=>{calls.push(text);return {exitCode:0,output:text.includes('rev-parse')?'a'.repeat(40):text.includes('cat /tmp/lc-api.json')?'200\n{"full_name":"octocat/Hello-World"}':''};};
 const result=await acceptGit(good);assert.equal(result.commitBeforeFetch,'a'.repeat(40));assert.equal(result.commitAfterFetch,'a'.repeat(40));assert.equal(result.apiRepository,'octocat/Hello-World');assert.ok(calls[0].includes(' clone '));assert.ok(calls[2].includes(' fetch '));
 await assert.rejects(acceptGit(async text=>text.includes('cat /tmp/lc-api.json')?{exitCode:0,output:'200\n{"full_name":"evil/repo"}'}:good(text)),/identity/);
 await assert.rejects(acceptGit(async()=>({exitCode:0,output:'not a commit'})),/commit/);
});
