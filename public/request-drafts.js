// Drafts stay on this device, including original File objects. Only an explicit
// Send transmits them. A saved submission key survives reload and uncertain replies.
(() => {
  const form=document.querySelector('#request-form');if(!form)return;
  const status=document.querySelector('#draft-status'),saveButton=document.querySelector('#save-request-draft'),clearButton=document.querySelector('#clear-request-draft');
  const scope=`${form.dataset.portal}:${form.dataset.target}`,initialTarget=form.dataset.target;
  const cookie=`gasket-draft-signout_${location.port || (location.protocol==='https:'?'443':'80')}=`;
  const generation=()=>document.cookie.split(';').map(value=>value.trim()).find(value=>value.startsWith(cookie))?.slice(cookie.length) || '';
  const openedGeneration=generation();
  let db,ready=false,timer,submitting=false,invalidated=false;
  function clearForm(){clearTimeout(timer);form.reset();form.elements.namedItem('saveOnDevice').checked=false;form.elements.namedItem('submissionKey').value=crypto.randomUUID();}
  function invalidate(){if(invalidated)return;invalidated=true;clearForm();const connection=db;db=null;
    if(connection){void fence(connection,generation()).catch(()=>{/* Clear-Site-Data may already have closed this connection. */});connection.close();}
    status.textContent='Draft cleared from this device. Reload before starting a new draft.';
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
  async function save(){if(!current())return false;if(!ready||!db){status.textContent='Device storage is unavailable. Keep this page open until the request is confirmed.';return false;}try{if(!form.elements.namedItem('saveOnDevice').checked){await transact('readwrite',s=>s.delete(scope));if(current())status.textContent='Choose private device storage to save a draft and photos.';return false;}await transact('readwrite',s=>s.put({entries:entries(),generation:openedGeneration},scope));if(!current())return false;status.textContent='Draft saved on this device, including photos. Send when ready.';return true;}catch{if(current())status.textContent='Draft could not be saved. Keep this page open and try again.';return false;}}
  async function restore(){await fence(db,openedGeneration);
    if(!current())return;const draft=await transact('readonly',(s,r)=>r(s.get(scope)));if(!current()||!draft)return;
    // Old private drafts predate the sign-out fence and are unsafe to restore.
    // Clearing the store also removes dormant drafts from other portal scopes.
    if(draft.generation!==openedGeneration){await transact('readwrite',s=>{s.clear();s.put(openedGeneration,'$generation');});return;}
    if(draft.receipt){status.textContent='Your previous request is saved. ';const link=document.createElement('a');link.href=draft.receipt;link.textContent='Open confirmation';status.append(link);form.elements.namedItem('submissionKey').value=crypto.randomUUID();return;}
    for(const [name,value] of draft.entries){const control=form.elements.namedItem(name);if(!control)continue;if(name==='target'&&initialTarget&&value!==initialTarget)continue;
      if(control.type==='checkbox'){control.checked=value==='yes';continue;}if(value instanceof File){if(value.size){const transfer=new DataTransfer();transfer.items.add(value);control.files=transfer.files;}}else control.value=value;
    }status.textContent='Saved draft restored, including photos. Check the fault before sending.';
  }
  open.onsuccess=async()=>{if(!current()){open.result.close();return;}db=open.result;db.onversionchange=()=>invalidate();db.onclose=()=>invalidate();try{await restore();ready=!invalidated;}catch{if(current()){status.textContent='Saved draft unavailable. Keep this page open.';ready=true;}}};
  open.onerror=()=>{ready=true;status.textContent='Device storage is unavailable. Keep this page open until the request is confirmed.';};
  form.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(save,250);});form.addEventListener('change',save);
  saveButton.addEventListener('click',save);
  clearButton.addEventListener('click',async()=>{if(!current())return;clearTimeout(timer);if(ready&&db)await transact('readwrite',s=>s.delete(scope));clearForm();status.textContent='Draft cleared from this device.';});
  form.addEventListener('submit',async event=>{event.preventDefault();if(submitting||!form.reportValidity())return;
    if(!current())return;
    if(!ready){status.textContent='Device storage is not ready. Keep this page open or retry shortly.';return;}
    clearTimeout(timer);if(form.elements.namedItem('saveOnDevice').checked && !await save())return;submitting=true;const body=new FormData(form),controls=[...form.elements].filter(c=>!c.disabled);controls.forEach(c=>c.disabled=true);
    status.textContent='Sending request…';try{
      const response=await fetch(form.action,{method:'POST',body,headers:{Accept:'application/json'}}),result=await response.json();
      if(!response.ok)throw new Error(result.error||'send_failed');
      // Retain the receipt in the draft before clearing private contact/photo data.
      if(!current())return;
      if(db)await transact('readwrite',s=>form.elements.namedItem('saveOnDevice').checked?s.put({receipt:result.receipt,generation:openedGeneration},scope):s.delete(scope));
      if(!current())return;
      location.assign(result.receipt);
    }catch(error){if(!current())return;const explanation=error.message==='intake_rate_limited'?'Too many requests from this network. Try again next hour.':error.message==='portal_changed'?'The site form changed. Reload and check its required fields.':error.message==='label_retired'?'This label is retired. Ask maintenance for its current label.':error.message==='portal_closed'?'This intake is closed. Contact maintenance.':error.message==='submission_key_reused'?'An earlier version was sent. Check its confirmation before starting another report.':error.message==='file_size'?'Each photo must be 1.5 MB or smaller.':error.message.startsWith('missing_')?'Complete all required site fields.':'';status.textContent=`Not confirmed. ${form.elements.namedItem('saveOnDevice').checked?'Your saved draft is kept. ':''}Reconnect and press Send request again. ${explanation}`;}
    finally{submitting=false;controls.forEach(c=>c.disabled=false);}
  });
})();
