// Explicit offline CLI. Never deploys, discovers credentials, or reads guest data.
import { fileURLToPath } from 'node:url';
import { ALPINE_ISO_ARTIFACTS } from './alpine-iso.mjs';
import { exportImageBundle, verifyImageBundle, createPinnedSourceReader } from './image-bundle.mjs';
const [mode,output,boot,iso,reserved='0',...extra]=process.argv.slice(2);
try {
  if(!['export','verify'].includes(mode) || !output || extra.length || (mode==='export' && (!boot || !iso))) throw Error('Usage: export-images.mjs export OUTPUT BOOT_DIR ISO_DIR [RESERVED_SITE_FILES] | verify OUTPUT');
  if(mode==='verify' && (boot || iso || reserved!=='0')) throw Error('Verify accepts only OUTPUT');
  const artifacts=ALPINE_ISO_ARTIFACTS;
  const result=mode==='verify' ? await verifyImageBundle({directory:output,artifacts}) : await exportImageBundle({
    output,artifacts,limits:{reservedFiles:Number(reserved)},
    readAsset:await createPinnedSourceReader({artifacts,roots:{boot,iso,engine:fileURLToPath(new URL('../../node_modules/v86/build/',import.meta.url))}}),
  });
  console.log(JSON.stringify(result,null,2));
} catch(error) { console.error(error.message); process.exitCode=1; }
