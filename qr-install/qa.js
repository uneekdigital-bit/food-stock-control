let qaCalls = new Map();
let qaWorker, activeSubscription;
function expiredBatch(b) {
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const part=t=>today.find(x=>x.type===t).value;
  return b.expiry_date < [part('year'),part('month'),part('day')].join('-');
}
function qaControl(b) {
  if(!expiredBatch(b) || b.quantity<=0) return '';
  return '<span data-qa="'+Number(b.id)+'" data-expiry="'+esc(b.expiry_date)+'">'+qaLabel(b.id,b.expiry_date)+'</span>';
}
function qaLabel(id,expiry) {
  const c=qaCalls.get(Number(id));
  if(!c || c.expiry_date!==expiry) return '<button onclick="requestQa('+Number(id)+',this)">Request QA</button>';
  if(c.responder) return esc(c.responder_name)+' is on the way';
  return 'Waiting for QA '+(isQa()?'<button onclick="ackQa('+Number(c.id)+')">I’m on my way</button>':'');
}
function isQa(){return ['qa','qa_manager'].includes(profile?.role);}
async function refreshQa(){
  const r=await sb.from('qa_calls').select('id,batch_id,expiry_date,responder,responder_name,batches(batch_no,expiry_date,quantity,products(name))').order('id',{ascending:true});
  if(r.error){$('qaStatus').textContent='QA status unavailable. Contact QA directly if needed.';return;}
  qaCalls=new Map(r.data.map(c=>[Number(c.batch_id),c]));
  document.querySelectorAll('[data-qa]').forEach(el=>el.innerHTML=qaLabel(el.dataset.qa,el.dataset.expiry));
  $('qaQueue').innerHTML=isQa()?r.data.filter(c=>!c.responder && c.batches?.quantity>0 && c.expiry_date===c.batches.expiry_date && expiredBatch(c.batches)).map(c=>
    '<p>'+esc(c.batches.products.name)+' · '+esc(c.batches.batch_no)+' '+qaControl({...c.batches,id:c.batch_id})+'</p>').join(''):'';
}
async function qaApi(body){
  const {data:{session}}=await sb.auth.getSession();
  const r=await fetch('/api/qa',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify(body)});
  const result=await r.json();
  if(!r.ok)throw Error(result.error||'QA request failed');
  return result;
}
async function requestQa(batch,button){
  button.disabled=true;
  try{
    const r=await qaApi({action:'request',batch});
    $('qaStatus').textContent=r.sent===0?'Request recorded. No phone alert accepted. Contact QA directly.':'';
  }catch(e){$('qaStatus').textContent=e.message;}
  finally{await refreshQa();button.disabled=false;}
}
async function ackQa(id){
  const r=await sb.rpc('ack_expiry_qa',{call_id:id});
  if(r.error) $('qaStatus').textContent=r.error.message;
  await refreshQa();
}
function scannedExpired(batch,name){
  $('content').innerHTML='<div class="card"><b>Expired · Pick blocked</b><p>'+esc(name)+' · '+esc(batch.batch_no)+' · '+esc(batch.expiry_date)+'</p>'+qaControl(batch)+'</div>';
}
async function toggleQaDuty(){
  try{
    if(!qaWorker)throw Error('Open Food Stock Control from the iPhone Home Screen or in Chrome on Android to enable QA alerts.');
    let sub=activeSubscription;
    if($('qaDuty').dataset.on==='yes' && sub){
      await qaApi({action:'off',subscription:sub.toJSON()});
      await sub.unsubscribe();
      activeSubscription=null;
      $('qaDuty').dataset.on='no';
      $('qaDuty').textContent='Enable QA alerts';
      return;
    }
    if(!sub){
      const key=$('qaDuty').dataset.key;
      if(!key)throw Error('QA alerts are not configured.');
      const bytes=Uint8Array.from(atob(key.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
      sub=await qaWorker.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});
    }
    activeSubscription=sub;
    await qaApi({action:'on',subscription:sub.toJSON()});
    $('qaDuty').dataset.on='yes';
    $('qaDuty').textContent='Go off duty';
  }catch(e){$('qaStatus').textContent=e.message;}
}
async function startQa(){
  await refreshQa();
  if(!window.qaTimer) window.qaTimer=setInterval(()=>{if(!document.hidden)refreshQa()},10000);
  if(!isQa())return;
  $('qaDuty').hidden=false;
  try{
    await navigator.serviceWorker.register('/qa-worker.js');
    const {key}=await qaApi({action:'key'});
    $('qaDuty').dataset.key=key||'';
    qaWorker=await navigator.serviceWorker.ready;
    activeSubscription=await qaWorker.pushManager.getSubscription();
    if(activeSubscription){
      $('qaDuty').dataset.on='yes';
      $('qaDuty').textContent='Go off duty';
    }
  }catch{$('qaStatus').textContent='Phone alerts unavailable. Check the QA queue here.';}
}
