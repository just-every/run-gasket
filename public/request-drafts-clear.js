// The native sign-out navigation revokes the session before this document.
// Clear every portal's contact details and original photos before leaving it.
(() => {
  const channel=typeof BroadcastChannel==='function'?new BroadcastChannel('gasket-request-drafts'):null;
  channel?.postMessage('signout');
  const open=indexedDB.open('gasket-request-drafts',1);
  open.onupgradeneeded=()=>open.result.createObjectStore('drafts');
  const failed=()=>{document.querySelector('[role=status]').textContent='Signed out. Device drafts could not be cleared. Reload this page to try again.';channel?.close();};
  open.onerror=failed;
  open.onsuccess=()=>{
    const db=open.result,tx=db.transaction('drafts','readwrite');
    tx.objectStore('drafts').clear();
    tx.oncomplete=()=>{db.close();channel?.close();location.replace('/signin');};
    tx.onerror=tx.onabort=()=>{db.close();failed();};
  };
})();
