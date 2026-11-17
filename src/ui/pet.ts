import type { PetState, Action, Form } from '../types';
const pig=document.querySelector<HTMLElement>('#pig')!;
const bubble=document.querySelector<HTMLElement>('#bubble')!;
const message=document.querySelector<HTMLButtonElement>('#message')!;
const bridge=window.pig as typeof window.pig & {setInteractive(value:boolean):void};
const lines:Record<Action,string>={
  work:'你歇会儿。已替你忙碌八秒。',vent:'这口气，本猪代出了。',rest:'被子铺好了。你不用马上振作。',
  offwork:'剩下的事，交给明天的猪。',poke:'哼唧。还在岗，放心。',water:'你喝一口，我也喝一口。',stretch:'先把肩膀从耳朵旁边放下来。'
};
const forms:Partial<Record<Action,Form>>={work:'worker',vent:'puffer',rest:'rest',offwork:'offwork'};
let current:PetState|null=null, down:{x:number;y:number;id:number}|null=null;
let dragged=false, reminderAction:Action|null=null, hoverTimer:number|undefined, lastInteractive=false;
let countdown:number|undefined, actionDeadline=0, ready=false;
function showLine(text:string,clickable=false):void {
  message.textContent=text;message.disabled=!clickable;bubble.hidden=false;
}
function countdownText():void {
  if(current?.action!=='rest')return;
  const seconds=Math.max(0,Math.ceil((current.paused?current.remainingMs:actionDeadline-Date.now())/1000));
  showLine(seconds>0?'陪你躺着 · '+Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0')+'\n继续躺也行。':'两分钟到了。继续躺也行。');
}
function render(s:PetState):void {
  const previous=current?.action;current=s;
  document.body.dataset.form=s.action?(forms[s.action]??s.settings.form):s.settings.form;
  document.body.dataset.action=s.action??'';
  document.body.classList.toggle('paused',s.paused);
  reminderAction=null;
  if(countdown!==undefined){clearInterval(countdown);countdown=undefined;}
  if(s.reminder?.length){
    const text=s.reminder.map(k=>k==='water'?'喝口水':k==='rest'?'伸个懒腰':'今天先到这里').join('，');
    reminderAction=s.reminder.includes('offwork')?'offwork':s.reminder.includes('rest')?'stretch':'water';
    showLine(text+'。本猪陪你。',true);
  }else if(s.action){
    showLine(lines[s.action]);actionDeadline=Date.now()+s.remainingMs;
    if(s.action==='rest'){countdownText();if(!s.paused)countdown=window.setInterval(countdownText,1000);}
  }else if(previous==='rest'){
    showLine('两分钟到了。继续躺也行。');window.setTimeout(()=>{if(!current?.action&&!current?.reminder)bubble.hidden=true;},6000);
  }else if(ready)bubble.hidden=true;
}
function safely(promise:Promise<unknown>):void{void promise.catch(error=>{showLine('小猪卡了一下，请从托盘重新打开。');console.error(error);});}
function isHit(x:number,y:number):boolean {
  const el=document.elementFromPoint(x,y);
  return el instanceof Element&&!!el.closest('[data-hit]')&&!(el instanceof HTMLButtonElement&&el.disabled);
}
window.addEventListener('mousemove',event=>{
  const hit=isHit(event.clientX,event.clientY);
  if(hit!==lastInteractive&&!down){lastInteractive=hit;bridge.setInteractive(hit);}
  if(hit){document.body.classList.add('near');if(hoverTimer)clearTimeout(hoverTimer);hoverTimer=window.setTimeout(()=>document.body.classList.remove('near'),2200);}
});
pig.addEventListener('pointerdown',event=>{
  if(event.button!==0)return;
  down={x:event.screenX,y:event.screenY,id:event.pointerId};dragged=false;
  pig.setPointerCapture(event.pointerId);
});
pig.addEventListener('pointermove',event=>{
  if(!down||dragged)return;
  if(Math.hypot(event.screenX-down.x,event.screenY-down.y)>4){dragged=true;safely(bridge.dragStart());}
});
function finish(event:PointerEvent,cancelled=false):void {
  if(!down)return;
  const id=down.id;down=null;
  if(pig.hasPointerCapture(id))pig.releasePointerCapture(id);
  if(dragged)safely(bridge.dragEnd());else if(!cancelled)safely(bridge.act('poke'));
  dragged=false;lastInteractive=false;bridge.setInteractive(false);
}
pig.addEventListener('pointerup',event=>finish(event));
pig.addEventListener('pointercancel',event=>finish(event,true));
window.addEventListener('contextmenu',event=>{event.preventDefault();safely(bridge.dragEnd());down=null;safely(bridge.menu());});
document.querySelector('#menu')!.addEventListener('click',()=>safely(bridge.menu()));
document.querySelector('#settings')!.addEventListener('click',()=>safely(bridge.configure()));
document.querySelector('#hide')!.addEventListener('click',()=>safely(bridge.hide()));
message.addEventListener('click',()=>{if(reminderAction)safely(bridge.act(reminderAction));});
document.addEventListener('visibilitychange',()=>document.body.classList.toggle('reduced',document.hidden));
bridge.onState(render);
void bridge.getState().then(s=>{
  render(s);ready=true;
  if(!s.action&&!s.reminder){showLine('你歇会儿，我先顶着。\n右键小猪，可以变身。');window.setTimeout(()=>{if(!current?.action&&!current?.reminder)bubble.hidden=true;},6500);}
}).catch(console.error);
