/** Isolated diagnostic controls. Listing metadata is not a restore/integrity check. */
export function mountCheckpointControls({root,owner,environment,checkpoints,runtime}) {
  const element=id=>root.querySelector('#'+id), select=element('versions'), refresh=element('versions-refresh');
  const restore=element('restore-selected'), status=element('versions-status');
  let closed=false,busy=false,generation=0,available=new Set();
  function active(){if(closed||owner.signal.aborted)return false;try{owner.assertEnvironment(environment.id);return true;}catch{return false;}}
  function clear(){available.clear();select.replaceChildren();const option=select.ownerDocument.createElement('option');option.value='';option.textContent='请选择版本（不会自动回退）';select.append(option);}
  function render(){const disabled=!active()||busy||runtime.getSnapshot().status!=='idle';refresh.disabled=disabled;select.disabled=disabled;restore.disabled=disabled||!available.has(Number(select.value));}
  async function reload(){
    if(!active()||busy)return;const ticket=++generation;busy=true;clear();status.textContent='读取版本中';render();
    try{
      const rows=await checkpoints.list(environment,{signal:owner.signal});if(!active()||ticket!==generation)return;
      for(const row of rows){const option=select.ownerDocument.createElement('option');option.value=String(row.revision);option.textContent=`v${row.revision} · ${new Date(row.savedAt).toLocaleString()} · ${row.bytes} 字节`;select.append(option);available.add(row.revision);}
      status.textContent=rows.length?'选择后显式恢复；完整性将在恢复时校验':'暂无保存版本';
    }catch{if(active()&&ticket===generation)status.textContent='版本读取失败；未验收，请重试';}
    finally{if(ticket===generation){busy=false;render();}}
  }
  async function recover(){
    const revision=Number(select.value);if(!active()||busy||!available.has(revision))return;
    const ticket=++generation;busy=true;status.textContent=`恢复 v${revision} 中`;render();
    try{await runtime.start(environment,{restore:true,revision});if(active()&&ticket===generation)status.textContent=`已恢复 v${revision}；后续保存将创建新版本`;}
    catch{if(active()&&ticket===generation){clear();status.textContent='恢复失败（未验收），请重新读取版本；未自动回退';}}
    finally{if(ticket===generation){busy=false;render();}}
  }
  function invalidate(){generation++;busy=false;clear();status.textContent='账户或环境已关闭';render();}
  const unsubscribe=runtime.subscribe(render),removed=owner.onEnvironmentRemoved(id=>{if(id===environment.id)invalidate();});
  refresh.addEventListener('click',reload);restore.addEventListener('click',recover);select.addEventListener('change',render);owner.signal.addEventListener('abort',invalidate,{once:true});
  clear();render();
  return ()=>{closed=true;invalidate();unsubscribe();removed();refresh.removeEventListener('click',reload);restore.removeEventListener('click',recover);select.removeEventListener('change',render);owner.signal.removeEventListener('abort',invalidate);};
}
