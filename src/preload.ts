import { contextBridge, ipcRenderer } from 'electron';
import type { PigBridge, PetState, Form, Action, Settings } from './types';

const bridge: PigBridge & { setInteractive(value:boolean):void } = {
  getState: () => ipcRenderer.invoke('pig:state'),
  setForm: (form:Form) => ipcRenderer.invoke('pig:form',form),
  act: (action:Action) => ipcRenderer.invoke('pig:act',action),
  configure: () => ipcRenderer.invoke('pig:configure'),
  saveSettings: (settings:Settings) => ipcRenderer.invoke('pig:save',settings),
  hide: () => ipcRenderer.invoke('pig:hide'),
  menu: () => ipcRenderer.invoke('pig:menu'),
  quit: () => ipcRenderer.invoke('pig:quit'),
  closeSettings: () => ipcRenderer.invoke('pig:close-settings'),
  dragStart: () => ipcRenderer.invoke('pig:drag-start'),
  dragEnd: () => ipcRenderer.invoke('pig:drag-end'),
  setInteractive: (value:boolean) => ipcRenderer.send('pig:interactive',value),
  onState: (callback:(state:PetState)=>void) => {
    const listener=(_event:Electron.IpcRendererEvent,state:PetState) => callback(state);
    ipcRenderer.on('pig:changed',listener);
    return () => ipcRenderer.removeListener('pig:changed',listener);
  }
};
contextBridge.exposeInMainWorld('pig',bridge);
