import test from 'node:test';
import assert from 'node:assert/strict';
import { createSharedFiles } from '../tools/browser-vm/shared-files.mjs';
function fixture({capacityBytes=128*1024*1024,downloadIdleMs=30000}={}) {
 const nodes=[{mode:0x4000,direntries:new Map(),qid:{path:0,version:0},size:0,nlinks:1}], data={};let running=true;
 const fs={inodes:nodes,inodedata:data,mounts:[],
  CreateFile(name,parent){const id=nodes.length;nodes.push({mode:0x8000,direntries:new Map(),qid:{path:id,version:0},size:0,nlinks:1});nodes[parent].direntries.set(name,id);return id;},
  CreateDirectory(name,parent){const id=this.CreateFile(name,parent);nodes[id].mode=0x4000;return id;},
  Unlink(parent,name){const id=nodes[parent].direntries.get(name);if(nodes[id].mode===0x4000&&nodes[id].direntries.size)return -39;nodes[parent].direntries.delete(name);nodes[id].nlinks--;return 0;},
  async Rename(parent,name,dest,next){const id=nodes[parent].direntries.get(name);nodes[parent].direntries.delete(name);nodes[dest].direntries.set(next,id);nodes[id].qid.version++;return 0;},
  async Write(id,offset,count,bytes){await Promise.resolve();data[id]=new Uint8Array(bytes);nodes[id].size=count;},
 };
 const machine={fs9p:fs,is_running:()=>running,async stop(){running=false;},run(){running=true;}};
 const files=createSharedFiles({machine,capacityBytes,downloadIdleMs});
 return {files,fs,nodes,data,machine,get running(){return running;},link(name,target){const id=fs.CreateFile(name,0);nodes[id].mode=0xa000;nodes[id].symlink=target;return id;}};
}
const bytes=text=>new TextEncoder().encode(text);
test('real adapter contract: create/read/CAS/edit/rename/delete; bounded numeric pagination',async()=>{
 const f=fixture();await f.files.request({op:'mkdir',path:'/docs'});
 await f.files.request({op:'upload',path:'/docs/a.txt',bytes:bytes('中文')});
 const read=await f.files.request({op:'readText',path:'/docs//./a.txt'});assert.equal(read.text,'中文');
 await f.files.request({op:'saveText',path:'/docs/a.txt',version:read.version,text:'更新'});
 await assert.rejects(f.files.request({op:'saveText',path:'/docs/a.txt',version:read.version,text:'stale'}),/FILE_CONFLICT/);
 await f.files.request({op:'rename',path:'/docs/a.txt',destination:'/docs/b.txt'});
 assert.equal(new TextDecoder().decode((await f.files.request({op:'download',path:'/docs/b.txt'})).bytes),'更新');
 await f.files.request({op:'remove',path:'/docs/b.txt'});await f.files.request({op:'remove',path:'/docs'});
 for(let i=0;i<23;i++)await f.files.request({op:'mkdir',path:'/d'+String(i).padStart(2,'0')});
 const page=await f.files.request({op:'list',path:'/',page:2,pageSize:20});assert.equal(page.total,23);assert.equal(page.entries.length,3);assert.equal(page.entries[0].name,'d20');
 assert.equal((await f.files.request({op:'list',path:'/',page:99,pageSize:20})).page,2);assert.equal(f.running,true);
 for(const size of [50,100])assert.equal((await f.files.request({op:'list',path:'/',page:1,pageSize:size})).entries.length,23);
});
test('guest modification invalidates content version; no overwrite or nonempty/ancestor moves',async()=>{
 const f=fixture();await f.files.request({op:'upload',path:'/a',bytes:bytes('one')});const read=await f.files.request({op:'readText',path:'/a'});
 const id=f.fs.inodes[0].direntries.get('a');await f.fs.Write(id,0,3,bytes('two'));
 await assert.rejects(f.files.request({op:'saveText',path:'/a',version:read.version,text:'lost'}),/FILE_CONFLICT/);
 await assert.rejects(f.files.request({op:'upload',path:'/a',bytes:bytes('lost')}),/FILE_EXISTS/);
 await f.files.request({op:'mkdir',path:'/dir'});await f.files.request({op:'mkdir',path:'/dir/sub'});
 await assert.rejects(f.files.request({op:'rename',path:'/a',destination:'/dir'}),/FILE_EXISTS/);
 await assert.rejects(f.files.request({op:'remove',path:'/dir'}),/DIRECTORY_NOT_EMPTY/);
 await assert.rejects(f.files.request({op:'rename',path:'/dir',destination:'/dir/sub/move'}),/INVALID_PATH/);
});
test('path traversal and escaping/cyclic symlinks rejected; safe links work and removal unlinks only link',async()=>{
 const f=fixture();await f.files.request({op:'upload',path:'/a',bytes:bytes('safe')});f.link('safe','/mnt/work/a');f.link('escape','/etc/passwd');f.link('up','../a');f.link('cycle','cycle');
 assert.equal((await f.files.request({op:'readText',path:'/safe'})).text,'safe');
 for(const path of ['/../a','/escape','/up','/cycle','/a\\b','/a\0','relative'])await assert.rejects(f.files.request({op:'readText',path}),/INVALID_PATH|SYMLINK_ESCAPE|SYMLINK_LOOP/);
 await f.files.request({op:'remove',path:'/safe'});assert.equal((await f.files.request({op:'readText',path:'/a'})).text,'safe');
});
test('text/upload/quota/UTF8 bounds checked without partial writes',async()=>{
 const f=fixture({capacityBytes:1024});await f.files.request({op:'upload',path:'/a',bytes:bytes('old')});
 await assert.rejects(f.files.request({op:'upload',path:'/huge',bytes:new Uint8Array(20*1024*1024+1)}),/FILE_TOO_LARGE/);
 await assert.rejects(f.files.request({op:'upload',path:'/space',bytes:new Uint8Array(1024)}),/NO_SPACE/);
 assert.equal((await f.files.request({op:'list',path:'/'})).total,1);
 const read=await f.files.request({op:'readText',path:'/a'});
 await assert.rejects(f.files.request({op:'saveText',path:'/a',version:read.version,text:'字'.repeat(350000)}),/FILE_TOO_LARGE/);
 await f.files.request({op:'upload',path:'/binary',bytes:new Uint8Array([255])});await assert.rejects(f.files.request({op:'readText',path:'/binary'}),/NOT_UTF8/);
 const large=fixture();await large.files.request({op:'upload',path:'/large',bytes:new Uint8Array(1024*1024+1)});await assert.rejects(large.files.request({op:'readText',path:'/large'}),/FILE_TOO_LARGE/);
});
test('only one request; pending guest writes settle before CAS; close never resumes guest',async()=>{
 const f=fixture();await f.files.request({op:'upload',path:'/a',bytes:bytes('old')});const read=await f.files.request({op:'readText',path:'/a'});
 const writing=f.fs.Write(1,0,3,bytes('new'));const saving=f.files.request({op:'saveText',path:'/a',version:read.version,text:'overwrite'});
 await assert.rejects(f.files.request({op:'list',path:'/'}),/FILES_BUSY/);await writing;await assert.rejects(saving,/FILE_CONFLICT/);
 let release;f.machine.stop=()=>new Promise(r=>{release=r;});const pending=f.files.request({op:'list',path:'/'});f.files.close();release();await assert.rejects(pending,/FILES_CLOSED/);
 await assert.rejects(f.files.request({op:'list',path:'/'}),/FILES_CLOSED/);
});

