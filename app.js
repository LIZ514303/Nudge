const $ = id => document.getElementById(id);
const STORE='nudge-v2-profile', SESSION='nudge-v2-stream', BG='nudge-v2-bg';
let profile, stream, background, selectedModel='', activeProvider='openai', audioCtx=null, audioNodes=[], audioGain=null, playing=false, busy=false;
let cameraStream=null,cameraRevision=0,taskReplyQueue=Promise.resolve();
const ambient = new Audio(); ambient.loop = true; ambient.preload = 'none';
let soundVolume = 0.5;
let configRevision=0, connectionState='checking', sharedConfig={configured:false,provider:'openai',model:''};
function updateConnectionUI(){
 const name=sharedConfig.provider==='deepseek'?'DeepSeek':'OpenAI';
 const text=sharedConfig.configured?`${name} · ${sharedConfig.model} · shared by everyone on this server`:'Demo chat · no shared model configured';
 $('chat-mode').textContent=sharedConfig.configured?'Shared model configured':'Demo chat';
 $('config-summary').textContent=text+'. This connection applies to all visitors. Only the host can change this configuration.';
 $('mode').textContent=sharedConfig.configured?'✦  SHARED AI':'✦  DEMO MODE';
}
async function refreshConfig(){try {const r=await fetch('/api/config');if(!r.ok)return;sharedConfig=await r.json();activeProvider=sharedConfig.provider;selectedModel=sharedConfig.model;updateConnectionUI();}catch{}}
try { profile=JSON.parse(localStorage.getItem(STORE)) || {coins:0,streams:0,days:{}}; } catch { profile={coins:0,streams:0,days:{}}; }
try { stream=JSON.parse(localStorage.getItem(SESSION)); } catch { stream=null; }
profile.sessions ||= []; profile.rewards ||= {};
try { background=localStorage.getItem(BG)||''; } catch { background=''; }
const people=['mochi','pixelpuff','stardust','lilac_bun','minty','bookwyrm','peach_soda','nova','cozy_fox','maple','cloudlet','sunnybyte'].map((name,i)=>({name,icon:['✿','☾','✧','♡'][i%4],avatar:pixelAvatar(i)}));
function pixelAvatar(i){
 const colors=['#b399d4','#e4a8c2','#94cbbb','#e7bd78','#9aafdc','#cc99b6'],hair=['#493149','#634641','#323950','#825d3f'];
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges"><rect width="16" height="16" fill="${colors[i%6]}"/><path d="M3 6h10v8H3z" fill="${hair[i%4]}"/><path d="M5 4h6v2h2v6h-2v2H5v-2H3V6h2z" fill="${['#f4d6b7','#ddb58f','#bd886e'][i%3]}"/><path d="M3 4h2V2h6v2h2v3H9V5H7v2H3z" fill="${hair[i%4]}"/><path d="M5 8h2v2H5zm4 0h2v2H9z" fill="#35233f"/><path d="M7 11h2v1H7z" fill="#b46c7e"/><path d="M4 14h8v2H4z" fill="${colors[(i+2)%6]}"/>${i%2?'<path d="M2 3h12v2H2zM4 1h8v2H4z" fill="#fff0bd"/>':''}${i%3===0?'<path d="M4 8h3v3H4zm5 0h3v3H9zM7 9h2v1H7z" fill="none" stroke="#6e5286" stroke-width="1"/>':''}</svg>`;
 return 'data:image/svg+xml,'+encodeURIComponent(svg);
}
function nextViewer(){const recent=stream?.messages.filter(m=>m.kind==='viewer').slice(-2).map(m=>m.name)||[];return pick(people.filter(p=>!recent.includes(p.name)));}
const prompts=['how’s it going?','still on this bit?','quick vibe check 👀','making progress?'];
const pick=a=>a[Math.floor(Math.random()*a.length)];
function persist(){localStorage.setItem(STORE,JSON.stringify(profile));if(stream)localStorage.setItem(SESSION,JSON.stringify(stream));else localStorage.removeItem(SESSION);}
function page(name){if(name!=='live')stopCamera();$('return-live').hidden=!stream;document.body.classList.toggle('in-live',name==='live');document.querySelectorAll('.page').forEach(el=>el.hidden=el.id!==name);document.querySelectorAll('.nav').forEach(el=>el.classList.toggle('active',el.dataset.page===name));$('page-title').textContent=({dashboard:'Streamer dashboard',setup:'Stream setup',settings:'Room settings',live:'Your study stream',summary:'Stream summary'})[name]; if(name==='dashboard')dashboard();}
document.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>page(b.dataset.page)));
$('return-live').addEventListener('click',showLive);
document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>page(b.dataset.go)));
function dayKey(date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
function dashboard(){ renderQuests();renderHistory(); $('coins').textContent=profile.coins;$('streams').textContent=profile.streams;$('level').textContent=String(1+Math.floor(profile.streams/3)).padStart(2,'0');$('level-desc').textContent=profile.streams?'Growing at your own pace':'A fresh little start';$('badge-first').textContent=profile.streams>=1?'UNLOCKED':'LOCKED';$('badge-five').textContent=profile.streams>=5?'UNLOCKED':'LOCKED';let values=[],labels=[];for(let i=6;i>=0;i--){let d=new Date();d.setDate(d.getDate()-i);values.push(profile.days[dayKey(d)]||0);labels.push(d.toLocaleDateString('en-GB',{weekday:'short'}).toUpperCase());}let max=Math.max(60,...values),pts=values.map((n,i)=>`${i*100},${140-n/max*125}`).join(' ');$('chart-max').textContent=`${Math.ceil(max)}m`;$('chart').innerHTML=`<polyline points="${pts}" fill="none" stroke="#b595cf" stroke-width="3" vector-effect="non-scaling-stroke"/>`+values.map((n,i)=>`<circle cx="${i*100}" cy="${140-n/max*125}" r="5" fill="#fff" stroke="#b595cf" stroke-width="3" vector-effect="non-scaling-stroke"/>`).join('');$('chart-days').replaceChildren(...labels.map(x=>{let e=document.createElement('span');e.textContent=x;return e}));}
function applyBackground(){['setup-preview','settings-preview','stage'].forEach(id=>{let e=$(id);e.style.backgroundImage=background?`url(${JSON.stringify(background)})`:'';e.classList.toggle('has-image',!!background);});}
$('background').addEventListener('change',()=>{let file=$('background').files[0];if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>2*1024*1024){alert('Please choose a PNG, JPG or WebP image under 2 MB.');$('background').value='';return;}let reader=new FileReader();reader.onload=()=>{try{localStorage.setItem(BG,reader.result);background=reader.result;applyBackground();}catch{alert('There is not enough browser storage for this image.');}};reader.readAsDataURL(file);});
$('reset-bg').addEventListener('click',()=>{background='';localStorage.removeItem(BG);$('background').value='';applyBackground();});
const local=location.hostname==='localhost'||location.hostname==='127.0.0.1';
if(!local){['api-key','save-key','clear-key'].forEach(id=>$(id).disabled=true);$('key-note').textContent='Only the host can connect AI at localhost. Everyone visiting this server shares that connection.';}
function draftKey(){return $('api-key').value.trim();}
async function apiAction(path, body){
 let r;
 try { r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); }
 catch { throw Error('Could not reach the Nudge server. Check that it is running.'); }
 if(r.status===404)throw Error(`Nudge route ${path} was not found (local HTTP 404). Restart the server using the latest app.py, then refresh this page.`);
 let d;try{d=await r.json();}catch{throw Error(`Nudge returned an unexpected response (HTTP ${r.status}). Check the server address and version.`);}
 if(!r.ok)throw Error(d.error||`Request failed (HTTP ${r.status}).`);return d;
}
$('save-key').addEventListener('click',async()=>{
 try{$('save-key').disabled=true;$('key-note').textContent='Finding and testing an OpenAI chat model…';sharedConfig=await apiAction('/api/config',{api_key:draftKey(),provider:'openai',auto:true});$('api-key').value='';configRevision++;updateConnectionUI();$('key-note').textContent='Connected for everyone. Text model selected and tested automatically.';}
 catch(e){$('key-note').textContent='Connection failed: '+e.message;}finally{$('save-key').disabled=!local;}
});
$('clear-key').addEventListener('click',async()=>{
 try{sharedConfig=await apiAction('/api/config',{clear:true});$('api-key').value='';configRevision++;updateConnectionUI();$('key-note').textContent='Disconnected for everyone. Text demo mode is available.';}
 catch(e){$('key-note').textContent=e.message;}
});
function audioStop(){ambient.pause(); audioNodes.forEach(n=>{try{n.stop()}catch{}});audioNodes=[];if(audioCtx){audioCtx.close();audioCtx=null;}audioGain=null;playing=false;}
async function audioStart(type){
  audioStop(); if(type==='off')return;
  try {
    if(['birds','stream','wind','noise','lofi'].includes(type)) {
      const src=`/audio/${type==='noise'?'white-noise':type}.ogg`;
      if(ambient.getAttribute('src')!==src) { ambient.src=src; ambient.load(); }
      ambient.volume=soundVolume; await ambient.play();
    } else {
      audioCtx=new (window.AudioContext||window.webkitAudioContext)(); audioGain=audioCtx.createGain();
      audioGain.gain.value=(type==='noise'?.05:.07)*soundVolume;audioGain.connect(audioCtx.destination);
      if(type==='noise'){let b=audioCtx.createBuffer(1,audioCtx.sampleRate*2,audioCtx.sampleRate),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;let node=audioCtx.createBufferSource();node.buffer=b;node.loop=true;node.connect(audioGain);node.start();audioNodes.push(node);}
      else {[130.81,164.81,196,246.94].forEach(f=>{let o=audioCtx.createOscillator();o.type='sine';o.frequency.value=f;o.connect(audioGain);o.start();audioNodes.push(o);});}
      await audioCtx.resume();
    }
    playing=true; $('sound-status').textContent='Playing. Select a different sound or pause anytime.';
  } catch(error) { audioStop(); $('sound-status').textContent='Could not play this sound in your browser. Please try another sound.'; }
  updateSoundControls();
}
function updateSoundControls(){if(!stream)return;$('live-sound').value=stream.sound||'off';$('sound-toggle').textContent=playing?'Ⅱ  Pause sound':'▶  Play sound';$('sound-toggle').disabled=!stream.sound||stream.sound==='off';$('sound-volume').value=Math.round(soundVolume*100);$('volume-value').textContent=Math.round(soundVolume*100)+'%';}
ambient.addEventListener('error',()=>{audioStop();$('sound-status').textContent='Could not load this sound. Please try another sound.';updateSoundControls();});
function isChatEvent(m){return m.kind==='event'||(m.kind==='gift'&&!/\?|still here|let’s go|quiet study vibes/.test(m.text));}
function saveMessage(name,icon,text,kind='viewer',source='SIM'){
 const now=Date.now(),message={name,icon,text,kind,source,at:now},last=stream.messages.at(-1);
 // Merge only adjacent identical events: never move an event past a conversation.
 if(isChatEvent(message)&&last&&isChatEvent(last)&&last.kind===kind&&last.text===text&&last.source===source&&now-(last.lastAt||last.at||0)<30000){
  last.count=(last.count||1)+1;last.actors=[...new Set([...(last.actors||[last.name]),name])];last.lastAt=now;
 }else stream.messages.push(message);
 persist();renderChat();
}
function renderChat(){
 const box=$('messages'),pinned=box.scrollHeight-box.scrollTop-box.clientHeight<48,previous=box.scrollTop;
 box.replaceChildren();
 for(const m of stream.messages){
  const row=document.createElement('div');
  if(isChatEvent(m)){
   row.className='chat-event'+(m.kind==='gift'?' chat-event-gift':'')+(m.source==='SYSTEM'?' chat-event-system':'');
   const icon=document.createElement('span');icon.className='event-icon';icon.textContent=m.kind==='gift'?'✦':/joined/.test(m.text)?'↳':/left/.test(m.text)?'↗':/liked/.test(m.text)?'♡':/followed/.test(m.text)?'+':'·';
   const text=document.createElement('span');text.className='event-text';const actors=m.actors||[m.name];
   text.textContent=actors[0]+(actors.length>1?` +${actors.length-1} others`:'')+' · '+m.text;
   row.append(icon,text);
   if(m.count>1){const count=document.createElement('span');count.className='event-count';count.textContent='×'+m.count;row.append(count);}
   if(m.at){const time=document.createElement('time');time.className='event-time';time.dateTime=new Date(m.at).toISOString();time.textContent=new Date(m.at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});row.append(time);}
  }else{
   row.className='message '+(m.kind==='user'?'user':'');
   const icon=document.createElement('div');icon.className='chat-avatar';icon.textContent=m.icon;icon.style.backgroundImage=`url("${people.find(p=>p.name===m.name)?.avatar||pixelAvatar(12)}")`;
   const body=document.createElement('div');body.className='message-body';
   const name=document.createElement('div');name.className='message-name';name.textContent=m.name;
   const tag=document.createElement('span');tag.textContent=m.kind==='user'?'YOU':(m.source||'SIM');name.append(tag);
   const text=document.createElement('p');text.className='bubble';text.textContent=m.text;
   body.append(name,text);row.append(icon,body);
  }
  box.append(row);
 }
 box.scrollTop=pinned?box.scrollHeight:previous;
}
function record(){if(!stream||stream.recorded)return; const result=NudgeSession.settle(profile,stream,Date.now(),dayKey);persist();return result;}
function finishStream(){if(!stream)return;record();const ended=stream;audioStop();stopCamera();stream=null;persist();$('summary-time').textContent=formatDuration(ended.elapsedMs);$('summary-stars').textContent=String((ended.stars||0)+(ended.questStars||0));$('summary-audience').textContent=String(ended.peakAudience||12);$('summary-note').textContent=ended.finished?'Session complete. gg, you made time for this ♡':'Session saved. Thanks for hanging out ♡';page('summary');celebrate(ended.reduceMotion);}
function formatDuration(ms){return `${Math.floor(ms/60000)}m ${Math.floor(ms/1000)%60}s`;}
function renderQuests(){
 const today=dayKey(new Date());if(NudgeSession.awardRewards(profile,today))persist();
 $('quests').replaceChildren(...NudgeSession.quests(profile,today).map(q=>{
  const el=document.createElement('article');el.className='quest';
  const title=document.createElement('strong');title.textContent=(q.complete?'✓ ':'□ ')+q.label;
  const progress=document.createElement('progress');progress.max=q.target;progress.value=q.progress;progress.setAttribute('aria-label',q.label+' progress');
  const detail=document.createElement('p');detail.textContent=`${q.progress} / ${q.target} · Reward: ${q.reward} stars`;
  const state=document.createElement('p');state.className='quest-state';state.textContent=q.claimed?`Automatically credited · +${q.reward} stars in your balance`:'In progress · reward is credited automatically after stream settlement';
  const rule=document.createElement('small');rule.textContent=q.id.startsWith('daily')?'Local calendar day: '+today+'. Only full countdowns count; early endings do not.':'Settled study time only. Breaks and active, unsettled streams are excluded.';
  el.append(title,progress,detail,state,rule);return el;
 }));
}
function nextCheck(){if(!stream||stream.paused||stream.pending||!stream.queue.length)return;let n=stream.queue.shift(),viewer=nextViewer();stream.pending={viewer,deadline:Date.now()+30000,milestone:n};saveMessage(viewer.name,viewer.icon,`${pick(prompts)} ✦`, 'viewer');}
function showLive(){if(!stream)return;if(!stream.tasks)stream.tasks=readTasks(stream.goal);NudgeSession.prepare(stream,Date.now());$('study-state').value=stream.status;setAudience(stream.audience||12);$('activity-frequency').value=stream.activity||'normal';$('reduce-motion').checked=!!stream.reduceMotion;renderTasks();$('live-title').textContent=stream.title;$('live-goal').textContent=stream.goal;$('study-status').textContent='✦  '+stream.status;updateSoundControls();renderChat();page('live');tick();}
$('setup-form').addEventListener('submit',e=>{e.preventDefault();if(stream&&!stream.recorded){alert('Please end your current stream before starting another.');showLive();return;}let title=$('topic').value.trim(),goal=$('goal').value.trim();if(!title||!goal)return;let duration=Number($('duration').value),now=Date.now();stream={title,goal,duration,started:now,endAt:now+duration*60000,status:'Studying',sound:$('sound').value,next:10,queue:[],pending:null,messages:[],tasks:readTasks(goal),recorded:false,completed:false,elapsedMs:0,lastTick:now,paused:false,stars:0,audience:12,peakAudience:12,id:crypto.randomUUID?crypto.randomUUID():String(now),activity:'normal'};saveMessage('mochi','✿','hey hey ♡ what’s first on the list?');$('sound-status').textContent='Sound is paused. Press play when ready.';showLive();});
function tick(){if(!stream)return;let now=Date.now();NudgeSession.advance(stream,now);let remaining=Math.max(0,stream.duration*60000-stream.elapsedMs),percent=Math.min(100,Math.floor(stream.elapsedMs/(stream.duration*60000)*100));persist();if(remaining===0){finishStream();return;}let clock=`${String(Math.floor(remaining/60000)).padStart(2,'0')}:${String(Math.floor(remaining/1000)%60).padStart(2,'0')}`;$('left-timer').textContent=clock;$('stage-timer').textContent=clock;$('progress').style.width=percent+'%';$('stage-percent').textContent=percent+'% COMPLETE';
 while(!stream.paused&&stream.next<=percent && stream.next<=100){let n=stream.next;stream.next+=10;if(!stream.pending){stream.queue.push(n);nextCheck();}persist();}
 if(stream.pending&&now>=stream.pending.deadline){saveMessage(stream.pending.viewer.name,stream.pending.viewer.icon,'no rush, catch you when you’re back');stream.pending=null;stream.queue=[];persist();}
 if(!stream.completed)nextCheck();let pending=stream.pending;$('deadline').hidden=!pending;$('check-title').textContent=pending?`${pending.viewer.name} is checking in`:(stream.completed?'Stream complete':'Your audience is settling in');$('check-detail').textContent=pending?'Reply with your current progress to your AI audience.':stream.completed?'Your time has been saved to your dashboard.':'A virtual viewer will check in as your session progresses.';if(pending)$('deadline').textContent=`${Math.ceil(Math.max(0,pending.deadline-now)/1000)}s TO REPLY`;
}
async function send(message){if(!stream||busy||!message.trim())return;message=message.trim();const config={revision:configRevision};let current=stream,pending=stream.pending,history=stream.messages.filter(m=>m.kind==='user'||m.kind==='viewer').slice(-10).map(m=>({role:m.kind==='user'?'user':'assistant',content:m.text}));stream.pending=null;saveMessage('you','✿',message,'user');floatReactions('feedback');$('message').value='';if(pending&&Date.now()<=pending.deadline&&stream.status==='Studying'&&!/\b(not|no|haven't|havent|isn't|isnt|can't|cant|stopped)\b/i.test(message)){profile.coins+=10;stream.stars=(stream.stars||0)+10;saveMessage(pending.viewer.name,pending.viewer.icon,'✦ +10 coins. nice!!','gift');persist();}busy=true;$('send').disabled=true;try{const delay=new Promise(resolve=>setTimeout(resolve,1600+Math.random()*2400));let response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message,goal:stream.goal+' | Current step: '+(stream.tasks?.find(t=>!t.done)?.text||'Review'),history,progress:Math.max(0,Math.min(100,Math.floor(stream.elapsedMs/(stream.duration*60000)*100)))})});let data=await response.json();await delay;if(!response.ok)throw Error(data.error||'Please try again.');if(stream===current){let v=pending?.viewer||nextViewer();saveMessage(v.name,v.icon,data.reply,'viewer',data.mode==='AI'?'MODEL':'DEMO');if(config.revision===configRevision){connectionState=data.mode==='AI'?'last reply succeeded':'unconfigured';updateConnectionUI();}}}catch(e){if(stream===current){saveMessage('Nudge','✦',`Model unavailable. ${e.message} Timer and room activity still work.`,'event','SYSTEM');if(config.revision===configRevision){connectionState='request failed';updateConnectionUI();}}}finally{busy=false;$('send').disabled=false;if(stream===current&&!stream.completed)nextCheck();}}
$('chat-form').addEventListener('submit',e=>{e.preventDefault();send($('message').value);});document.querySelectorAll('[data-msg]').forEach(b=>b.addEventListener('click',()=>{if(stream){const state=b.dataset.msg.includes('taking a break')?'On a break':b.dataset.msg.includes('studying')?'Studying':null;if(state){$('study-state').value=state;$('study-state').dispatchEvent(new Event('change'));}}send(b.dataset.msg);}));
$('live-sound').addEventListener('change',e=>{audioStop();stream.sound=e.target.value;persist();$('sound-status').textContent=stream.sound==='off'?'Choose a sound to play.':'Sound is paused. Press play when ready.';updateSoundControls();});
$('sound-volume').addEventListener('input',e=>{soundVolume=Number(e.target.value)/100;ambient.volume=soundVolume;if(audioGain)audioGain.gain.value=(stream.sound==='noise'?.05:.07)*soundVolume;updateSoundControls();});
$('sound-toggle').addEventListener('click',()=>{if(!stream)return;if(playing){audioStop();$('sound-status').textContent='Sound is paused.';updateSoundControls();}else audioStart(stream.sound);});
$('end').addEventListener('click',()=>{if(stream&&confirm('End this study stream? Your study time and stars will be saved.'))finishStream();});
applyBackground();dashboard();if(stream){showLive();}else page('dashboard');setInterval(tick,1000);

let nextAtmosphere=Date.now()+12000;
setInterval(()=>{if(!stream||$('live').hidden||stream.activity==='off')return;const now=Date.now();if(now<nextAtmosphere)return;const gap=({quiet:24000,normal:12000,lively:6000})[stream.activity||'normal'];nextAtmosphere=now+gap*(.75+Math.random()*.5)*(stream.paused?2:1);const v=nextViewer(),event=pick(stream.paused?['leave','leave','like']:['join','leave','like','follow','gift']);if(event==='join'){setAudience((stream.audience||12)+1);saveMessage(v.name,v.icon,'joined the room','event');}else if(event==='leave'){setAudience(Math.max(0,(stream.audience||12)-1));saveMessage(v.name,v.icon,'left the room','event');}else{saveMessage(v.name,v.icon,({like:'liked the stream ♡',follow:'followed your stream',gift:'sent a virtual star ✦'})[event],event==='gift'?'gift':'event');}if(!stream.paused)floatReactions();persist();},1000);
function setAudience(n){if(!stream)return;stream.audience=n;stream.peakAudience=Math.max(stream.peakAudience||0,n);$('viewer-count').textContent=n;}
$('activity-frequency').addEventListener('change',()=>{if(stream){stream.activity=$('activity-frequency').value;nextAtmosphere=Date.now()+2000;persist();}});
$('reduce-motion').addEventListener('change',()=>{if(stream){stream.reduceMotion=$('reduce-motion').checked;$('floating-reactions').replaceChildren();persist();}});
$('study-state').addEventListener('change',()=>{if(!stream)return;NudgeSession.advance(stream,Date.now());stream.status=$('study-state').value;stream.paused=stream.status==='On a break';stream.pending=null;stream.queue=[];$('study-status').textContent='✦ '+stream.status;persist();tick();});

if(location.hash === "#developer" || location.hash === "#settings") page("settings");

updateConnectionUI();

refreshConfig();setInterval(refreshConfig,5000);

function readTasks(goal){
 const lines=$('task-plan').value.split('\n').map(s=>s.trim()).filter(Boolean).slice(0,8);
 return (lines.length?lines:['Choose one part of: '+goal,'Work through that part','Review what you covered']).map(text=>({text:text.slice(0,180),done:false}));
}
$('plan-tasks').addEventListener('click',async()=>{
 const goal=$('goal').value.trim();if(!goal){$('plan-status').textContent='Enter your study task first.';return;}
 $('plan-tasks').disabled=true;$('plan-status').textContent='Breaking it into small steps…';
 try{const d=await apiAction('/api/plan',{goal});$('task-plan').value=d.tasks.join('\n');$('plan-status').textContent=d.mode==='AI'?'A suggested plan. Edit it to suit you.':'A starter plan. Edit these steps to fit your task.';}
 catch(e){$('plan-status').textContent=e.message+' You can write your own steps below.';}
 finally{$('plan-tasks').disabled=false;}
});
function renderTasks(){
 const box=$('live-tasks');box.replaceChildren();const current=stream.tasks.findIndex(t=>!t.done);
 stream.tasks.forEach((task,i)=>{const label=document.createElement('label');label.className='task-item'+(i===current?' current':'');const check=document.createElement('input');check.type='checkbox';check.checked=task.done;const text=document.createElement('span');text.textContent=task.text;check.addEventListener('change',()=>{task.done=check.checked;persist();renderTasks();task.replyRevision=(task.replyRevision||0)+1;if(task.done)queueTaskReaction(task);});label.append(check,text);box.append(label);});
 $('task-count').textContent=stream.tasks.filter(t=>t.done).length+' / '+stream.tasks.length+' done';
}

function stopCamera(){cameraRevision++;if(cameraStream)cameraStream.getTracks().forEach(track=>track.stop());cameraStream=null;$('camera-video').srcObject=null;$('camera-preview').hidden=true;$('camera-toggle').textContent='Enable camera';updateCameraStatus();}
$('camera-toggle').addEventListener('click',async()=>{
 if(cameraStream){stopCamera();return;}if(!stream)return;
 if(!navigator.mediaDevices?.getUserMedia){$('camera-status').textContent='Camera unavailable. Use localhost or HTTPS for camera access. Text chat still works.';return;}
 const revision=++cameraRevision;$('camera-toggle').disabled=true;$('camera-status').textContent='Waiting for camera permission…';
 try{const media=await navigator.mediaDevices.getUserMedia({video:true,audio:false});if(revision!==cameraRevision||!stream||$('live').hidden){media.getTracks().forEach(t=>t.stop());return;}cameraStream=media;$('camera-video').srcObject=media;$('camera-preview').hidden=false;$('camera-toggle').textContent='Disable camera';updateCameraStatus();media.getVideoTracks().forEach(t=>t.addEventListener('ended',stopCamera));}
 catch(e){if(revision===cameraRevision)$('camera-status').textContent=e.name==='NotAllowedError'?'Camera permission denied. Text chat still works.':'No camera available or camera is busy. Text chat still works.';}
 finally{$('camera-toggle').disabled=false;}
});
window.addEventListener('pagehide',()=>{if(stream){NudgeSession.advance(stream,Date.now());persist();}stopCamera();audioStop();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopCamera();});

function updateCameraStatus(){
 $('camera-status').textContent=cameraStream?'Camera on · local preview only. Nothing is uploaded.':'Camera off · local preview only.';
}
function renderHistory(){
 const records=profile.sessions||[],box=$('stream-history');box.replaceChildren();
 if(!records.length){box.textContent='Your saved streams will appear here.';}
 for(const record of [...records].reverse()){
  const row=document.createElement('article');row.className='history-row';
  const title=document.createElement('strong');title.textContent=record.title||'Study stream';
  const detail=document.createElement('p');detail.textContent=(record.goal||'Goal was not recorded')+' · '+formatDuration(record.elapsedMs);
  const meta=document.createElement('small');meta.textContent=`${record.endedAt?new Date(record.endedAt).toLocaleString('en-GB'):record.day} · ${record.finished?'Completed':'Ended early'} · ${record.stars??0} stars · ${record.peakAudience??'Not recorded'} peak simulated audience`;
  row.append(title,detail,meta);box.append(row);
 }
 const last=records.at(-1),remaining=(last?.tasks||[]).filter(t=>!t.done);$('unfinished-panel').hidden=!remaining.length;$('unfinished-tasks').replaceChildren(...remaining.map(t=>{const row=document.createElement('p');row.textContent='□ '+t.text;return row;}));
}
$('resume-tasks').addEventListener('click',()=>{const last=profile.sessions.at(-1);if(!last)return;$('topic').value=last.title||'Continue studying';$('goal').value=last.goal||'Continue unfinished tasks';$('task-plan').value=(last.tasks||[]).filter(t=>!t.done).map(t=>t.text).join('\n');$('plan-status').textContent='Unfinished tasks from your last stream. Edit before starting.';page('setup');});
function floatReactions(level='ambient'){
 if(!stream||stream.reduceMotion||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 const box=$('floating-reactions'),wanted=level==='task'?8+Math.floor(Math.random()*3):level==='feedback'?3+Math.floor(Math.random()*2):(Math.random()<.35?3:1);
 const count=Math.max(0,Math.min(wanted,16-box.children.length));
 for(let i=0;i<count;i++){
  const el=document.createElement('span');el.className='reaction';el.textContent=pick(level==='ambient'?['♡','♥','✨','🌱','☕','📚','⭐']:['⭐','👏','💜','🎉','✨','🙌','♥']);el.style.left=(5+Math.random()*75)+'%';el.style.fontSize=((level==='task'?21:16)+Math.random()*10)+'px';el.style.setProperty('--drift',(Math.random()*60-30)+'px');el.style.animationDuration=(2.8+Math.random()*1.7)+'s';el.style.animationDelay=(i*.13)+'s';box.append(el);setTimeout(()=>el.remove(),6500);
 }
}
function celebrate(reduce){
 $('confetti').replaceChildren();if(reduce||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 for(let i=0;i<34;i++){const el=document.createElement('span');if(i>=26){el.className='celebration-emoji';el.textContent=pick(['🎉','⭐','👏','💜','🙌']);}el.style.left=(Math.random()*100)+'%';el.style.background=pick(['#bb98d8','#efb3d0','#ffdb7b','#a3d8c1']);el.style.animationDelay=(Math.random()*.7)+'s';el.style.setProperty('--sway',(Math.random()*160-80)+'px');$('confetti').append(el);}setTimeout(()=>$('confetti').replaceChildren(),4000);
}
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',e=>{if(e.matches){$('confetti').replaceChildren();$('floating-reactions').replaceChildren();}});

function queueTaskReaction(task){
 const current=stream,revision=task.replyRevision,goal=stream.goal,history=stream.messages.filter(m=>m.kind==='user'||m.kind==='viewer').slice(-10).map(m=>({role:m.kind==='user'?'user':'assistant',content:m.text}));
 floatReactions('task');
 saveMessage('Nudge','✓','Completed: '+task.text,'event','SYSTEM');
 taskReplyQueue=taskReplyQueue.catch(()=>{}).then(async()=>{
  if(stream!==current||!task.done||task.replyRevision!==revision)return;
  const delay=new Promise(resolve=>setTimeout(resolve,1600+Math.random()*1600));let data,error;
  try{data=await apiAction('/api/chat',{event:'task_completed',task:task.text,message:'React to my completed study task.',goal,history,progress:Math.min(100,Math.floor(current.elapsedMs/(current.duration*60000)*100))});}
  catch(e){error=e;data={mode:'demo',reply:pick(['Another task checked off — nice work ♡','You finished that part! A little win ✦','That’s another one done. Cheering you on!'])};}
  await delay;if(stream!==current||!task.done||task.replyRevision!==revision)return;
  if(error)saveMessage('Nudge','·','Task reaction unavailable. Showing a demo response. '+error.message,'event','SYSTEM');
  const v=nextViewer();saveMessage(v.name,v.icon,data.reply,'viewer',data.mode==='AI'?'MODEL':'DEMO');
 });
}
