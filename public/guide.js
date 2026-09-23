try{
 const status=await fetch('/api/status').then(r=>r.json());
 if(!status.downloadReady){const link=document.getElementById('source-download');const text=document.createElement('span');text.textContent='Get the source archive from the repository or the person who shared this workspace';link.replaceWith(text);}
}catch{}
