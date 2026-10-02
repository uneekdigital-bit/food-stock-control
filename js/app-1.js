
const SUPABASE_URL='https://askahxgdymruqfoaneht.supabase.co';
const SUPABASE_KEY='sb_publishable_qiRZh800xG7zETSRgHyyCg_ol7SkaN1';
const sb=supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const $=id=>document.getElementById(id), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let profile=null, realtime=null, currentView='stock';
function daysUntil(d){return Math.ceil((new Date(d+'T00:00:00')-new Date())/86400000)}
function loginEmailFromUsername(v){
  const u=(v||'').trim().toLowerCase();
  if(u==='uneekdigital') return 'uneekdigital@gmail.com';
  return u.includes('@')?u:(u+'@staff.foodstock.app');
}
async function signIn(){const username=$('username').value.trim();if(!username)return $('authmsg').textContent='Enter your staff username.';const {error}=await sb.auth.signInWithPassword({email:loginEmailFromUsername(username),password:$('password').value});$('authmsg').textContent=error?'Username or password not recognised.':'';if(!error)boot()}
async function loadProfile(){
  const {data:{user},error:userError}=await sb.auth.getUser();
  if(userError||!user) throw userError||new Error('No signed-in user');
  const {data,error}=await sb.from('profiles').select('*').eq('user_id',user.id).single();
  if(error)throw error;
  profile=data;
  const {data:liveRole,error:roleError}=await sb.rpc('current_user_role');
  if(!roleError && liveRole) profile.role=liveRole;
  renderRole();
}
function renderRole(){
  const role=profile?.role||'picker';
  $('rolepill').textContent=role.toUpperCase();
  $('rolepill').className='pill '+role;
  $('displayname').textContent=profile?.display_name||'';
  $('who').textContent=profile?` — ${profile.display_name} (${role})`:'';
  document.querySelectorAll('.mgr').forEach(x=>x.classList.toggle('hide',role!=='manager'));
  document.querySelectorAll('.qa').forEach(x=>x.classList.toggle('hide',role!=='qa'));
  document.querySelectorAll('.mgrqa').forEach(x=>x.classList.toggle('hide',!['manager','qa_manager','qa'].includes(role)));
  document.querySelectorAll('.useradmin').forEach(x=>x.classList.toggle('hide',!['manager','qa_manager'].includes(role)));
  $('managerClaim').classList.add('hide');
}
async function claimManager(){const code=$('managerCode').value.trim();const {data,error}=await sb.rpc('claim_manager_role',{p_code:code});if(error)return alert(error.message);if(!data)return alert('Manager code was not accepted.');await loadProfile();alert('Manager access enabled.');showStock()}
async function boot(){
  const {data:{session}}=await sb.auth.getSession();
  if(!session)return;
  $('auth').classList.add('hide');
  $('app').classList.remove('hide');
  await loadProfile();
  const qs=new URLSearchParams(location.search);
  const batchId=qs.get('batch');
  const code=qs.get('code');
  if(batchId){
    await handleBatchQrPick(parseInt(batchId));
  }else{
    if(code)$('search').value=code;
    await showStock();
  }
  startRealtime();
}
function startRealtime(){
  if(realtime)sb.removeChannel(realtime);
  let refreshTimer=null;
  const refresh=()=>{
    clearTimeout(refreshTimer);
    refreshTimer=setTimeout(()=>refreshCurrentView(),250);
  };
  realtime=sb.channel('food-stock-live')
    .on('postgres_changes',{event:'*',schema:'public',table:'batches'},refresh)
    .on('postgres_changes',{event:'*',schema:'public',table:'pick_lists'},refresh)
    .on('postgres_changes',{event:'*',schema:'public',table:'pick_list_items'},refresh)
    .on('postgres_changes',{event:'*',schema:'public',table:'stock_transactions'},refresh)
    .on('postgres_changes',{event:'*',schema:'public',table:'concessions'},refresh)
    .subscribe();
}
async function refreshCurrentView(){
  if(currentView==='stock') return showStock(false);
  if(currentView==='expiry') return showExpiry(false);
  if(currentView==='history') return showHistory(false);
  if(currentView==='recipes') return showRecipes(false);
  if(currentView==='picklists') return showPickLists(false);
  if(currentView==='concessions') return showConcessions(false);
  if(currentView==='receive') return showReceive(false);
  if(currentView==='qrlabels') return showQrLabels(false);
  if(currentView==='users') return showUsers(false);
}
async function getProducts(){let q=sb.from('products').select('*,batches(*)').eq('active',true).order('scan_code');const t=$('search').value.trim();if(t)q=q.or(`scan_code.ilike.%${t}%,name.ilike.%${t}%,category.ilike.%${t}%`);const {data,error}=await q;if(error)throw error;return data||[]}
async function showStock(setView=true){if(setView)currentView='stock';const data=await getProducts();$('content').innerHTML=data.length?data.map(productCard).join(''):'<div class="card">No products found.</div>';document.querySelectorAll('.pickbtn').forEach(b=>b.onclick=()=>pick(b.dataset.code))}
function productCard(p){const batches=(p.batches||[]).sort((a,b)=>a.expiry_date.localeCompare(b.expiry_date));const total=batches.reduce((s,b)=>s+b.quantity,0);const available=batches.filter(b=>b.quantity>0&&daysUntil(b.expiry_date)>=0);const next=available[0];const low=total<=p.reorder_level;return `<div class="card"><div class="row"><b>${esc(p.scan_code)}</b><span class="pill ${low?'warn':'good'}">${low?'LOW STOCK':'STOCK OK'}</span></div><h2>${esc(p.name)}</h2><div class="muted">${esc(p.category||'')} · ${esc(p.location||'')}</div><p>Total stock</p><div class="big">${total}</div>${next?`<p><b>FEFO next:</b> ${esc(next.batch_no)} — expires ${esc(next.expiry_date)} — ${next.quantity} ${esc(p.unit)}</p>`:'<p class="danger">No unexpired stock available</p>'}<div class="row">${profile?.role==='manager'?`<input id="pick_${esc(p.scan_code)}" type="number" min="1" value="1" style="max-width:100px"><button class="pickbtn primary" data-code="${esc(p.scan_code)}">MANAGER STOCK OUT</button>`:'<span class="pill">Use batch QR for recipe picking</span>'}</div>${batches.map(b=>batchLine(b,p)).join('')}</div>`}
function batchLine(b,p){
  const d=daysUntil(b.expiry_date), cls=d<0?'expired':d<=7?'soon':'';
  return `<div class="batch ${cls}"><b>${esc(b.batch_no)}</b> · Received ${esc(b.received_date||'')} · Exp ${esc(b.expiry_date)} · Qty ${b.quantity} · ${esc(b.supplier||'')}
  ${profile?.role==='manager'&&b.quantity>0?` <button onclick="printBatchLabel(${b.id},'${esc(p.scan_code)}','${esc(p.name)}','${esc(b.batch_no)}','${esc(b.expiry_date)}')">PRINT BATCH QR</button> <button onclick="requestConcession(${b.id},'${esc(p.name)}','${esc(b.batch_no)}',${b.quantity})">WRITE OFF / CONCESSION</button>`:''}</div>`
}
async function pick(code){const n=Math.max(1,parseInt($('pick_'+code).value||'1'));const {error}=await sb.rpc('pick_stock',{p_scan_code:code,p_quantity:n,p_note:'Picked via QR stock app'});if(error)return alert(error.message);await showStock()}
async function showExpiry(setView=true){if(setView)currentView='expiry';const data=await getProducts();const rows=[];for(const p of data)for(const b of p.batches||[])rows.push({p,b,d:daysUntil(b.expiry_date)});rows.sort((a,b)=>a.b.expiry_date.localeCompare(b.b.expiry_date));$('content').innerHTML='<div class="card"><h2>Expiry Dashboard</h2>'+rows.map(x=>`<p class="${x.d<0?'expired':x.d<=7?'soon':''}"><b>${esc(x.p.name)}</b> — ${esc(x.b.batch_no)} — ${esc(x.b.expiry_date)} — Qty ${x.b.quantity} — ${x.d<0?'EXPIRED':x.d+' days'}</p>`).join('')+'</div>'}

