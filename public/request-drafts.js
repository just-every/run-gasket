// Drafts stay on this device, including original File objects. Only an explicit
// Send transmits them. A saved submission key survives reload and uncertain replies.
(() => {
  const form=document.querySelector('#request-form');if(!form)return;
  const status=document.querySelector('#draft-status'),saveButton=document.querySelector('#save-request-draft'),clearButton=document.querySelector('#clear-request-draft');
  const scope=`${form.dataset.portal}:${form.dataset.target}`,initialTarget=form.dataset.target;
  let db,ready=false,timer,submitting=false;
  const open=indexedDB.open('gasket-request-drafts',1);
  open.onupgradeneeded=()=>open.result.createObjectStore('drafts');
  const transact=(mode,run)=>new Promise((resolve,reject)=>{const tx=db.transaction('drafts',mode),store=tx.objectStore('drafts');let value;run(store,r=>{r.onsuccess=()=>value=r.result;});tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
  const entries=()=>[...new FormData(form)].filter(([name])=>name!=='website');
  async function save(){if(!ready)return false;try{await transact('readwrite',s=>s.put({entries:entries()},scope));status.textContent='Draft saved on this device, including photos. Send when ready.';return true;}catch{status.textContent='Draft could not be saved. Keep this page open and try again.';return false;}}
  async function restore(){const draft=await transact('readonly',(s,r)=>r(s.get(scope)));if(!draft)return;if(draft.receipt){status.textContent='Your previous request is saved. ';const link=document.createElement('a');link.href=draft.receipt;link.textContent='Open confirmation';status.append(link);form.elements.namedItem('submissionKey').value=crypto.randomUUID();return;}
    for(const [name,value] of draft.entries){const control=form.elements.namedItem(name);if(!control)continue;if(name==='target'&&initialTarget&&value!==initialTarget)continue;
      if(value instanceof File){if(value.size){const transfer=new DataTransfer();transfer.items.add(value);control.files=transfer.files;}}else control.value=value;
    }status.textContent='Saved draft restored, including photos. Check the fault before sending.';
  }
  open.onsuccess=async()=>{db=open.result;try{await restore();ready=true;}catch{status.textContent='Saved draft unavailable. Keep this page open.';ready=true;}};
  open.onerror=()=>{status.textContent='Device storage is unavailable. Keep this page open until the request is confirmed.';};
  form.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(save,250);});form.addEventListener('change',save);
  saveButton.addEventListener('click',save);
  clearButton.addEventListener('click',async()=>{if(!ready)return;await transact('readwrite',s=>s.delete(scope));form.reset();form.elements.namedItem('submissionKey').value=crypto.randomUUID();status.textContent='Draft cleared from this device.';});
  form.addEventListener('submit',async event=>{event.preventDefault();if(submitting||!form.reportValidity())return;
    if(!ready){status.textContent='Device storage is not ready. Keep this page open or retry shortly.';return;}
    clearTimeout(timer);if(!await save())return;submitting=true;const button=form.querySelector('[type=submit]');button.disabled=true;
    status.textContent='Sending request…';try{
      const response=await fetch(form.action,{method:'POST',body:new FormData(form),headers:{Accept:'application/json'}}),result=await response.json();
      if(!response.ok)throw new Error(result.error||'send_failed');
      // Retain the receipt in the draft before clearing private contact/photo data.
      await transact('readwrite',s=>s.put({entries:[['submissionKey',form.elements.namedItem('submissionKey').value]],receipt:result.receipt},scope));
      location.assign(result.receipt);
    }catch(error){status.textContent=`Not confirmed. Your saved draft is kept. Reconnect and press Send request again. ${error.message==='Failed to fetch'?'':error.message}`;}
    finally{submitting=false;button.disabled=false;}
  });
})();
