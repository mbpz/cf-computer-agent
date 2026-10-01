import { prepareAlpineIso } from './alpine-iso.mjs';
import { createTerminalSession } from './terminal-session.mjs';
export async function bootAcceptedImage(read,Engine) {
  const profile=await prepareAlpineIso({readAsset:read,Engine});
  const session=createTerminalSession({createMachine:()=>profile.createMachine()});
  try {
    await session.ready;session.drain();
    session.write("uname -r; printf '\\nIMAGE-FAILURE-RECOVERY-OK\\n'\n");
    let output='';const decoder=new TextDecoder(),end=performance.now()+10000;
    while(performance.now()<end) {
      const chunk=session.drain();if(chunk.droppedBytes)throw Error('Guest output overflow');
      output+=decoder.decode(chunk.bytes,{stream:true});
      if(/\r?\n6\.18\.35-0-virt\r?\n\r?\nIMAGE-FAILURE-RECOVERY-OK\r?\n/.test(output))return {kernel:'6.18.35-0-virt',marker:'IMAGE-FAILURE-RECOVERY-OK',network:'off'};
      await new Promise(resolve=>setTimeout(resolve,20));
    }
    throw Error('Guest recovery command was not verified');
  } finally {await session.close();}
}