async function showRecipes(setView=true){if(setView)currentView='recipes';
  const {data,error}=await sb.from('recipes').select('*,recipe_ingredients(*,products(*,batches(*)))').eq('active',true).order('code');
  if(error)return alert(error.message);
  const importCard=profile?.role==='manager'?recipeExcelImportCard():'';
  $('content').innerHTML=importCard+((data||[]).map(recipeCard).join('')||'<div class="card">No recipes found.</div>');
  if($('recipeExcelFile'))$('recipeExcelFile').onchange=previewRecipeExcel;
  if($('recipeExcelImportBtn'))$('recipeExcelImportBtn').onclick=importRecipeExcel;
  document.querySelectorAll('.recipeBatches').forEach(i=>i.oninput=()=>updateRecipeCalc(i.dataset.id));
  document.querySelectorAll('.createPickListBtn').forEach(b=>b.onclick=()=>createPickList(parseInt(b.dataset.id)));
  document.querySelectorAll('.printRecipeBtn').forEach(b=>b.onclick=()=>printRecipe(parseInt(b.dataset.id)));
  document.querySelectorAll('.clearRecipeBtn').forEach(b=>b.onclick=()=>clearRecipeIngredients(parseInt(b.dataset.id)));
  document.querySelectorAll('.deleteRecipeBtn').forEach(b=>b.onclick=()=>deleteRecipe(parseInt(b.dataset.id)));
  (data||[]).forEach(r=>updateRecipeCalc(r.id));
}
function recipeExcelImportCard(){return `<div class="card rolebox">
  <h2>UPLOAD RECIPE EXCEL</h2>
  <p>Upload an <b>.xlsx</b> recipe sheet. The system matches ingredients to Food Inventory and creates the recipe plus a linked pick list.</p>
  <p class="small muted">Columns: Recipe Code, Recipe Name, Ingredient Stock Code, Ingredient Name, Quantity, Unit, Notes. Use Stock Code wherever possible. Uploading the same Recipe Code replaces its ingredient list with the revised version.</p>
  <div class="grid">
    <div><label>Recipe Excel file</label><input id="recipeExcelFile" type="file" accept=".xlsx,.xls"></div>
    <div><label>Number of recipe batches</label><input id="recipeExcelBatches" type="number" min="1" value="1"></div>
  </div>
  <div id="recipeExcelPreview" class="small muted" style="margin-top:12px">Choose a spreadsheet to validate it before importing.</div>
  <button id="recipeExcelImportBtn" class="primary full" style="margin-top:12px" disabled>IMPORT RECIPE & CREATE PICK LIST</button>
</div>`}
function normHeader(s){return String(s||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ')}
function getExcelField(row,names){for(const [k,v] of Object.entries(row)){const nk=normHeader(k);if(names.includes(nk))return v}return ''}