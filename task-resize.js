/* Task-panel width is a local preference; narrower screens use the stacked layout. */
(() => {
 const grid=document.querySelector('.live-grid'),handle=document.getElementById('task-resizer');
 const storageKey='nudge-task-panel-width',desktop=matchMedia('(min-width:1101px)');
 let preferred=210,shown=210,drag=null;
 try{const saved=Number(localStorage.getItem(storageKey));if(Number.isFinite(saved)&&saved>=180)preferred=Math.min(420,saved);}catch{}
 function bounds(){return {min:180,max:Math.max(180,Math.min(420,Math.floor(grid.getBoundingClientRect().width-300-310-28)))};}
 function apply(width=preferred){
  if(!desktop.matches){handle.hidden=true;return;}
  handle.hidden=false;const {min,max}=bounds();shown=Math.round(Math.max(min,Math.min(max,width)));
  grid.style.setProperty('--task-width',shown+'px');
  handle.setAttribute('aria-valuemin',min);handle.setAttribute('aria-valuemax',max);handle.setAttribute('aria-valuenow',shown);handle.setAttribute('aria-valuetext',shown+' pixels');
 }
 function save(){preferred=shown;try{localStorage.setItem(storageKey,String(preferred));}catch{}}
 function finish(cancel=false){if(!drag)return;const id=drag.id;drag=null;document.body.classList.remove('resizing-tasks');if(handle.hasPointerCapture(id))handle.releasePointerCapture(id);if(cancel)apply();else save();}
 handle.addEventListener('pointerdown',e=>{if(!desktop.matches||e.button!==0)return;e.preventDefault();handle.focus();drag={id:e.pointerId,start:e.clientX,width:shown};handle.setPointerCapture(e.pointerId);document.body.classList.add('resizing-tasks');});
 handle.addEventListener('pointermove',e=>{if(drag&&drag.id===e.pointerId)apply(drag.width+e.clientX-drag.start);});
 handle.addEventListener('pointerup',()=>finish());handle.addEventListener('pointercancel',()=>finish(true));handle.addEventListener('lostpointercapture',()=>finish(true));
 handle.addEventListener('keydown',e=>{
  if(!desktop.matches)return;const {min,max}=bounds(),step=e.shiftKey?50:10;
  const values={ArrowLeft:shown-step,ArrowRight:shown+step,Home:min,End:max,Enter:210};
  if(!(e.key in values))return;e.preventDefault();apply(values[e.key]);save();
 });
 handle.addEventListener('dblclick',()=>{apply(210);save();});
 new ResizeObserver(()=>{if(!drag)apply();}).observe(grid);
 desktop.addEventListener('change',()=>{finish(true);apply();});
 window.addEventListener('blur',()=>finish(true));
 apply();
})();
