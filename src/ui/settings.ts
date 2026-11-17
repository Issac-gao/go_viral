import type { PetState, Settings, Form, Action } from '../types';
const form=document.querySelector<HTMLFormElement>('#settings')!;
const status=document.querySelector<HTMLElement>('#status')!;
let current:Settings|null=null,dirty=false;
const input=(id:string)=>document.getElementById(id) as HTMLInputElement;
function fill(state:PetState):void {
  current=state.settings;
  for(const btn of document.querySelectorAll<HTMLButtonElement>('[data-form]'))btn.setAttribute('aria-pressed',String(btn.dataset.form===current.form));
  if(dirty)return;
  for(const kind of ['water','rest'] as const){
    input(kind+'-enabled').checked=current.reminders[kind].enabled;
    input(kind+'-minutes').value=String(current.reminders[kind].minutes);
  }
  input('offwork-enabled').checked=current.reminders.offwork.enabled;input('offwork-at').value=current.reminders.offwork.at;
  input('start').value=current.reminders.start;input('end').value=current.reminders.end;
  input('always-on-top').checked=current.alwaysOnTop;input('launch-at-login').checked=current.launchAtLogin;
  for(const day of document.querySelectorAll<HTMLInputElement>('input[name=day]'))day.checked=current.reminders.days.includes(Number(day.value));
}
form.addEventListener('input',()=>{dirty=true;status.textContent='';});
form.addEventListener('submit',async event=>{
  event.preventDefault();if(!current||!form.reportValidity())return;
  const start=input('start').value,end=input('end').value;
  if(start>=end){status.textContent='结束时间需要晚于开始时间。';return;}
  const days=Array.from(document.querySelectorAll<HTMLInputElement>('input[name=day]:checked')).map(el=>Number(el.value));
  if(!days.length){status.textContent='至少选择一个提醒日。';return;}
  const next:Settings={...current,alwaysOnTop:input('always-on-top').checked,launchAtLogin:input('launch-at-login').checked,
    reminders:{
      water:{enabled:input('water-enabled').checked,minutes:Number(input('water-minutes').value)},
      rest:{enabled:input('rest-enabled').checked,minutes:Number(input('rest-minutes').value)},
      offwork:{enabled:input('offwork-enabled').checked,at:input('offwork-at').value},start,end,days
    }};
  const button=document.querySelector<HTMLButtonElement>('#save')!;button.disabled=true;
  try {
    current=await window.pig.saveSettings(next);dirty=false;status.textContent='安排好了。你歇着。';
    fill(await window.pig.getState());
  }catch(error){status.textContent=error instanceof Error?error.message:'保存失败，请再试一次。';}
  finally{button.disabled=false;}
});
const actions:Record<Form,Action>={worker:'work',puffer:'vent',rest:'rest',offwork:'offwork'};
for(const button of document.querySelectorAll<HTMLButtonElement>('[data-form]')){
  button.addEventListener('click',async()=>{
    try{const selected=button.dataset.form as Form;await window.pig.setForm(selected);await window.pig.act(actions[selected]);}
    catch(error){status.textContent=String(error);}
  });
}
document.querySelector('#close')!.addEventListener('click',()=>void window.pig.closeSettings());
window.pig.onState(fill);
void window.pig.getState().then(fill).catch(error=>{status.textContent=String(error);});
