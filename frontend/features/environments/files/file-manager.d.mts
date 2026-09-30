import type { AccountVmRuntime } from '../account-vm-runtime.mjs';
export interface FileEntry { name: string; type: 'directory'|'file'|'symlink'|'unsupported'; bytes: number; }
export interface FileEditor { path: string; name: string; text: string; version: string; dirty: boolean; conflict: boolean; }
export interface FileManagerSnapshot {
  epoch: number; available: boolean; path: string; page: number; pageSize: 20|50|100; total: number; pages: number;
  entries: FileEntry[]; editor: FileEditor|null; results: {name: string; status: string; error: string}[];
  busy: boolean; cancelling: boolean; error: string; notice: string;
}
export interface FileManager {
  getSnapshot(): FileManagerSnapshot; subscribe(fn:()=>void):()=>void;
  load(path?: string,page?: number,pageSize?: 20|50|100):Promise<void>;
  mkdir(name:string):Promise<void>; rename(name:string,destination:string):Promise<void>; remove(name:string):Promise<void>;
  open(name:string):Promise<void>; edit(text:string):void; closeEditor():void;
  save():Promise<void>; saveAs(name:string):Promise<void>;
  download(name:string,receive:(name:string,bytes:Uint8Array)=>void):Promise<void>;
  upload(files:Iterable<{name:string;size:number;arrayBuffer():Promise<ArrayBuffer>}>):Promise<void>;
  cancel():void; dispose():void;
}
export function createFileManager(runtime:AccountVmRuntime):FileManager;
