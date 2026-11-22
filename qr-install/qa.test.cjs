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
