const { createClient } = require('@supabase/supabase-js');
const pushEndpoint = require('../lib/push-endpoint');
const push = require('web-push');

module.exports = async function qa(req,res) {
  res.setHeader('Cache-Control','no-store');
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const authorization = req.headers.authorization || '';
    if (!authorization.startsWith('Bearer ')) return res.status(401).end();
    const url = process.env.SUPABASE_URL;
    const staff = createClient(url,process.env.SUPABASE_ANON_KEY,{global:{headers:{Authorization:authorization}}});
    const {data:{user},error} = await staff.auth.getUser(authorization.slice(7));
    if (error || !user) return res.status(401).end();
    const admin = createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY);
    const {data:profile} = await staff.from('profiles').select('role').eq('user_id',user.id).single();
    if (!profile) return res.status(403).end();
    const {action,subscription,batch} = req.body || {};
    if (action === 'key') return res.json({key:process.env.VAPID_PUBLIC_KEY});
    if (action === 'off') {
      const result = await admin.from('qa_push_devices').delete().eq('owner_id',user.id).eq('endpoint',subscription?.endpoint || '');
      if(result.error) throw result.error;
      return res.json({ok:true});
    }
    if (action === 'on') {
      if (!['qa','qa_manager'].includes(profile.role)) return res.status(403).end();
      const endpoint = pushEndpoint(subscription);
      if (!endpoint) return res.status(400).json({error:'Use the installed iPhone app or Chrome on Android for QA alerts.'});
      const result = await admin.from('qa_push_devices').upsert({owner_id:user.id,endpoint,subscription:{endpoint,keys:subscription.keys}});
      if(result.error) throw result.error;
      return res.json({ok:true});
    }
    if(action !== 'request' || !Number.isSafeInteger(batch)) return res.status(400).end();
    const call = await staff.rpc('call_expiry_qa',{batch}).single();
    if(call.error) return res.status(400).json({error:call.error.message});
    if(!call.data.is_new) return res.json({existing:true});
    const lot = await staff.from('batches').select('batch_no,products(name)').eq('id',batch).single();
    const devices = await admin.from('qa_push_devices').select('*');
    if(lot.error || devices.error) throw Error('Delivery lookup failed');
    const owners = [...new Set(devices.data.map(d=>d.owner_id))];
    if(!owners.length) return res.json({sent:0});
    const roles = await admin.from('profiles').select('user_id').in('user_id',owners).in('role',['qa','qa_manager']);
    if(roles.error) throw roles.error;
    const eligible = new Set(roles.data.map(p=>p.user_id));
    push.setVapidDetails(process.env.VAPID_SUBJECT,process.env.VAPID_PUBLIC_KEY,process.env.VAPID_PRIVATE_KEY);
    const payload = JSON.stringify({batch,title:'QA requested',body:lot.data.products.name+' · '+lot.data.batch_no});
    const results = await Promise.all(devices.data.filter(d=>eligible.has(d.owner_id)).map(async d=>{
      try { await push.sendNotification(d.subscription,payload,{TTL:600,timeout:8000}); return true; }
      catch(e) {
        if([404,410].includes(e.statusCode)) await admin.from('qa_push_devices').delete().eq('endpoint',d.endpoint);
        return false;
      }
    }));
    return res.json({sent:results.filter(Boolean).length});
  } catch {
    return res.status(503).json({error:'QA service unavailable. Check the request status and contact QA directly if needed.'});
  }
};
