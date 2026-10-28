// Drafts stay on this device, including original File objects. Only an explicit
// Send transmits them. A saved submission key survives reload and uncertain replies.
(() => {
  const form=document.querySelector('#request-form');if(!form)return;
  const messages=JSON.parse(form.dataset.messages),t=key=>messages[key];
  const status=document.querySelector('#draft-status'),saveButton=document.querySelector('#save-request-draft'),clearButton=document.querySelector('#clear-request-draft');
  const scope=`${form.dataset.portal}:${form.dataset.target}`,initialTarget=form.dataset.target;
  const cookie=`gasket-draft-signout_${location.port || (location.protocol==='https:'?'443':'80')}=`;
  const generation=()=>document.cookie.split(';').map(value=>value.trim()).find(value=>value.startsWith(cookie))?.slice(cookie.length) || '';
  const openedGeneration=generation();
  let db,ready=false,timer,submitting=false,invalidated=false;
  const receiptLink=form.querySelector('[data-request-receipt]');
  function updateReceipt(){receiptLink.href=`${form.action}/received/${encodeURIComponent(form.elements.namedItem('submissionKey').value)}`;}
  function clearForm(){clearTimeout(timer);form.reset();form.elements.namedItem('saveOnDevice').checked=false;form.elements.namedItem('submissionKey').value=crypto.randomUUID();updateReceipt();}
  function invalidate(){if(invalidated)return;invalidated=true;clearForm();const connection=db;db=null;
    if(connection){void fence(connection,generation()).catch(()=>{/* Clear-Site-Data may already have closed this connection. */});connection.close();}
    status.textContent=t('invalidated');
  }
  function current(){if(generation()!==openedGeneration)invalidate();return !invalidated;}
  const channel=typeof BroadcastChannel==='function'?new BroadcastChannel('gasket-request-drafts'):null;
  if(channel)channel.onmessage=event=>{if(event.data==='signout')invalidate();};
  for(const event of ['focus','pageshow'])window.addEventListener(event,current);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)current();});
  const open=indexedDB.open('gasket-request-drafts',1);
  open.onupgradeneeded=()=>open.result.createObjectStore('drafts');
  const transact=(mode,run,connection=db)=>new Promise((resolve,reject)=>{const tx=connection.transaction('drafts',mode),store=tx.objectStore('drafts');let value;run(store,r=>{r.onsuccess=()=>value=r.result;});tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
  const fence=(connection,value)=>transact('readwrite',s=>{const read=s.get('$generation');read.onsuccess=()=>{if(read.result!==value){s.clear();s.put(value,'$generation');}};},connection);
  const entries=()=>[...new FormData(form)].filter(([name])=>name!=='website');
  function draftStatus(message){if(!submitting&&status.getAttribute('role')!=='alert')status.textContent=message;}
  async function save(){if(!current())return false;if(!ready||!db){draftStatus(t('unavailable'));return false;}try{if(!form.elements.namedItem('saveOnDevice').checked){await transact('readwrite',s=>s.delete(scope));if(current())draftStatus(t('chooseStorage'));return false;}await transact('readwrite',s=>s.put({entries:entries(),generation:openedGeneration},scope));if(!current())return false;draftStatus(t('saved'));return true;}catch{if(current())draftStatus(t('saveFailed'));return false;}}
  async function restore(){await fence(db,openedGeneration);
    if(!current())return;const draft=await transact('readonly',(s,r)=>r(s.get(scope)));if(!current()||!draft)return;
    // Old private drafts predate the sign-out fence and are unsafe to restore.
    // Clearing the store also removes dormant drafts from other portal scopes.
    if(draft.generation!==openedGeneration){await transact('readwrite',s=>{s.clear();s.put(openedGeneration,'$generation');});return;}
    if(draft.receipt){status.textContent=t('previous');const link=document.createElement('a');link.href=draft.receipt;link.textContent=t('openConfirmation');status.append(link);form.elements.namedItem('submissionKey').value=crypto.randomUUID();updateReceipt();return;}
    for(const [name,value] of draft.entries){const control=form.elements.namedItem(name);if(!control)continue;if(name==='target'&&initialTarget&&value!==initialTarget)continue;
      if(control.type==='checkbox'){control.checked=value==='yes';continue;}if(value instanceof File){if(value.size){const transfer=new DataTransfer();transfer.items.add(value);control.files=transfer.files;}}else control.value=value;
    }updateReceipt();status.textContent=t('restored');
  }
  open.onsuccess=async()=>{if(!current()){open.result.close();return;}db=open.result;db.onversionchange=()=>invalidate();db.onclose=()=>invalidate();try{await restore();ready=!invalidated;}catch{if(current()){status.textContent=t('draftUnavailable');ready=true;}}};
  open.onerror=()=>{ready=true;status.textContent=t('unavailable');};
  form.addEventListener('invalid',event=>{const control=event.target;control.setCustomValidity(t(control.validity.valueMissing?'required':'invalid'));},true);
  form.addEventListener('input',event=>{event.target.setCustomValidity?.('');});
  form.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(save,250);});form.addEventListener('change',save);
  saveButton.addEventListener('click',save);
  clearButton.addEventListener('click',async()=>{if(!current())return;clearTimeout(timer);if(ready&&db)await transact('readwrite',s=>s.delete(scope));clearForm();status.textContent=t('cleared');});
  form.addEventListener('submit',async event=>{event.preventDefault();if(submitting||!form.reportValidity())return;
    if(!current())return;
    if(!ready){status.textContent=t('notReady');return;}
    clearTimeout(timer);if(form.elements.namedItem('saveOnDevice').checked && !await save())return;submitting=true;const body=new FormData(form),controls=[...form.elements].filter(c=>!c.disabled);controls.forEach(c=>c.disabled=true);
    status.setAttribute('role','status');status.textContent=t('sending');try{
      const response=await fetch(form.action,{method:'POST',body,headers:{Accept:'application/json'}}),result=await response.json();
      if(!response.ok){const failure=new Error(result.error||'send_failed');failure.persistence=result.persistence;failure.explanation=result.message;throw failure;}
      // Retain the receipt in the draft before clearing private contact/photo data.
      if(!current())return;
      if(db)await transact('readwrite',s=>form.elements.namedItem('saveOnDevice').checked?s.put({receipt:result.receipt,generation:openedGeneration},scope):s.delete(scope));
      if(!current())return;
      location.assign(result.receipt);
    }catch(error){if(!current())return;const explanation=error.explanation||t('error_generic');status.setAttribute('role','alert');status.tabIndex=-1;status.focus();status.textContent=[t(error.persistence==='none'?'nothingSaved':'unconfirmed'),form.elements.namedItem('saveOnDevice').checked?t('draftKept'):'',t('retry'),explanation].filter(Boolean).join(' ');}
    finally{submitting=false;controls.forEach(c=>c.disabled=false);}
  });
})();
