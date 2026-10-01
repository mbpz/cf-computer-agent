import type { AccountNetworkOwner } from '../account-network-owner.mjs';
import type { RuntimeEnvironment } from '../account-vm-runtime.mjs';
export interface CheckpointIdentity { engineVersion:string; imageVersion:string; memoryBytes:number; filesystem:string; }
export interface Checkpoint { schemaVersion:1; identity:CheckpointIdentity; state:ArrayBuffer; bytes:number; sha256:string; }
export interface CheckpointReceipt { revision:number; savedAt:string; bytes:number; }
export interface LoadedCheckpoint {revision:number;headRevision:number;savedAt:string;checkpoint:Checkpoint;}
export interface CheckpointStore {
 save(environment:RuntimeEnvironment,checkpoint:Checkpoint,options:{expectedRevision:number;signal?:AbortSignal}):Promise<CheckpointReceipt>;
 load(environment:RuntimeEnvironment,options?:{revision?:number;signal?:AbortSignal}):Promise<LoadedCheckpoint|null>;
 remove(environmentId:string):Promise<{removed:true}>;
 close():void;
}
export const CHECKPOINT_DATABASE:string;
export function createCheckpointStore(options:{owner:AccountNetworkOwner;identity:CheckpointIdentity;indexedDB?:IDBFactory;estimate?:()=>Promise<StorageEstimate>;openTimeoutMs?:number}):CheckpointStore;
