const $=id=>document.getElementById(id);let worker;
function stop(){worker?.terminate();worker=undefined;$('stop').disabled=true;$('git').disabled=true;$('start').disabled=false;$('capability').value='';}
$('stop').onclick=()=>{stop();$('status').textContent='已取消；VM 已销毁，不自动恢复。';};
$('start').onclick=()=>{
 const endpoint=$('endpoint').value,capability=$('capability').value;
 if(!isSecureContext||location.protocol!=='https:'){$('status').textContent='必须通过默认安全配置的 HTTPS 页面验收。';return;}
 if(!/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(endpoint)||Number(new URL(endpoint).port)>65535||!/^[A-Za-z0-9_-]{43}$/.test(capability)){$('status').textContent='请输入明确的本机地址及临时能力值。';return;}
 stop();$('start').disabled=true;$('stop').disabled=false;$('results').textContent='';
 worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});
 worker.onmessage=({data})=>{
  if(data.type==='progress')$('status').textContent=data.text;
  else if(data.type==='command'){$('results').textContent=($('results').textContent+JSON.stringify({command:data.command,exitCode:data.exitCode,output:data.output})+'\n').slice(-100000);}
  else if(data.type==='result'){$('results').textContent+=(JSON.stringify(data.result,null,2)+'\n');$('status').textContent=data.stage+' 已完成';$('git').disabled=data.stage!=='packages';}
  else if(data.type==='error'){stop();$('status').textContent='失败（未验收）：'+data.text;}
 };
 worker.onerror=()=>{stop();$('status').textContent='Worker 失败，未验收。';};
 worker.postMessage({type:'start',endpoint,capability});
};
$('git').onclick=()=>{$('git').disabled=true;worker?.postMessage({type:'git'});};
addEventListener('pagehide',stop);
