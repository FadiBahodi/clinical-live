document.querySelector('#login-form').onsubmit=async event=>{
 event.preventDefault();const code=document.querySelector('#access-code'),error=document.querySelector('#login-error');
 try{const response=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:code.value})});code.value='';if(!response.ok)throw new Error('Access code not accepted. Try again shortly.');location.replace('/');}
 catch(e){error.textContent=e.message;}
};
