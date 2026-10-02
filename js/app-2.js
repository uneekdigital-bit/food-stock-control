async function previewRecipeExcel(){
  const file=$('recipeExcelFile')?.files?.[0]; if(!file)return;
  $('recipeExcelImportBtn').disabled=true; window._recipeExcelImport=null;
  $('recipeExcelPreview').innerHTML='Reading spreadsheet…';
  try{
    const buf=await file.arrayBuffer();
    const wb=XLSX.read(buf,{type:'array'}); if(!wb.SheetNames.length)throw new Error('Workbook has no sheets.');
    const ws=wb.Sheets[wb.SheetNames[0]];
    const raw=XLSX.utils.sheet_to_json(ws,{defval:'',raw:false});
    if(!raw.length)throw new Error('The first sheet has no ingredient rows.');
    const rows=[]; let recipeCode='',recipeName='',description='';
    for(const r of raw){
      recipeCode=recipeCode||String(getExcelField(r,['recipe code','recipe id','code'])).trim();
      recipeName=recipeName||String(getExcelField(r,['recipe name','recipe','name'])).trim();
      description=description||String(getExcelField(r,['description','recipe description'])).trim();
      const stockCode=String(getExcelField(r,['ingredient stock code','stock code','scan code','product code'])).trim();
      const ingredient=String(getExcelField(r,['ingredient name','ingredient','product name'])).trim();
      const quantity=String(getExcelField(r,['quantity','qty','recipe qty','recipe quantity'])).trim();
      const unit=String(getExcelField(r,['unit','measure','uom'])).trim();
      const notes=String(getExcelField(r,['notes','note'])).trim();
      if(stockCode||ingredient||quantity||unit)rows.push({stock_code:stockCode,ingredient,quantity,unit,notes});
    }
    if(!recipeCode)throw new Error('Recipe Code is missing.');
    if(!recipeName)throw new Error('Recipe Name is missing.');
    if(!rows.length)throw new Error('No ingredient rows found.');
    for(const [i,r] of rows.entries())if(!r.quantity||!r.unit||(!r.stock_code&&!r.ingredient))throw new Error(`Ingredient row ${i+1} needs Stock Code or Ingredient Name, Quantity and Unit.`);
    const {data:products,error}=await sb.from('products').select('id,scan_code,name,unit,container_type,quantity_per_container,container_measure').eq('active',true);
    if(error)throw error;
    const pByCode=new Map((products||[]).map(p=>[String(p.scan_code).toLowerCase(),p]));
    const pByName=new Map((products||[]).map(p=>[String(p.name).toLowerCase(),p]));
    let missing=0;
    const preview=rows.map((r,i)=>{
      const p=(r.stock_code&&pByCode.get(r.stock_code.toLowerCase()))||(!r.stock_code&&r.ingredient&&pByName.get(r.ingredient.toLowerCase()));
      if(!p)missing++;
      return `<tr><td>${i+1}</td><td>${esc(r.stock_code||'—')}</td><td>${esc(r.ingredient||p?.name||'')}</td><td>${esc(r.quantity)} ${esc(r.unit)}</td><td>${p?'<span class="pill good">MATCHED</span>':'<span class="pill danger">NOT FOUND</span>'}</td></tr>`;
    }).join('');
    $('recipeExcelPreview').innerHTML=`<p><b>${esc(recipeCode)} — ${esc(recipeName)}</b></p><div style="overflow:auto"><table style="width:100%;border-collapse:collapse"><thead><tr><th>#</th><th>Stock Code</th><th>Ingredient</th><th>Recipe Qty</th><th>Inventory Match</th></tr></thead><tbody>${preview}</tbody></table></div>${missing?`<p class="danger" style="padding:10px"><b>${missing} ingredient(s) not matched.</b> Correct the Stock Code or exact inventory name before importing.</p>`:'<p class="good" style="padding:10px"><b>Ready to import.</b> All ingredients match Food Inventory.</p>'}`;
    window._recipeExcelImport={recipeCode,recipeName,description,rows};
    $('recipeExcelImportBtn').disabled=missing>0;
  }catch(e){$('recipeExcelPreview').innerHTML='<div class="danger" style="padding:10px">'+esc(e.message||e)+'</div>'}
}
async function importRecipeExcel(){
  const imp=window._recipeExcelImport; if(!imp)return alert('Choose and validate a recipe spreadsheet first.');
  const batches=Math.max(1,parseInt($('recipeExcelBatches')?.value||'1'));
  if(!confirm(`Import ${imp.recipeName} and create a pick list for ${batches} recipe batch${batches===1?'':'es'}?`))return;
  const btn=$('recipeExcelImportBtn'); btn.disabled=true; btn.textContent='IMPORTING…';
  try{
    const {data,error}=await sb.rpc('import_recipe_from_excel',{p_recipe_code:imp.recipeCode,p_recipe_name:imp.recipeName,p_description:imp.description||'',p_rows:imp.rows,p_batches:batches,p_create_pick_list:true});
    if(error)throw error;
    alert(`Recipe imported. Pick list #${data.pick_list_id} created with ${data.ingredients} ingredient(s).`);
    window._recipeExcelImport=null; await showPickLists();
  }catch(e){alert(e.message||e);btn.disabled=false;btn.textContent='IMPORT RECIPE & CREATE PICK LIST'}
}
function recipeCard(r){
  const lines=(r.recipe_ingredients||[]).sort((a,b)=>a.sort_order-b.sort_order);
  return `<div class="card"><div class="row"><div><b>${esc(r.code)}</b><h2 style="margin:6px 0 0">${esc(r.name)}</h2></div><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end"><span class="pill">${r.base_servings} portions / batch</span></div></div><p class="muted">${esc(r.description||'')}</p><div class="grid"><div><label>Number of batches</label><input class="recipeBatches" data-id="${r.id}" id="recipe_batches_${r.id}" type="number" min="1" value="1"></div><div><label>Total portions</label><div id="recipe_servings_${r.id}" class="big">${r.base_servings}</div></div></div><div style="margin-top:12px"><button class="createPickListBtn primary full" data-id="${r.id}">ADD THIS RECIPE TO PICK LIST</button></div><div id="recipe_lines_${r.id}" style="margin-top:12px">${lines.map(x=>recipeIngredientLine(x,1)).join('')}</div><p id="recipe_msg_${r.id}" class="muted small">${profile?.role==='manager'?'Choose the number of batches, then press ADD THIS RECIPE TO PICK LIST.':'Only a Manager can add recipes to the pick list.'}</p><button class="printRecipeBtn full" data-id="${r.id}" style="margin-top:10px">PRINT RECIPE</button>${profile?.role==='manager'?`<div class="grid" style="margin-top:10px"><button class="clearRecipeBtn" data-id="${r.id}" style="background:#fff3cd;border:1px solid #d6a800">CLEAR INGREDIENTS</button><button class="deleteRecipeBtn" data-id="${r.id}" style="background:#f8d7da;border:1px solid #b02a37">DELETE / ARCHIVE RECIPE</button></div>`:''}</div>`
}
function recipeIngredientLine(x,batches){const p=x.products||{};const total=(p.batches||[]).reduce((s,b)=>s+Number(b.quantity||0),0);const need=Number(x.stock_qty_per_batch||0)*batches;const ok=total>=need;const amount=batches===1?x.display_amount:`${batches} × ${x.display_amount}`;return `<div class="batch ${ok?'':'danger'}"><b>${esc(p.name||'Ingredient')}</b><br>${esc(amount)}<br><span class="muted">Stock units needed: ${need} ${esc(p.unit||'')} · Available: ${total}</span> <span class="pill ${ok?'good':'danger'}">${ok?'ENOUGH':'SHORT'}</span></div>`}
async function updateRecipeCalc(id){const batches=Math.max(1,parseInt($('recipe_batches_'+id)?.value||'1'));const {data,error}=await sb.from('recipes').select('base_servings,recipe_ingredients(*,products(*,batches(*)))').eq('id',id).single();if(error)return;$('recipe_servings_'+id).textContent=data.base_servings*batches;$('recipe_lines_'+id).innerHTML=(data.recipe_ingredients||[]).sort((a,b)=>a.sort_order-b.sort_order).map(x=>recipeIngredientLine(x,batches)).join('')}
async function createPickList(id){const {data:liveRole,error:roleError}=await sb.rpc('current_user_role');if(roleError)return alert('Could not verify Manager access: '+roleError.message);if(liveRole!=='manager')return alert('Manager access required.');const batches=Math.max(1,parseInt($('recipe_batches_'+id).value||'1'));const msg=$('recipe_msg_'+id);if(!confirm(`Add this RECIPE to the PICK LIST for ${batches} batch${batches===1?'':'es'}?`))return;msg.textContent='Creating pick list…';const {data,error}=await sb.rpc('create_recipe_pick_list',{p_recipe_id:id,p_batches:batches,p_note:'Created from recipe screen'});if(error){msg.textContent=error.message;return}msg.textContent=`CONFIRMED — Pick list #${data} added. Open PICK LIST to collect the ingredients.`}
async function clearRecipeIngredients(id){const {data:liveRole,error:roleError}=await sb.rpc('current_user_role');if(roleError)return alert('Could not verify Manager access: '+roleError.message);if(liveRole!=='manager')return alert('Manager access required.');if(!confirm('CLEAR ALL INGREDIENTS from this recipe?\n\nThe recipe itself will stay in the system, but its ingredient list will be empty until you upload or enter the revised recipe. Existing pick lists are not changed.'))return;const {data,error}=await sb.rpc('clear_recipe_ingredients',{p_recipe_id:id});if(error)return alert(error.message);alert('Recipe ingredients cleared. You can now upload the revised recipe using the same Recipe Code.');await showRecipes(false)}
async function deleteRecipe(id){const {data:liveRole,error:roleError}=await sb.rpc('current_user_role');if(roleError)return alert('Could not verify Manager access: '+roleError.message);if(liveRole!=='manager')return alert('Manager access required.');if(!confirm('DELETE / ARCHIVE this recipe?\n\nIt will disappear from the active Recipes screen, but historical pick lists will be kept.'))return;const {data,error}=await sb.rpc('archive_recipe',{p_recipe_id:id});if(error)return alert(error.message);alert('Recipe archived. Historical pick lists have been kept.');await showRecipes(false)}
async function showPickLists(setView=true){if(setView)currentView='picklists';const {data,error}=await sb.from('pick_lists').select('*,recipes(code,name,base_servings),pick_list_items(*,products(name,scan_code,unit,location,batches(id,batch_no,expiry_date,quantity,received_date)))').neq('status','cancelled').is('cleared_at',null).order('created_at',{ascending:true});if(error)return alert(error.message);const lists=data||[];const clearBtn=profile?.role==='manager'?`<div class="card"><button id="clearTodayBtn" class="full">CLEAR COMPLETED TODAY</button><p class="small muted">Only completed pick lists are cleared from this active view. Stock is not deducted again and history is kept.</p></div>`:'';$('content').innerHTML=clearBtn+(lists.length?lists.map(pickListCard).join(''):'<div class="card"><h2>Pick List</h2><p>No active pick lists.</p></div>');if($('clearTodayBtn'))$('clearTodayBtn').onclick=clearCompletedToday;document.querySelectorAll('.pickListItemBtn').forEach(b=>b.onclick=()=>pickListItem(parseInt(b.dataset.id)));document.querySelectorAll('.claimAndScanBtn').forEach(b=>b.onclick=()=>claimAndScan(parseInt(b.dataset.id), b.dataset.name||'Ingredient'));document.querySelectorAll('.releaseClaimBtn').forEach(b=>b.onclick=()=>releasePickClaim(parseInt(b.dataset.id)))}