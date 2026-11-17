const {test}=require('node:test');
const assert=require('node:assert/strict');
const {sanitizeSettings,DEFAULTS,ReminderClock,clampPosition}=require('../dist/core.js');
const at=(h,m=0)=>new Date(2026,10,16,h,m,0,0); // Monday, local time.
const settings=()=>sanitizeSettings(DEFAULTS);
function advance(clock,s,start,minutes,paused=false,busy=false){
 let result=[];for(let i=1;i<=minutes;i++)result=clock.tick(s,new Date(start.getTime()+i*60000),paused,busy);return result;
}
test('defaults are opt-in and the local configuration is copied',()=>{
 const s=settings();s.reminders.days.push(0);
 assert.equal(DEFAULTS.reminders.days.includes(0),false);
 assert.equal(s.reminders.water.enabled,false);assert.equal(s.launchAtLogin,false);
 assert.equal(sanitizeSettings(null).form,'worker');
});
test('untrusted settings are normalized and extra properties removed',()=>{
 const s=sanitizeSettings({form:'dragon',alwaysOnTop:'yes',position:{x:Infinity,y:2},reminders:{water:{enabled:1,minutes:-2},rest:{minutes:999},offwork:{at:'25:20'},days:[1,1,9,'2',null]}});
 assert.equal(s.form,'worker');assert.equal(s.alwaysOnTop,true);assert.equal(s.position,null);
 assert.deepEqual(s.reminders.days,[1]);assert.equal(s.reminders.water.minutes,5);
 assert.equal(s.reminders.water.enabled,false);assert.equal(s.reminders.rest.minutes,240);assert.equal(s.reminders.offwork.at,'18:00');
});
test('enabled water and rest reminders merge at the same tick',()=>{
 const s=settings();s.reminders.water.enabled=s.reminders.rest.enabled=true;
 s.reminders.water.minutes=s.reminders.rest.minutes=5;
 const start=at(10),clock=new ReminderClock(+start);
 assert.deepEqual(advance(clock,s,start,5),['water','rest']);
});
test('paused minutes never accumulate',()=>{
 const s=settings();s.reminders.water.enabled=true;s.reminders.water.minutes=5;
 const start=at(10),clock=new ReminderClock(+start);
 assert.deepEqual(advance(clock,s,start,20,true),[]);
 assert.deepEqual(advance(clock,s,new Date(+start+20*60000),4),[]);
 assert.deepEqual(clock.tick(s,new Date(+start+25*60000),false,false),['water']);
});
test('busy due reminders are consumed rather than queued',()=>{
 const s=settings();s.reminders.water.enabled=true;s.reminders.water.minutes=5;
 const start=at(10),clock=new ReminderClock(+start);
 assert.deepEqual(advance(clock,s,start,5,false,true),[]);
 assert.deepEqual(clock.tick(s,at(10,6),false,false),[]);
});
test('sleep and clock jumps do not cause a backlog',()=>{
 const s=settings();s.reminders.water.enabled=true;s.reminders.water.minutes=5;
 const clock=new ReminderClock(+at(10));
 assert.deepEqual(clock.tick(s,at(12),false,false),[]);
 assert.deepEqual(clock.tick(s,at(9),false,false),[]);
});
test('offwork fires once exactly at the end boundary',()=>{
 const s=settings();s.reminders.offwork.enabled=true;
 const clock=new ReminderClock(+at(17,59));
 assert.deepEqual(clock.tick(s,at(18),false,false),['offwork']);
 assert.deepEqual(clock.tick(s,at(18,1),false,false),[]);
 clock.tick(s,at(17,59),false,false);
 assert.deepEqual(clock.tick(s,at(18),false,false),[]);
});
test('opening after offwork does not replay the reminder',()=>{
 const s=settings();s.reminders.offwork.enabled=true;const clock=new ReminderClock(+at(18,1));
 assert.deepEqual(clock.tick(s,at(18,2),false,false),[]);
});
test('offwork skipped during a sketch is not repeated',()=>{
 const s=settings();s.reminders.offwork.enabled=true;const clock=new ReminderClock(+at(17,59));
 assert.deepEqual(clock.tick(s,at(18),false,true),[]);
 assert.deepEqual(clock.tick(s,at(18,1),false,false),[]);
});
test('weekend and outside-hours reminders are quiet',()=>{
 const s=settings();s.reminders.water.enabled=true;s.reminders.water.minutes=5;
 const sat=new Date(2026,10,21,10),clock=new ReminderClock(+sat);
 assert.deepEqual(advance(clock,s,sat,10),[]);
 const morning=at(8),clock2=new ReminderClock(+morning);
 assert.deepEqual(advance(clock2,s,morning,10),[]);
});
test('reset starts a fresh interval after resume or a settings change',()=>{
 const s=settings();s.reminders.water.enabled=true;s.reminders.water.minutes=5;
 const clock=new ReminderClock(+at(10));advance(clock,s,at(10),4);
 clock.reset(+at(10,4));assert.deepEqual(advance(clock,s,at(10,4),4),[]);
 assert.deepEqual(clock.tick(s,at(10,9),false,false),['water']);
});
test('removed displays and negative-coordinate monitors retain a visible pig',()=>{
 assert.deepEqual(clampPosition({x:3000,y:2000},[{x:0,y:0,width:1920,height:1040}],280,320),{x:1640,y:720});
 assert.deepEqual(clampPosition({x:-1800,y:100},[{x:-1920,y:0,width:1920,height:1080},{x:0,y:0,width:1920,height:1080}],280,320),{x:-1800,y:100});
 assert.deepEqual(clampPosition(null,[{x:0,y:0,width:1920,height:1040}],280,320),{x:1616,y:704});
});
