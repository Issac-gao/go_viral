import { FORMS, type Form, type Settings, type ReminderKind } from './types';

export const DEFAULTS: Settings = {
  version: 1, form: 'worker', alwaysOnTop: true, launchAtLogin: false, position: null,
  reminders: {
    water: { enabled: false, minutes: 60 }, rest: { enabled: false, minutes: 90 },
    offwork: { enabled: false, at: '18:00' }, start: '09:00', end: '18:00', days: [1,2,3,4,5]
  }
};
export function isForm(value: unknown): value is Form { return FORMS.includes(value as Form); }
export function minutesOf(time: string): number {
  const [h,m] = time.split(':').map(Number); return h * 60 + m;
}
function validTime(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : fallback;
}
function interval(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(240, Math.max(5, Math.round(value))) : fallback;
}
function record(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}
export function sanitizeSettings(input: unknown): Settings {
  const v = record(input), r = record(v.reminders), water = record(r.water), rest = record(r.rest), off = record(r.offwork);
  const p = record(v.position);
  const days = Array.isArray(r.days) ? [...new Set(r.days.filter((d: unknown): d is number => Number.isInteger(d) && Number(d)>=0 && Number(d)<=6))] as number[] : [...DEFAULTS.reminders.days];
  return {
    version: 1, form: isForm(v.form) ? v.form : 'worker',
    alwaysOnTop: typeof v.alwaysOnTop === 'boolean' ? v.alwaysOnTop : true,
    launchAtLogin: v.launchAtLogin === true,
    position: Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: Math.round(p.x), y: Math.round(p.y) } : null,
    reminders: {
      water: { enabled: water.enabled === true, minutes: interval(water.minutes,60) },
      rest: { enabled: rest.enabled === true, minutes: interval(rest.minutes,90) },
      offwork: { enabled: off.enabled === true, at: validTime(off.at,'18:00') },
      start: validTime(r.start,'09:00'), end: validTime(r.end,'18:00'), days
    }
  };
}
export interface Rect { x:number; y:number; width:number; height:number; }
export function clampPosition(point: {x:number;y:number}|null, areas: Rect[], width:number, height:number): {x:number;y:number} {
  if (!areas.length) return {x:0,y:0};
  const desired = point ?? {x:areas[0].x+areas[0].width-width-24,y:areas[0].y+areas[0].height-height-16};
  const distance = (a: Rect) => {
    const x = Math.max(a.x, Math.min(desired.x, a.x+Math.max(0,a.width-width)));
    const y = Math.max(a.y, Math.min(desired.y, a.y+Math.max(0,a.height-height)));
    return { x, y, distance:(x-desired.x)**2+(y-desired.y)**2 };
  };
  const best = areas.map(distance).sort((a,b)=>a.distance-b.distance)[0];
  return { x:Math.round(best.x), y:Math.round(best.y) };
}
function dateKey(d: Date): string { return [d.getFullYear(),d.getMonth()+1,d.getDate()].join('-'); }
function active(s: Settings, d: Date): boolean {
  const n=d.getHours()*60+d.getMinutes(), r=s.reminders;
  return r.days.includes(d.getDay()) && n>=minutesOf(r.start) && n<minutesOf(r.end);
}
export class ReminderClock {
  private elapsed={water:0, rest:0};
  private last: number;
  private offworkDay='';
  constructor(now: number) { this.last=now; }
  reset(now: number): void { this.elapsed={water:0,rest:0}; this.last=now; }
  tick(s:Settings, now:Date, paused:boolean, busy:boolean):ReminderKind[] {
    const ms=now.getTime(), gap=ms-this.last, previous=new Date(this.last);
    this.last=ms;
    // Gaps (sleep, clock changes or stalled process) never create catch-up reminders.
    if(gap<0 || gap>90_000) { this.elapsed={water:0,rest:0}; return []; }
    if(paused) return [];
    const out:ReminderKind[]=[];
    const r=s.reminders, at=minutesOf(r.offwork.at), n=now.getHours()*60+now.getMinutes();
    const prev=previous.getHours()*60+previous.getMinutes();
    // Offwork is allowed at the end boundary and independently of the water/rest window.
    if(r.days.includes(now.getDay()) && r.offwork.enabled && dateKey(now)===dateKey(previous) &&
       prev<at && n>=at && this.offworkDay!==dateKey(now)) {
      this.offworkDay=dateKey(now); if(!busy) out.push('offwork');
    }
    if(!active(s,now)) { this.elapsed={water:0,rest:0}; return out; }
    if(!active(s,previous)) { this.elapsed={water:0,rest:0}; return out; }
    for(const kind of ['water','rest'] as const) {
      if(!r[kind].enabled) { this.elapsed[kind]=0; continue; }
      this.elapsed[kind]+=gap;
      if(this.elapsed[kind]>=r[kind].minutes*60_000) {
        this.elapsed[kind]=0;
        if(!busy) out.push(kind);
      }
    }
    return out;
  }
}
