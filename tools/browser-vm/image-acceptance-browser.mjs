const buttons=[...document.querySelectorAll('[data-action]')],cancel=document.querySelector('#cancel'),status=document.querySelector('#status'),results=document.querySelector('#results');
let worker,timer,epoch=0;const receipts=[];
function stop(){epoch++;clearTimeout(timer);worker?.terminate();worker=undefined;buttons.forEach(b=>b.disabled=false);cancel.disabled=true;}
function invalidated(){epoch++;stop();status.textContent='已取消；没有验收成功，不会自动重试。';}
for(const button of buttons)button.addEventListener('click',()=>{
  if(worker)return;
  const token=++epoch,action=button.dataset.action;
  buttons.forEach(b=>b.disabled=true);cancel.disabled=false;status.textContent=`运行中：${action}（非生产验收）`;
  const fail=message=>{if(token!==epoch)return;stop();status.textContent=`失败（未验收）：${message}`;};
  try{worker=new Worker('/image-acceptance-worker.mjs',{type:'module'});}catch{fail('Worker 无法创建');return;}
  worker.onmessage=({data})=>{
    if(token!==epoch)return;
    if(!data.ok){fail(data.error);return;}
    receipts.push(data.receipt);results.textContent=JSON.stringify({userAgent:navigator.userAgent,receipts},null,2);
    stop();status.textContent=data.receipt.result==='expected-failure'?'预期拒绝已验证；未启动。下一步须单独点击。':'本步骤本地验收通过；真实客体已停止。非生产验收。';
  };
  worker.onerror=()=>fail('Worker 错误');timer=setTimeout(()=>fail('超时；未验收'),120000);worker.postMessage({action});
});
cancel.addEventListener('click',invalidated);window.addEventListener('pagehide',invalidated);
