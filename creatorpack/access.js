const endpoint = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
  ? '/__creator-intake'
  : 'https://qoxoutfmmmuzjneyvryi.supabase.co/functions/v1/creator-pack-intake';
const form=document.getElementById('access-form');
const field=document.getElementById('creator-password');
const status=document.getElementById('access-status');
const loading=document.getElementById('access-loading');
function showGate(){loading.hidden=true;form.hidden=false;}
function readSession(){try{return sessionStorage.getItem('creator-pack-session');}catch{return null;}}
let busy=false;
async function openPage(password) {
  if(busy)return;busy=true;form.querySelector('button').disabled=true;status.textContent='';
  try {
    const session=readSession();
    const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',...(session?{Authorization:'Bearer '+session}:{})},body:JSON.stringify(password===undefined?{action:'page'}:{action:'login',password}),signal:AbortSignal.timeout(30000)});
    const data=await response.json().catch(()=>({}));
    if(!response.ok){if(response.status===401)sessionStorage.removeItem('creator-pack-session');throw new Error(data.error || 'Couldn’t open the page. Please try again.');}
    if(typeof data.html!=='string')throw new Error('Couldn’t open the page. Please try again.');
    if(data.session)sessionStorage.setItem('creator-pack-session',data.session);
    field.value='';
    const parsed=new DOMParser().parseFromString(data.html,'text/html');
    // Show neutral loading while a saved session is verified; never expose protected HTML before verification.
    const images=[...parsed.querySelectorAll('.cover img,.header img')];
    await Promise.race([new Promise(resolve=>setTimeout(resolve,4000)),Promise.all(images.map(async(img)=>{const preload=new Image();preload.src=new URL(img.getAttribute('src'),location.href).href;try{await preload.decode();}catch{}}))]);
    document.body.replaceChildren(...parsed.body.childNodes);
    document.title='Create your pack · SideQuest';
    await import('./page.js');
    if(location.hash==='#make-your-pack')document.getElementById('make-your-pack').scrollIntoView();
  }catch(error){showGate();status.textContent=error.name==='TimeoutError'?'The connection timed out. Please try again.':error.message;field.focus();}
  finally{busy=false;form.querySelector('button').disabled=false;}
}
form.addEventListener('submit',event=>{event.preventDefault();if(form.reportValidity())openPage(field.value);});
if(readSession())openPage();else showGate();
