let latestFoodProduct=null;

function productPackText(p){
  const qty=p.quantity_per_container!==null&&p.quantity_per_container!==undefined&&p.quantity_per_container!==''?String(p.quantity_per_container):'';
  return [qty,p.container_measure||'',p.container_type||''].filter(Boolean).join(' ').trim();
}

async function showNewProduct(){
  currentView='newproduct';
  if(profile?.role!=='manager')return alert('Manager access required.');
  $('content').innerHTML=`<div class="card rolebox">
    <h2>ADD NEW PRODUCT</h2>
    <p class="muted">Create the permanent food product first. The system assigns the next FOOD code automatically and creates a permanent Product QR. Then use STOCK IN to create the physical batch with its expiry date and Batch QR.</p>
    <div class="grid">
      <div><label>Product / ingredient name</label><input id="npName" placeholder="e.g. Plain Flour 16kg"></div>
      <div><label>Category</label><input id="npCategory" placeholder="e.g. Dry Goods"></div>
      <div><label>Stock unit</label><input id="npUnit" value="each" placeholder="each / kg / g / litre"></div>
      <div><label>Storage location</label><input id="npLocation" placeholder="e.g. Dry Store Shelf 2"></div>
      <div><label>Reorder level</label><input id="npReorder" type="number" min="0" value="0"></div>
      <div><label>Container type</label><input id="npContainer" placeholder="bag / box / bottle / carton"></div>
      <div><label>Quantity per container</label><input id="npContainerQty" type="number" min="0" step="0.01" placeholder="e.g. 16"></div>
      <div><label>Container measure</label><input id="npMeasure" placeholder="kg / g / litre / each"></div>
    </div>
    <button id="npCreate" class="primary full" style="margin-top:12px">CREATE PRODUCT & QR</button>
    <p id="npMsg" class="muted"></p>
  </div>`;
  $('npCreate').onclick=createNewFoodProduct;
}

async function createNewFoodProduct(){
  if(profile?.role!=='manager')return alert('Manager access required.');
  const name=$('npName').value.trim();
  if(!name)return alert('Enter the product / ingredient name.');
  const qRaw=$('npContainerQty').value.trim();
  const payload={
    p_name:name,
    p_category:$('npCategory').value.trim()||null,
    p_unit:$('npUnit').value.trim()||'each',
    p_location:$('npLocation').value.trim()||null,
    p_reorder_level:Math.max(0,parseInt($('npReorder').value||'0')),
    p_container_type:$('npContainer').value.trim()||null,
    p_quantity_per_container:qRaw===''?null:Number(qRaw),
    p_container_measure:$('npMeasure').value.trim()||null
  };
  $('npMsg').textContent='Creating product…';
  const {data,error}=await sb.rpc('create_food_product',payload);
  if(error){$('npMsg').textContent=error.message;return;}
  latestFoodProduct={...data,...payload,quantity_per_container:payload.p_quantity_per_container,container_measure:payload.p_container_measure,container_type:payload.p_container_type,category:payload.p_category,unit:payload.p_unit,location:payload.p_location};
  $('npMsg').textContent='';
  $('content').innerHTML=`<div class="card good">
    <h2>PRODUCT CREATED ✓</h2>
    <div class="big">${esc(data.scan_code)}</div>
    <h2>${esc(data.name)}</h2>
    <p class="muted">Permanent product code created. No stock is live yet until you receive a physical batch.</p>
    <div class="row">
      <button id="npPrintProductQr" class="primary">PRINT PRODUCT QR</button>
      <button id="npStockIn" class="primary">STOCK IN THIS PRODUCT</button>
      <button id="npAnother">ADD ANOTHER PRODUCT</button>
    </div>
  </div>`;
  $('npPrintProductQr').onclick=()=>printProductQrLabel(latestFoodProduct);
  $('npStockIn').onclick=()=>stockInNewFoodProduct(data.scan_code);
  $('npAnother').onclick=showNewProduct;
}

async function printProductQrLabel(p){
  if(profile?.role!=='manager')return alert('Manager access required.');
  const url=new URL(location.origin+location.pathname);
  url.searchParams.set('code',p.scan_code);
  const qr=await makeQrDataUrl(url.toString());
  const pack=productPackText(p);
  const w=window.open('','_blank','width=650,height=850');
  if(!w)return alert('Allow pop-ups to print the product QR label.');
  w.document.write(`<html><head><title>${esc(p.scan_code)}</title><style>body{font-family:Arial;text-align:center;padding:24px;color:#111}.code{font-size:30px;font-weight:800}.name{font-size:24px;font-weight:800}.pack{font-size:20px;font-weight:700;margin-top:6px}.note{font-size:15px;margin-top:10px}@media print{button{display:none}}</style></head><body><button onclick="print()">PRINT PRODUCT QR</button><br><img src="${qr}" style="width:360px;height:360px"><div class="code">${esc(p.scan_code)}</div><div class="name">${esc(p.name)}</div>${pack?`<div class="pack">${esc(pack)}</div>`:''}<div class="note">PERMANENT PRODUCT QR<br>Use STOCK IN to create batch / expiry QR labels.</div></body></html>`);
  w.document.close();
}

async function stockInNewFoodProduct(code){
  await showReceive();
  if($('rProduct'))$('rProduct').value=code;
  $('rBatch')?.focus();
}

if($('newProductBtn'))$('newProductBtn').onclick=showNewProduct;
