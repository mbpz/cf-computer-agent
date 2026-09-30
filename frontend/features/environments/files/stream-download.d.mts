import type {FileRequest} from '../../../../tools/browser-vm/file-protocol.mjs';
export interface DownloadSink { write(bytes:Uint8Array):Promise<unknown>; close():Promise<unknown>; abort():Promise<unknown>; }
export interface DownloadProgress { written:number; total:number; }
export function writeFileDownload(options:{file:(input:FileRequest)=>Promise<unknown>;path:string;openSink:()=>DownloadSink|Promise<DownloadSink>;signal?:AbortSignal;onProgress?:(progress:DownloadProgress)=>void}):Promise<{bytes:number;committed:true}>;
