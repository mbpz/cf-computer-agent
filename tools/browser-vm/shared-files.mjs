// Pinned v86 0.5.458 in-memory host9p adapter. Never maps to host disk or shell.
// Install before machine.run(): guest async FS mutations are tracked so pausing
// the CPU also waits for already-issued 9p writes. No network-backed FS/mounts.
import { SUBMISSION_TEXT_LIMIT, TEXT_LIMIT, UPLOAD_LIMIT, DOWNLOAD_CHUNK_SIZE, copyFileRequest } from './file-protocol.mjs';
const encoder = new TextEncoder();
const fail = code => { throw new Error(code); };
const same = (a,b) => a.length === b.length && a.every((byte,i) => byte === b[i]);
function parts(path) {
  if (typeof path !== 'string' || !path.startsWith('/') || /[\\\x00-\x1f\x7f]/.test(path)
    || encoder.encode(path).length > 4096 || path.split('/').includes('..')) fail('INVALID_PATH');
  const result = path.split('/').filter(item => item && item !== '.');
  if (result.some(item => encoder.encode(item).length > 255)) fail('INVALID_PATH');
  return result;
}
export function createSharedFiles({ machine, capacityBytes = 128 * TEXT_LIMIT, downloadIdleMs = 30_000 }) {
  const fs = machine?.fs9p;
  if (!fs || !Array.isArray(fs.inodes) || !fs.inodedata || fs.mounts?.length
    || !Number.isSafeInteger(capacityBytes) || capacityBytes <= 0 || !Number.isSafeInteger(downloadIdleMs) || downloadIdleMs <= 0) fail('UNSUPPORTED_FILESYSTEM');
  let closed = false, busy = false, download;
  function releaseDownload() {
    const previous = download; download = undefined;
    if (!previous) return; clearTimeout(previous.timer);
    if (!closed && previous.resume) machine.run();
  }
  function renewDownload() {
    clearTimeout(download.timer); download.timer = setTimeout(releaseDownload, downloadIdleMs);
    download.timer.unref?.();
  }
  const versions = new Map(), pending = new Set(), originals = new Map();
  for (const name of ['Write','ChangeSize','Rename','CreateBinaryFile','DeleteData','OpenInode','CloseInode']) {
    if (typeof fs[name] !== 'function') continue;
    const original = fs[name]; originals.set(name, original);
    fs[name] = function(...args) {
      const result = original.apply(this,args);
      if (result?.then) {
        pending.add(result);
        result.then(() => pending.delete(result), () => pending.delete(result));
      }
      return result;
    };
  }
  function live() { if (closed) fail('FILES_CLOSED'); }
  function inode(id) {
    const node = fs.inodes[id];
    if (!node || node.status === 2 || node.status === 3 || node.mount_id !== undefined && node.mount_id >= 0
      || !Number.isSafeInteger(node.size) || node.size < 0) fail('UNSUPPORTED_FILESYSTEM');
    return node;
  }
  const type = node => ({16384:'directory',32768:'file',40960:'symlink'}[node.mode & 0xf000] ?? 'unsupported');
  function resolve(path, followFinal = true, submissionOnly = false) {
    let todo = parts(path), walked = [], id = 0, links = 0;
    while (todo.length) {
      const dir = inode(id); if (type(dir) !== 'directory') fail('NOT_DIRECTORY');
      const name = todo.shift();
      if (submissionOnly && name.startsWith('.')) fail('INVALID_PATH');
      const child = dir.direntries.get(name);
      if (child === undefined) fail('FILE_NOT_FOUND');
      const node = inode(child);
      if (submissionOnly && type(node) === 'symlink') fail('INVALID_PATH');
      if (type(node) === 'symlink' && (followFinal || todo.length)) {
        if (++links > 40) fail('SYMLINK_LOOP');
        const target = node.symlink;
        if (typeof target !== 'string' || !target || /[\\\x00-\x1f\x7f]/.test(target) || encoder.encode(target).length > 4096) fail('SYMLINK_ESCAPE');
        let base = [...walked], value = target;
        if (target.startsWith('/')) {
          if (target !== '/mnt/work' && !target.startsWith('/mnt/work/')) fail('SYMLINK_ESCAPE');
          base = []; value = target.slice('/mnt/work'.length);
        }
        for (const part of value.split('/')) {
          if (!part || part === '.') continue;
          if (part === '..') { if (!base.length) fail('SYMLINK_ESCAPE'); base.pop(); }
          else base.push(part);
        }
        todo = [...base,...todo]; walked = []; id = 0;
      } else { walked.push(name); id = child; }
    }
    return {id,node:inode(id),path:'/'+walked.join('/')};
  }
  function parent(path) {
    const names = parts(path), name = names.pop(); if (!name) fail('INVALID_PATH');
    const dir = resolve('/'+names.join('/')); if (type(dir.node) !== 'directory') fail('NOT_DIRECTORY');
    return {...dir,name};
  }
  function data(record, limit) {
    if (type(record.node) !== 'file') fail('NOT_FILE');
    if (record.node.size > limit) fail('FILE_TOO_LARGE');
    const bytes = fs.inodedata[record.id] ?? new Uint8Array();
    if (!(bytes instanceof Uint8Array) || bytes.length < record.node.size) fail('UNSUPPORTED_FILESYSTEM');
    return bytes.subarray(0,record.node.size);
  }
  function stamp(record) { return JSON.stringify([record.id,record.node.qid,record.node.mode,record.node.mtime,record.node.ctime]); }
  function room(bytes, previous = 0) {
    // v86 used_size does not account for guest writes. Measure actual allocated
    // buffers, including unlinked/open files, instead of trusting GetTotalSize().
    let used = 0;
    for (const value of Object.values(fs.inodedata)) { used += value.byteLength; if (!Number.isSafeInteger(used)) fail('NO_SPACE'); }
    if (used - previous + bytes > capacityBytes) fail('NO_SPACE');
  }
  function put(record, bytes) {
    // Synchronous pinned in-memory equivalent of set_data + ChangeSize. Allocation
    // and validation happen BEFORE mutation, avoiding truncate/write partial saves.
    fs.inodedata[record.id] = bytes;
    record.node.size = bytes.length; record.node.qid.version++;
    record.node.mtime = record.node.ctime = Math.floor(Date.now()/1000);
  }
  async function operate(input) {
    const {op,path} = input ?? {};
    if (op === 'list') {
      const record = resolve(path), pageSize = input.pageSize ?? 20, requested = input.page ?? 1;
      if (type(record.node) !== 'directory') fail('NOT_DIRECTORY');
      if (![20,50,100].includes(pageSize) || !Number.isSafeInteger(requested) || requested < 1) fail('INVALID_PAGE');
      const names = [...record.node.direntries.keys()].filter(name => name !== '.' && name !== '..').sort();
      const total = names.length, pages = Math.max(1,Math.ceil(total/pageSize)), page = Math.min(requested,pages);
      return {path:record.path,page,pageSize,total,pages,entries:names.slice((page-1)*pageSize,page*pageSize).map(name => {
        const node = inode(record.node.direntries.get(name)); return {name,type:type(node),bytes:node.size};
      })};
    }
    if (op === 'downloadBegin') {
      const record = resolve(path), bytes = data(record, Number.MAX_SAFE_INTEGER);
      download = { token: crypto.randomUUID(), path, bytes, offset: 0, resume: false };
      renewDownload();
      return {token: download.token, size: bytes.length, chunkSize: DOWNLOAD_CHUNK_SIZE};
    }
    if (op === 'readSubmissionAsset') {
      const record = resolve(path,true,true);
      return {bytes: new Uint8Array(data(record,input.maxBytes))};
    }
    if (op === 'readText' || op === 'readSubmissionText' || op === 'download') {
      const record = resolve(path,true,op === 'readSubmissionText'), bytes = new Uint8Array(data(record,op === 'readSubmissionText' ? SUBMISSION_TEXT_LIMIT : op === 'readText' ? TEXT_LIMIT : UPLOAD_LIMIT));
      if (op === 'download') return {bytes};
      let text; try { text = new TextDecoder('utf-8',{fatal:true}).decode(bytes); } catch { fail('NOT_UTF8'); }
      const version = crypto.randomUUID();
      if (versions.size >= 8) versions.delete(versions.keys().next().value);
      versions.set(version,{path:record.path,stamp:stamp(record),bytes});
      return {text,version};
    }
    if (op === 'saveText') {
      if (typeof input.text !== 'string' || input.text.length > TEXT_LIMIT) fail('FILE_TOO_LARGE');
      const bytes = encoder.encode(input.text); if (bytes.length > TEXT_LIMIT) fail('FILE_TOO_LARGE');
      const record = resolve(path), saved = versions.get(input.version);
      if (!saved || saved.path !== record.path || saved.stamp !== stamp(record) || !same(saved.bytes,data(record,TEXT_LIMIT))) fail('FILE_CONFLICT');
      room(bytes.length, fs.inodedata[record.id]?.byteLength ?? 0);
      put(record,bytes); versions.delete(input.version); return {ok:true};
    }
    if (op === 'mkdir' || op === 'upload') {
      const dir = parent(path); if (dir.node.direntries.has(dir.name)) fail('FILE_EXISTS');
      if (op === 'mkdir') { fs.CreateDirectory(dir.name,dir.id); return {ok:true}; }
      if (!(input.bytes instanceof Uint8Array)) fail('INVALID_FILE');
      if (input.bytes.byteLength > UPLOAD_LIMIT) fail('FILE_TOO_LARGE');
      room(input.bytes.length);
      const bytes = new Uint8Array(input.bytes); // Own before allocating inode.
      const id = fs.CreateFile(dir.name,dir.id); put({id,node:inode(id)},bytes); return {ok:true};
    }
    if (op === 'remove' || op === 'rename') {
      const dir = parent(path), record = resolve(path,false);
      if (op === 'remove') {
        const fids = machine.v86?.cpu?.devices?.virtio_9p?.fids;
        // v86 0.5.458 rejects reads on UNLINKED inodes, including open fids.
        // Refuse before changing the directory instead of breaking guest IO.
        if (Array.isArray(fids) && fids.some(fid => fid?.inodeid === record.id)) fail('FILE_IN_USE');
        if (fs.Unlink(dir.id,dir.name) !== 0) fail('DIRECTORY_NOT_EMPTY');
        // The CPU is paused and outstanding FS calls have settled. Reclaim only
        // when the pinned guest fid table proves nobody still references it.
        // Unknown tables retain data conservatively; hardlinks keep nlinks > 0.
        if (record.node.nlinks === 0 && Array.isArray(fids) && typeof fs.CloseInode === 'function'
          && !fids.some(fid => fid?.inodeid === record.id)) await fs.CloseInode(record.id);
        return {ok:true};
      }
      const target = parent(input.destination);
      if (target.node.direntries.has(target.name)) fail('FILE_EXISTS');
      if (type(record.node) === 'directory' && (target.path === record.path || target.path.startsWith(record.path+'/'))) fail('INVALID_PATH');
      if (await fs.Rename(dir.id,dir.name,target.id,target.name) !== 0) fail('FILE_RENAME_FAILED');
      return {ok:true};
    }
    fail('INVALID_FILE_OPERATION');
  }
  return Object.freeze({
    async request(input) {
      live(); if (busy) fail('FILES_BUSY'); input = copyFileRequest(input);
      if (input.op === 'downloadChunk' || input.op === 'downloadEnd') {
        if (!download || input.token !== download.token || input.path !== download.path) fail('FILE_DOWNLOAD_EXPIRED');
        if (input.op === 'downloadEnd') { releaseDownload(); return {ok:true}; }
        if (input.offset !== download.offset) fail('INVALID_FILE_OPERATION');
        const offset = download.offset, end = Math.min(offset + DOWNLOAD_CHUNK_SIZE, download.bytes.length);
        const bytes = new Uint8Array(download.bytes.subarray(offset,end));
        download.offset = end; renewDownload();
        return {offset,bytes,done:end === download.bytes.length};
      }
      if (download) fail('FILES_BUSY');
      busy = true;
      const resume = machine.is_running();
      let paused = false;
      try {
        if (resume) { await machine.stop(); paused = !machine.is_running(); }
        live();
        while (pending.size) { await Promise.allSettled([...pending]); live(); }
        if (machine.is_running() || fs.mounts?.length) fail('UNSUPPORTED_FILESYSTEM');
        const result = await operate(input); live(); if (download) download.resume = resume && paused; return result;
      } finally { busy = false; if (!closed && !download && resume && paused) machine.run(); }
    },
    close() {
      if (closed) return; closed = true; releaseDownload(); versions.clear();
      for (const [name,original] of originals) fs[name] = original;
    },
  });
}