test('a failed pause never mutates files or resumes a guest of unknown state',async()=>{
 const f=fixture();let runs=0;
 f.machine.stop=async()=>{throw Error('STOP_FAILED');};f.machine.run=()=>{runs++;};
 await assert.rejects(f.files.request({op:'mkdir',path:'/never'}),/STOP_FAILED/);
 assert.equal(runs,0);assert.equal(f.nodes[0].direntries.has('never'),false);f.files.close();
});

test('Worker file protocol owns uploads and rejects oversized or malformed receipts',async()=>{
 const {copyFileRequest,validFileResult,TEXT_LIMIT}=await import('../tools/browser-vm/file-protocol.mjs');
 const source=bytes('private');const request=copyFileRequest({op:'upload',path:'/a',bytes:source});source.fill(0);
 assert.equal(new TextDecoder().decode(request.bytes),'private');
 assert.throws(()=>copyFileRequest({op:'readText',path:'/a',unexpected:true}),/INVALID_FILE_OPERATION/);
 assert.equal(validFileResult({op:'readText'},{text:'x'.repeat(TEXT_LIMIT+1),version:'v'}),false);
 assert.equal(validFileResult({op:'download'},{bytes:new Uint8Array(20*TEXT_LIMIT+1)}),false);
 assert.equal(validFileResult({op:'list'},{path:'/',page:1,pageSize:20,total:21,pages:2,entries:Array.from({length:21},()=>({name:'a',type:'file',bytes:0}))}),false);
 assert.equal(validFileResult({op:'mkdir'},{ok:false}),false);
});

