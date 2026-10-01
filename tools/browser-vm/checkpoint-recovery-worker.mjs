// Local diagnostic only. The pending transaction uses the production store;
// the test keeps it active until the parent terminates this dedicated Worker.
import { createAccountNetworkOwner } from "../../frontend/features/environments/account-network-owner.mjs";
import { createCheckpointStore } from "../../frontend/features/environments/storage/checkpoints.mjs";
import { sealCheckpoint } from "./probe-checkpoint.mjs";
let started = false;
self.onmessage = async ({data}) => {
  if (started) return;
  started = true;
  const {environment, identity} = data;
  const owner = createAccountNetworkOwner({origin:self.location.origin, memberId:environment.memberId});
  const store = createCheckpointStore({owner, identity});
  const original = IDBObjectStore.prototype.put;
  let injected = false, timer;
  try {
    const candidate = await sealCheckpoint(new TextEncoder().encode("uncommitted-worker").buffer, identity);
    IDBObjectStore.prototype.put = function(...args) {
      const request = original.apply(this, args);
      if (this.name === "states" && !injected) {
        injected = true;
        const tx = this.transaction;
        // Repeated reads keep this native read-write transaction alive without
        // extra writes or external traffic. Watchdog bounds a lost parent.
        let holding = true;
        timer = setTimeout(() => { holding=false; try {tx.abort();} catch {} }, 10000);
        function hold() {
          if (!holding) return;
          const read = tx.objectStore("heads").get([self.location.origin, environment.memberId, environment.id]);
          read.onsuccess = hold;
        }
        hold();
        queueMicrotask(() => self.postMessage({kind:"uncommitted-writes-queued"}));
      }
      return request;
    };
    await store.save(environment, candidate, {expectedRevision:2});
    self.postMessage({kind:"unexpected-commit"});
  } catch { self.postMessage({kind:"failed"}); }
  finally { clearTimeout(timer); IDBObjectStore.prototype.put=original; store.close(); owner.dispose(); }
};
