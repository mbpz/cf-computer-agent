import { V86 } from './engine/libv86.mjs';
import { ALPINE_ISO_ARTIFACTS } from './alpine-iso.mjs';
import { runImageAcceptance } from './image-acceptance-core.mjs';
import { bootAcceptedImage } from './image-acceptance-boot.mjs';
let used=false;
self.onmessage=async({data})=>{
  if(used)return;used=true;
  try {
    const receipt=await runImageAcceptance({action:data.action,artifacts:ALPINE_ISO_ARTIFACTS,origin:self.location.origin,cacheStorage:self.caches,boot:read=>bootAcceptedImage(read,V86)});
    self.postMessage({ok:true,receipt:{...receipt,nativeCacheStorage:true,secureContext:self.isSecureContext,productionAcceptance:false}});
  }catch(error){self.postMessage({ok:false,error:String(error.message).slice(0,300)});}
};
