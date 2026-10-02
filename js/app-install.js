let deferredInstallPrompt=null;

function installRoleAllowed(){
  const role=(window.profile?.role||'').toLowerCase();
  return role==='manager'||role==='qa_manager';
}

function refreshInstallAccess(){
  const btn=document.getElementById('installAppBtn');
  if(!btn)return;
  btn.classList.toggle('hide',!installRoleAllowed());
}

window.addEventListener('beforeinstallprompt',event=>{
  event.preventDefault();
  deferredInstallPrompt=event;
  refreshInstallAccess();
});

window.addEventListener('appinstalled',()=>{
  deferredInstallPrompt=null;
  const btn=document.getElementById('installAppBtn');
  if(btn)btn.textContent='APP INSTALLED';
});

document.addEventListener('DOMContentLoaded',()=>{
  const btn=document.getElementById('installAppBtn');
  const rolepill=document.getElementById('rolepill');
  refreshInstallAccess();
  if(rolepill)new MutationObserver(refreshInstallAccess).observe(rolepill,{childList:true,subtree:true,attributes:true});
  if(!btn)return;
  btn.addEventListener('click',async()=>{
    if(!installRoleAllowed()){
      alert('Only Managers and QA Managers can use the in-app install control.');
      return;
    }
    if(deferredInstallPrompt){
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt=null;
      return;
    }
    const isiOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
    if(isiOS){
      alert('On iPhone/iPad: open this page in Safari, tap Share, then Add to Home Screen.');
    }else{
      alert('If no install prompt appears, use your browser menu and choose Install app or Add to Home screen.');
    }
  });
});
