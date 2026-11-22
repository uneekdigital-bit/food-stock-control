const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const src=fs.readFileSync('qa.js','utf8');
const context=vm.createContext({Intl,Date,profile:{role:'picker'},esc:String});
vm.runInContext(src,context);
const run=code=>vm.runInContext(code,context);
test('expiry applies per stocked batch in London',()=>{
  assert.match(run("qaControl({id:1,expiry_date:'2000-01-01',quantity:1})"),/Request QA/);
  assert.equal(run("qaControl({id:2,expiry_date:'2099-01-01',quantity:1})"),'');
  assert.equal(run("qaControl({id:1,expiry_date:'2000-01-01',quantity:0})"),'');
});
test('waiting and acknowledgement replace request button',()=>{
  run("qaCalls.set(1,{id:10,expiry_date:'2000-01-01'})");
  assert.match(run("qaLabel(1,'2000-01-01')"),/^Waiting for QA/);
  assert.doesNotMatch(run("qaLabel(1,'2000-01-01')"),/button/);
  run("profile.role='qa'");
  assert.match(run("qaLabel(1,'2000-01-01')"),/on my way/);
  run("Object.assign(qaCalls.get(1),{responder:'1',responder_name:'Sam'})");
  assert.equal(run("qaLabel(1,'2000-01-01')"),'Sam is on the way');
});
test('installed build scripts parse and both scan entries stop before picking',()=>{
  const html=fs.readFileSync('index.html','utf8');
  for(const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(m[1]);
  assert.match(html,/if\(expiredBatch\(batch\)\)\{await stopItemBatchScanner\(\);return scannedExpired/);
  assert.match(html,/if\(expiredBatch\(batch\)\)return scannedExpired/);
  assert.match(html,/qaControl\(x.b\)/);
});
test('QA subscriptions accept Apple and Android Chrome push services',()=>{
  const endpoint=require('./lib/push-endpoint');
  const keys={auth:'test',p256dh:'test'};
  for(const url of ['https://web.push.apple.com/token','https://fcm.googleapis.com/fcm/send/token','https://fcm.googleapis.com/wp/token']){
    assert.equal(endpoint({endpoint:url,keys}),url);
  }
  for(const url of ['http://fcm.googleapis.com/wp/token','https://fcm.googleapis.com.example.org/wp/token','https://fcm.googleapis.com/unrelated','invalid']){
    assert.equal(endpoint({endpoint:url,keys}),null);
  }
});
test('only the requesting picker sees the acknowledgement, and OK clears it across refresh',()=>{
  const elements=new Map(), storage=new Map();
  const document={
    getElementById:id=>elements.get(id),
    body:{append:d=>elements.set(d.id,d)},
    createElement:()=>{
      const p={},button={};
      return {setAttribute(){},addEventListener(){},showModal(){},close(){},remove(){elements.delete(this.id)},querySelector:s=>s==='p'?p:button};
    }
  };
  const call={id:11,requested_by:'p',responder:'qa',responder_name:'Qas',batches:{batch_no:'LOT-A',products:{name:'Cheddar'}}};
  const ctx=vm.createContext({profile:{role:'picker',user_id:'p'},document,localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},call});
  vm.runInContext(src,ctx);
  const show=()=>vm.runInContext('showPickerAcknowledgement([call])',ctx);
  ctx.profile.user_id='other';show();assert.equal(elements.size,0);
  ctx.profile.user_id='p';show();
  const dialog=elements.get('qaOnWay');
  assert.match(dialog.querySelector('p').textContent,/Qas.*Cheddar.*LOT-A/);
  show();assert.equal(elements.get('qaOnWay'),dialog);
  dialog.querySelector('button').onclick();
  vm.runInContext('dismissedQaNotices.clear()',ctx);show();assert.equal(elements.size,0);
});
