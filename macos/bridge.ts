import type { PigBridge, PetState } from '../src/types';
declare global { interface Window { webkit:any; __pigReply:(id:number,ok:boolean,value:unknown)=>void; __pigPush:(s:PetState)=>void; } }
let next=0;
const pending=new Map<number,{resolve:(value:any)=>void;reject:(e:Error)=>void}>();
const listeners=new Set<(s:PetState)=>void>();
function call(method:string,...args:unknown[]):Promise<any>{
  return new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});window.webkit.messageHandlers.pig.postMessage({id,method,args});});
}
window.__pigReply=(id,ok,value)=>{const p=pending.get(id);if(!p)return;pending.delete(id);if(ok)p.resolve(value);else p.reject(new Error(String(value)));};
window.__pigPush=s=>listeners.forEach(fn=>fn(s));
const bridge:PigBridge & {setInteractive(value:boolean):void}={
  getState:()=>call('state'),setForm:f=>call('form',f),act:a=>call('act',a),
  configure:()=>call('configure'),saveSettings:s=>call('save',s),hide:()=>call('hide'),menu:()=>call('menu'),
  quit:()=>call('quit'),closeSettings:()=>call('closeSettings'),dragStart:()=>call('dragStart'),dragEnd:()=>call('dragEnd'),
  setInteractive:value=>{void call('interactive',value).catch(console.error);},
  onState:fn=>{listeners.add(fn);return()=>listeners.delete(fn);}
};
window.pig=bridge;