test('remove releases unreferenced buffers but preserves data owned by a guest fid',async()=>{
 const f=fixture({capacityBytes:4});
 f.machine.v86={cpu:{devices:{virtio_9p:{fids:[]}}}};
 f.fs.CloseInode=async id=>{delete f.data[id];f.nodes[id].size=0;};
 await f.files.request({op:'upload',path:'/a',bytes:bytes('1234')});
 await f.files.request({op:'remove',path:'/a'});
 await f.files.request({op:'upload',path:'/b',bytes:bytes('5678')});
 const id=f.nodes[0].direntries.get('b');f.machine.v86.cpu.devices.virtio_9p.fids.push({inodeid:id});
 await assert.rejects(f.files.request({op:'remove',path:'/b'}),/FILE_IN_USE/);assert.equal(new TextDecoder().decode(f.data[id]),'5678');
 assert.equal(f.nodes[0].direntries.get('b'),id);
 await assert.rejects(f.files.request({op:'upload',path:'/c',bytes:bytes('x')}),/NO_SPACE/);
 f.files.close();
});


test('large download is sequential bounded copies and holds the guest until explicit release',async()=>{
 const f=fixture();const id=f.fs.CreateFile('large',0);f.data[id]=new Uint8Array(21*1024*1024+3).fill(42);f.nodes[id].size=f.data[id].length;
 const start=await f.files.request({op:'downloadBegin',path:'/large'});assert.equal(start.size,f.data[id].length);assert.equal(start.chunkSize,1048576);assert.equal(f.running,false);
 await assert.rejects(f.files.request({op:'mkdir',path:'/blocked'}),/FILES_BUSY/);
 await assert.rejects(f.files.request({op:'downloadChunk',path:'/large',token:start.token,offset:1}),/INVALID_FILE_OPERATION/);
 let offset=0;while(offset<start.size){const result=await f.files.request({op:'downloadChunk',path:'/large',token:start.token,offset});assert.equal(result.offset,offset);assert.ok(result.bytes.length<=1048576);assert.equal(result.bytes[0],42);assert.notEqual(result.bytes.buffer,f.data[id].buffer);offset+=result.bytes.length;assert.equal(result.done,offset===start.size);}
 assert.equal(f.running,false);await f.files.request({op:'downloadEnd',path:'/large',token:start.token});assert.equal(f.running,true);f.files.close();
});
test('download expiry, wrong scope and owner close release bounded state without resuming a closed VM',async()=>{
 const f=fixture({downloadIdleMs:15});await f.files.request({op:'upload',path:'/a',bytes:bytes('abc')});const start=await f.files.request({op:'downloadBegin',path:'/a'});
 await assert.rejects(f.files.request({op:'downloadChunk',path:'/other',token:start.token,offset:0}),/FILE_DOWNLOAD_EXPIRED/);
 await new Promise(r=>setTimeout(r,35));assert.equal(f.running,true);await assert.rejects(f.files.request({op:'downloadChunk',path:'/a',token:start.token,offset:0}),/FILE_DOWNLOAD_EXPIRED/);
 const next=await f.files.request({op:'downloadBegin',path:'/a'});assert.notEqual(next.token,start.token);f.files.close();await new Promise(r=>setTimeout(r,25));assert.equal(f.running,false);
});
test('stream protocol rejects invalid offsets, huge chunks and malformed begin receipts',async()=>{
 const {copyFileRequest,validFileResult}=await import('../tools/browser-vm/file-protocol.mjs');
 assert.deepEqual(copyFileRequest({op:'downloadBegin',path:'/a'}),{op:'downloadBegin',path:'/a'});
 for(const offset of [-1,1.5,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>copyFileRequest({op:'downloadChunk',path:'/a',token:'token',offset}),/INVALID_FILE_OPERATION/);
 assert.equal(validFileResult({op:'downloadBegin'},{token:'token',size:30*1024*1024,chunkSize:1048576}),true);
 assert.equal(validFileResult({op:'downloadBegin'},{token:'token',size:-1,chunkSize:1048576}),false);
 assert.equal(validFileResult({op:'downloadChunk',offset:0},{offset:1,bytes:new Uint8Array(1),done:false}),false);
 assert.equal(validFileResult({op:'downloadChunk',offset:0},{offset:0,bytes:new Uint8Array(1048577),done:false}),false);
});

test('submission-only read rejects every symlink including hidden-target aliases and enforces 128 KiB before copying',async()=>{
 const f=fixture();await f.files.request({op:'mkdir',path:'/.hidden'});await f.files.request({op:'upload',path:'/.hidden/key.txt',bytes:bytes('sensitive')});f.link('alias.txt','/mnt/work/.hidden/key.txt');f.link('directory','/mnt/work/.hidden');
 for(const path of ['/.hidden/key.txt','/alias.txt','/directory/key.txt'])await assert.rejects(f.files.request({op:'readSubmissionText',path}),/INVALID_PATH/);
 await f.files.request({op:'upload',path:'/valid.txt',bytes:bytes('review only')});const receipt=await f.files.request({op:'readSubmissionText',path:'/valid.txt'});assert.equal(receipt.text,'review only');assert.ok(receipt.version);
 await f.files.request({op:'upload',path:'/large.txt',bytes:new Uint8Array(131073)});await assert.rejects(f.files.request({op:'readSubmissionText',path:'/large.txt'}),/FILE_TOO_LARGE/);assert.equal(f.running,true);f.files.close();
});

test('asset import reads a bounded binary snapshot but rejects hidden files and every symlink',async()=>{
 const f=fixture();const raw=new Uint8Array([0,255,37,80,68,70]);await f.files.request({op:'upload',path:'/report.pdf',bytes:raw});
 const result=await f.files.request({op:'readSubmissionAsset',path:'/report.pdf',maxBytes:6});assert.deepEqual(result.bytes,raw);
 result.bytes[0]=99;assert.equal((await f.files.request({op:'readSubmissionAsset',path:'/report.pdf',maxBytes:6})).bytes[0],0);
 await assert.rejects(f.files.request({op:'readSubmissionAsset',path:'/report.pdf',maxBytes:5}),/FILE_TOO_LARGE/);
 for(const maxBytes of [0,-1,1.5,20*1024*1024+1,undefined])await assert.rejects(f.files.request({op:'readSubmissionAsset',path:'/report.pdf',maxBytes}),/INVALID_FILE_OPERATION/);
 await f.files.request({op:'upload',path:'/.private.pdf',bytes:raw});f.link('alias.pdf','/mnt/work/report.pdf');
 await f.files.request({op:'mkdir',path:'/folder'});await f.files.request({op:'upload',path:'/folder/a.pdf',bytes:raw});f.link('alias-folder','/mnt/work/folder');
 for(const path of ['/.private.pdf','/alias.pdf','/alias-folder/a.pdf'])await assert.rejects(f.files.request({op:'readSubmissionAsset',path,maxBytes:6}),/INVALID_PATH/);
 assert.equal(f.running,true);
});
