import { app, BrowserWindow, Menu, Tray, nativeImage, screen, ipcMain, powerMonitor, dialog, type IpcMainInvokeEvent } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULTS, sanitizeSettings, isForm, minutesOf, clampPosition, ReminderClock } from './core';
import type { Settings, PetState, Action, ReminderKind } from './types';

const W=280,H=320, smoke=process.argv.includes('--smoke-test');
const squirrel=process.platform==='win32' && require('electron-squirrel-startup');
const single=!squirrel && app.requestSingleInstanceLock();
if(!single) app.quit();

let pet:BrowserWindow|null=null, preferences:BrowserWindow|null=null, tray:Tray|null=null;
let settings:Settings=sanitizeSettings(DEFAULTS);
let hidden=false, locked=false, sleeping=false, pausedAt:number|null=null;
let action:Action|null=null, actionUntil=0, reminder:ReminderKind[]|null=null, reminderUntil=0;
let dragTimer:ReturnType<typeof setInterval>|null=null, dragSafety:ReturnType<typeof setTimeout>|null=null;
let dragOffset={x:0,y:0}, interactive=false, clock:ReminderClock;
const paused=()=>hidden||locked||sleeping;
const configPath=()=>path.join(app.getPath('userData'),'settings.json');
const areas=()=>screen.getAllDisplays().map(d=>d.workArea);
const state=():PetState=>({settings,paused:paused(),action,remainingMs:Math.max(0,actionUntil-(pausedAt??Date.now())),reminder});
function broadcast():void {
  for(const win of [pet,preferences]) if(win&&!win.isDestroyed()) win.webContents.send('pig:changed',state());
}
function persist(next:Settings):void {
  const file=configPath(), temp=file+'.tmp';
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(temp,JSON.stringify(next,null,2),'utf8');
  fs.renameSync(temp,file);
}
function report(error:unknown):void {
  console.error(error);
  if(!smoke) dialog.showErrorBox('小猪遇到一点麻烦',error instanceof Error?error.message:String(error));
}
function save(next:Settings):void {
  persist(next); settings=next; broadcast(); updateTray();
}
function setPassThrough(value:boolean):void {
  if(!pet||pet.isDestroyed()||dragTimer||interactive===value) return;
  interactive=value;
  pet.setIgnoreMouseEvents(!value,{forward:true});
}
function pauseChanged(wasPaused:boolean):void {
  if(wasPaused===paused()) return;
  if(paused()) {
    pausedAt=Date.now(); reminder=null; endDrag(); pet?.hide();
  } else {
    if(pausedAt!==null&&action) actionUntil+=Date.now()-pausedAt;
    pausedAt=null; clock.reset(Date.now());
    pet?.showInactive(); setPassThrough(false);
  }
  broadcast(); updateTray();
}
function showPig():void {
  const was=paused(); hidden=false; pauseChanged(was);
  if(!paused()) pet?.showInactive();
}
function hidePig():void {
  const was=paused(); hidden=true; pauseChanged(was);
}
function moveIntoView():void {
  if(!pet||pet.isDestroyed()) return;
  const [x,y]=pet.getPosition();
  const position=clampPosition({x,y},areas(),W,H);
  pet.setPosition(position.x,position.y);
  settings={...settings,position};
  try { persist(settings); } catch(error) { report(error); }
}
function endDrag():void {
  const wasDragging=!!dragTimer;
  if(dragTimer) clearInterval(dragTimer);
  if(dragSafety) clearTimeout(dragSafety);
  dragTimer=null; dragSafety=null;
  if(wasDragging) moveIntoView();
  setPassThrough(false);
}
function beginDrag():void {
  if(!pet||paused()||dragTimer) return;
  const p=screen.getCursorScreenPoint(), [x,y]=pet.getPosition();
  dragOffset={x:p.x-x,y:p.y-y};
  interactive=true; pet.setIgnoreMouseEvents(false);
  dragTimer=setInterval(()=>{
    if(!pet||pet.isDestroyed()) return endDrag();
    const p=screen.getCursorScreenPoint();
    const next=clampPosition({x:p.x-dragOffset.x,y:p.y-dragOffset.y},areas(),W,H);
    pet.setPosition(next.x,next.y);
  },16);
  dragSafety=setTimeout(endDrag,30_000);
}
const durations:Record<Action,number>={work:8000,vent:6500,rest:120_000,offwork:7000,poke:1600,water:5000,stretch:5000};
function perform(value:unknown):void {
  if(typeof value!=='string'||!Object.prototype.hasOwnProperty.call(durations,value)) throw new Error('未知的小猪动作');
  if(paused()) return;
  action=value as Action; actionUntil=Date.now()+durations[action]; reminder=null; broadcast();
}
function menuTemplate():Electron.MenuItemConstructorOptions[] {
  return [
    {label:'小猪替你顶一会儿',enabled:false},{type:'separator'},
    {label:'换个形态',submenu:([
      ['worker','牛马猪'],['puffer','气鼓猪'],['rest','躺平猪'],['offwork','下班猪']
    ] as const).map(([form,label])=>({label,type:'radio',checked:settings.form===form,click:()=>{try{save({...settings,form});}catch(e){report(e);}}}))},
    {label:'替我上班',click:()=>perform('work')},{label:'帮我出这口气',click:()=>perform('vent')},
    {label:'陪我缓两分钟',click:()=>perform('rest')},{label:'今天先到这里',click:()=>perform('offwork')},
    {type:'separator'},
    {label:'总在上面',type:'checkbox',checked:settings.alwaysOnTop,click:(item)=>{try{save({...settings,alwaysOnTop:item.checked});pet?.setAlwaysOnTop(item.checked);}catch(e){report(e);}}},
    {label:hidden?'叫小猪回来':'隐身一下',click:()=>hidden?showPig():hidePig()},
    {label:'设置与轻提醒…',click:openPreferences},{type:'separator'},
    {label:'让小猪下班（退出）',click:()=>app.quit()}
  ];
}
function updateTray():void { tray?.setContextMenu(Menu.buildFromTemplate(menuTemplate())); }
function secureWindow(win:BrowserWindow):void {
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',event=>event.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  win.webContents.on('render-process-gone',(_event,details)=>{
    if(smoke) { console.error('renderer failed',details); app.exit(1); }
    else report('小猪的画面意外停止，请从托盘退出后重新打开。');
  });
}
function options():Electron.WebPreferences {
  return {preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true};
}
function openPreferences():void {
  if(preferences&&!preferences.isDestroyed()) {preferences.show();preferences.focus();return;}
  preferences=new BrowserWindow({width:620,height:760,minWidth:540,minHeight:650,show:false,
    title:'小猪的安排',backgroundColor:'#fffaf2',webPreferences:options(),autoHideMenuBar:true});
  secureWindow(preferences);
  preferences.once('ready-to-show',()=>preferences?.show());
  preferences.on('closed',()=>{preferences=null;});
  void preferences.loadFile(path.join(__dirname,'ui','settings.html'));
}
function trusted(event:IpcMainInvokeEvent):void {
  const wc=event.sender;
  if((wc!==pet?.webContents&&wc!==preferences?.webContents)||event.senderFrame!==wc.mainFrame) throw new Error('无效的调用来源');
}
function setupIPC():void {
  const handle=(channel:string,fn:(...args:any[])=>unknown)=>ipcMain.handle(channel,(event,...args)=>{trusted(event);return fn(...args);});
  handle('pig:state',state);
  handle('pig:form',(form:unknown)=>{if(!isForm(form))throw new Error('无效的形态');save({...settings,form});});
  handle('pig:act',perform);
  handle('pig:configure',openPreferences);
  handle('pig:hide',hidePig);
  handle('pig:menu',()=>{endDrag();if(pet)Menu.buildFromTemplate(menuTemplate()).popup({window:pet});});
  handle('pig:quit',()=>app.quit());
  handle('pig:close-settings',()=>preferences?.close());
  handle('pig:drag-start',beginDrag);
  handle('pig:drag-end',endDrag);
  handle('pig:save',(input:unknown)=>{
    const next=sanitizeSettings(input);
    if(minutesOf(next.reminders.start)>=minutesOf(next.reminders.end)) throw new Error('结束时间需要晚于开始时间。');
    if(next.reminders.days.length===0) throw new Error('至少选择一个提醒日。');
    // Window position and form may have changed while the settings window was open.
    next.position=settings.position; next.form=settings.form;
    const oldLogin=settings.launchAtLogin;
    try {
      if(!smoke&&next.launchAtLogin!==oldLogin) app.setLoginItemSettings({openAtLogin:next.launchAtLogin});
      save(next);
    } catch(error) {
      if(!smoke&&next.launchAtLogin!==oldLogin) app.setLoginItemSettings({openAtLogin:oldLogin});
      throw error;
    }
    pet?.setAlwaysOnTop(next.alwaysOnTop);
    clock.reset(Date.now()); return settings;
  });
  ipcMain.on('pig:interactive',(event,value:unknown)=>{
    if(event.sender===pet?.webContents&&event.senderFrame===event.sender.mainFrame&&typeof value==='boolean')setPassThrough(value);
  });
}
async function runSmoke():Promise<void> {
  if(!pet) throw new Error('pet window not created');
  // Real Chromium renderer and sandboxed preload must load on each target platform.
  const result=await pet.webContents.executeJavaScript(`(async()=>{const s=await window.pig.getState();return {form:s.settings.form,svg:!!document.querySelector('svg'),buttons:document.querySelectorAll('button').length};})()`);
  if(result.form!=='worker'||!result.svg||result.buttons<2) throw new Error('pet renderer smoke check failed: '+JSON.stringify(result));
  perform('vent');
  const vent=await pet.webContents.executeJavaScript(`new Promise(resolve=>setTimeout(()=>resolve(document.body.dataset.action),150))`);
  if(vent!=='vent')throw new Error('renderer did not receive action');
  openPreferences();
  await new Promise<void>((resolve,reject)=>{
    if(!preferences) return reject(new Error('settings did not open'));
    preferences.webContents.once('did-finish-load',()=>resolve());
    preferences.webContents.once('did-fail-load',(_e,code,description)=>reject(new Error(code+': '+description)));
  });
  const fields=await preferences!.webContents.executeJavaScript(`document.querySelectorAll('input').length`);
  if(fields<8)throw new Error('settings fields missing');
  hidePig(); if(!paused()||pet.isVisible())throw new Error('hide failed');
  showPig(); if(paused())throw new Error('restore failed');
  await new Promise(resolve=>setTimeout(resolve,100));
  console.log('PAINPIG_SMOKE_OK '+JSON.stringify(result)); app.exit(0);
}
if(single) {
  // Smoke runs use a disposable profile and cannot touch a person's real settings.
  if(smoke) app.setPath('userData',path.join(app.getPath('temp'),'painpig-smoke-'+process.pid));
  app.on('second-instance',showPig);
  app.on('window-all-closed',()=>{ /* Tray owns app lifetime. */ });
  app.on('activate',showPig);
  app.on('before-quit',()=>{if(dragTimer)clearInterval(dragTimer);if(dragSafety)clearTimeout(dragSafety);});
  void app.whenReady().then(async()=>{
    if(process.platform==='darwin')app.dock?.hide();
    if(process.platform==='win32')app.setAppUserModelId('com.squirrel.PainPig.PainPig');
    try { settings=sanitizeSettings(JSON.parse(fs.readFileSync(configPath(),'utf8'))); }
    catch(error) { if((error as NodeJS.ErrnoException).code!=='ENOENT')console.warn('Settings unreadable; using defaults.'); }
    if(minutesOf(settings.reminders.start)>=minutesOf(settings.reminders.end)) {
      settings.reminders.start='09:00';settings.reminders.end='18:00';
    }
    clock=new ReminderClock(Date.now()); setupIPC();
    const position=clampPosition(settings.position,areas(),W,H);
    pet=new BrowserWindow({width:W,height:H,...position,show:false,frame:false,transparent:true,
      resizable:false,hasShadow:false,skipTaskbar:true,focusable:false,alwaysOnTop:settings.alwaysOnTop,
      backgroundColor:'#00000000',webPreferences:options()});
    secureWindow(pet);
    pet.setIgnoreMouseEvents(true,{forward:true});
    await pet.loadFile(path.join(__dirname,'ui','pet.html'));
    pet.showInactive();
    const icon=nativeImage.createFromPath(path.join(__dirname,'assets','tray.png'));
    tray=new Tray(icon);tray.setToolTip('小猪替你顶一会儿');
    tray.on('click',showPig);updateTray();
    screen.on('display-removed',moveIntoView);screen.on('display-metrics-changed',moveIntoView);
    const change=(key:'locked'|'sleeping',value:boolean)=>{
      const was=paused();if(key==='locked')locked=value;else sleeping=value;pauseChanged(was);
    };
    powerMonitor.on('lock-screen',()=>change('locked',true));
    powerMonitor.on('unlock-screen',()=>change('locked',false));
    powerMonitor.on('suspend',()=>change('sleeping',true));
    powerMonitor.on('resume',()=>change('sleeping',false));
    setInterval(()=>{
      const now=Date.now();
      if(!paused()&&action&&now>=actionUntil){action=null;broadcast();}
      if(reminder&&now>=reminderUntil){reminder=null;broadcast();}
      const due=clock.tick(settings,new Date(now),paused(),!!action||!!reminder||!!dragTimer);
      if(due.length){reminder=due;reminderUntil=now+8000;broadcast();}
    },1000).unref();
    if(smoke) await runSmoke();
  }).catch(error=>{report(error);app.exit(1);});
}
