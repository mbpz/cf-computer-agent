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

import { runGuestCommand } from '../tools/browser-vm/acceptance/serial-command.mjs';
function serialMachine() {
 let listener, id;
 return {
  add_listener(_name, receive) { listener = receive; },
  remove_listener() { listener = undefined; },
  serial0_send(encoded) { id = encoded.match(/BEGIN:([a-f0-9]{16})/)[1]; },
  reply(output, exitCode) { for (const c of `\x1eBEGIN:${id}\x1f${output}\x1eEND:${id}:${exitCode}\x1f`) listener?.(c.charCodeAt(0)); },
  listening() { return Boolean(listener); },
 };
}
test('slow guest package installation can finish after 90 seconds without bypassing the serial exit result', async t => {
 t.mock.timers.enable({ apis: ['setTimeout'] });
 const machine = serialMachine(); let settled = false;
 const result = runGuestCommand(machine, 'apk add --no-cache git curl').then(value => { settled = true; return value; }, error => { settled = true; throw error; });
 const rejection = result.catch(() => {});
 t.mock.timers.tick(90001); await Promise.resolve();
 assert.equal(settled, false, 'a package download must not be aborted by the ordinary 90-second budget');
 machine.reply('OK: installed', 0);
 assert.deepEqual(await result, { output: 'OK: installed', exitCode: 0 });
 assert.equal(machine.listening(), false);
 await rejection;
});
test('stalled package installation fails at ten minutes and ordinary commands still fail at ninety seconds', async t => {
 t.mock.timers.enable({ apis: ['setTimeout'] });
 for (const [text, budget] of [['apk add --no-cache git curl', 600000], ['apk update', 90000], ['git --version', 90000]]) {
  const machine = serialMachine(); let settled = false;
  const result = runGuestCommand(machine, text).finally(() => { settled = true; });
  const rejection = assert.rejects(result, /Guest command timeout/);
  t.mock.timers.tick(budget - 1); await Promise.resolve();
  assert.equal(settled, false);
  t.mock.timers.tick(1); await rejection;
  assert.equal(machine.listening(), false);
 }
});
test('late guest installation failures retain their nonzero exit code', async t => {
 t.mock.timers.enable({ apis: ['setTimeout'] });
 const machine = serialMachine();
 const result = runGuestCommand(machine, 'apk add --no-cache git curl');
 result.catch(() => {});
 t.mock.timers.tick(100000);
 machine.reply('ERROR: download failed', 1);
 assert.deepEqual(await result, { output: 'ERROR: download failed', exitCode: 1 });
 assert.equal(machine.listening(), false);
});

// Shared fixed setup keeps browser and real-guest validation on the same repositories.
test('acceptance setup uses only approved NJU HTTPS repositories and retains CA/key checks', async () => {
 const { ACCEPTANCE_SETUP_COMMAND: setup } = await import('../tools/browser-vm/acceptance/commands.mjs');
 assert.equal(typeof setup,'string');
 assert.deepEqual(setup.match(/https:\/\/[^\\" ]+/g),[
  'https://mirrors.nju.edu.cn/alpine/v3.24/main',
  'https://mirrors.nju.edu.cn/alpine/v3.24/community',
 ]);
 assert.ok(setup.includes('test -s /etc/ssl/certs/ca-certificates.crt'));
 assert.ok(setup.includes('ls /etc/apk/keys'));
 assert.ok(setup.includes('udhcpc -i eth0 -n -q -t 3 -T 1'));
 assert.doesNotMatch(setup,/allow-untrusted|no-check-certificate/);
});
