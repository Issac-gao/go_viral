import Cocoa
import WebKit
import ServiceManagement

let forms = ["worker","puffer","rest","offwork"]
let duration: [String:Double] = ["work":8,"vent":6.5,"rest":120,"offwork":7,"poke":1.6,"water":5,"stretch":5]
struct Point: Codable { var x:Double; var y:Double }
struct Interval: Codable { var enabled=false; var minutes:Int }
struct Offwork: Codable { var enabled=false; var at="18:00" }
struct Reminders: Codable {
    var water=Interval(minutes:60); var rest=Interval(minutes:90); var offwork=Offwork()
    var start="09:00"; var end="18:00"; var days=[1,2,3,4,5]
}
struct Settings: Codable {
    var version=1; var form="worker"; var alwaysOnTop=true; var launchAtLogin=false
    var position:Point?=nil; var reminders=Reminders()
    mutating func validate() throws {
        guard forms.contains(form), let start=timeMinutes(reminders.start), let end=timeMinutes(reminders.end),
              start<end, timeMinutes(reminders.offwork.at) != nil else { throw PigError("请检查形态和提醒时段。") }
        reminders.days=Array(Set(reminders.days.filter{(0...6).contains($0)})).sorted()
        guard !reminders.days.isEmpty else { throw PigError("至少选择一个提醒日。") }
        reminders.water.minutes=min(240,max(5,reminders.water.minutes))
        reminders.rest.minutes=min(240,max(5,reminders.rest.minutes))
        if let p=position, !p.x.isFinite || !p.y.isFinite { position=nil }
    }
}
struct PigError: LocalizedError {
    let text:String
    init(_ text:String){self.text=text}
    var errorDescription:String?{text}
}
func timeMinutes(_ text:String)->Int? {
    let parts=text.split(separator:":")
    guard parts.count==2,parts[0].count==2,parts[1].count==2,
          let h=Int(parts[0]), let m=Int(parts[1]), (0...23).contains(h),(0...59).contains(m) else{return nil}
    return h*60+m
}
func minute(_ date:Date)->Int{let c=Calendar.current.dateComponents([.hour,.minute],from:date);return c.hour!*60+c.minute!}
func dayKey(_ date:Date)->Int{Int(Calendar.current.startOfDay(for:date).timeIntervalSince1970)}
func weekday(_ date:Date)->Int{Calendar.current.component(.weekday,from:date)-1}
struct ReminderClock {
    var last:Date; var water:Double=0; var rest:Double=0; var offworkDay:Int?=nil
    mutating func reset(_ now:Date){last=now;water=0;rest=0}
    func active(_ s:Settings,_ d:Date)->Bool {
        s.reminders.days.contains(weekday(d)) && minute(d)>=timeMinutes(s.reminders.start)! && minute(d)<timeMinutes(s.reminders.end)!
    }
    mutating func tick(_ s:Settings,_ now:Date,_ paused:Bool,_ busy:Bool)->[String]{
        let previous=last, gap=now.timeIntervalSince(last);last=now
        if gap<0 || gap>90 {water=0;rest=0;return []}
        if paused{return []}
        var out=[String]()
        let r=s.reminders, at=timeMinutes(r.offwork.at)!
        if r.offwork.enabled && r.days.contains(weekday(now)) && dayKey(now)==dayKey(previous) &&
           minute(previous)<at && minute(now)>=at && offworkDay != dayKey(now){
            offworkDay=dayKey(now);if !busy{out.append("offwork")}
        }
        if !active(s,now) || !active(s,previous){water=0;rest=0;return out}
        if r.water.enabled {water+=gap;if water>=Double(r.water.minutes*60){water=0;if !busy{out.append("water")}}} else {water=0}
        if r.rest.enabled {rest+=gap;if rest>=Double(r.rest.minutes*60){rest=0;if !busy{out.append("rest")}}} else {rest=0}
        return out
    }
}
final class PetPanel:NSPanel {
    override var canBecomeKey:Bool{false}
    override var canBecomeMain:Bool{false}
}
final class Delegate:NSObject,NSApplicationDelegate,WKScriptMessageHandler,WKNavigationDelegate {
    let smoke=CommandLine.arguments.contains("--smoke-test")
    let w:Double=280,h:Double=320
    var settings=Settings()
    var pet:PetPanel!
    var petView:WKWebView!
    var preferences:NSWindow?
    var preferenceView:WKWebView?
    var statusItem:NSStatusItem!
    var hidden=false,locked=false,sleeping=false
    var paused:Bool{hidden || locked || sleeping}
    var pauseAt:Date?
    var action:String?,actionUntil=Date.distantPast,reminder:[String]?,reminderUntil=Date.distantPast
    var clock=ReminderClock(last:Date())
    var dragging=false,dragOffset=NSPoint.zero,dragDeadline=Date.distantPast
    var lastMouse=NSPoint(x:-99999,y:-99999),hitPending=false
    var tickTimer:Timer?,mouseTimer:Timer?,smokeTimeout:Timer?
    var uiURL:URL{Bundle.main.resourceURL!.appendingPathComponent("ui")}
    var configURL:URL {
        if smoke{return FileManager.default.temporaryDirectory.appendingPathComponent("PainPig-smoke-\(ProcessInfo.processInfo.processIdentifier)/settings.json")}
        return FileManager.default.urls(for:.applicationSupportDirectory,in:.userDomainMask)[0].appendingPathComponent("PainPig/settings.json")
    }
    func persist(_ next:Settings)throws{
        try FileManager.default.createDirectory(at:configURL.deletingLastPathComponent(),withIntermediateDirectories:true)
        try JSONEncoder().encode(next).write(to:configURL,options:.atomic)
    }
    func json(_ value:Any)->String {
        let data=try! JSONSerialization.data(withJSONObject:value,options:[.fragmentsAllowed,.sortedKeys])
        return String(data:data,encoding:.utf8)!
    }
    func state()->[String:Any] {
        let encoded=try! JSONEncoder().encode(settings)
        let object=try! JSONSerialization.jsonObject(with:encoded)
        return ["settings":object,"paused":paused,"action":action as Any? ?? NSNull(),
                "remainingMs":max(0,actionUntil.timeIntervalSince(pauseAt ?? Date())*1000),"reminder":reminder as Any? ?? NSNull()]
    }
    func broadcast(){
        lastMouse=NSPoint(x:-99999,y:-99999)
        let js="window.__pigPush && window.__pigPush(\(json(state())));"
        petView?.evaluateJavaScript(js,completionHandler:nil)
        preferenceView?.evaluateJavaScript(js,completionHandler:nil)
        updateMenu()
    }
    func save(_ next:Settings)throws{try persist(next);settings=next;broadcast()}
    func makeView()->WKWebView {
        let config=WKWebViewConfiguration()
        let script=try! String(contentsOf:Bundle.main.resourceURL!.appendingPathComponent("bridge.js"),encoding:.utf8)
        config.userContentController.addUserScript(WKUserScript(source:script,injectionTime:.atDocumentStart,forMainFrameOnly:true))
        config.userContentController.add(self,name:"pig")
        let view=WKWebView(frame:.zero,configuration:config)
        view.navigationDelegate=self
        view.setValue(false,forKey:"drawsBackground")
        return view
    }
    func applicationDidFinishLaunching(_ notification:Notification) {
        NSApp.setActivationPolicy(.accessory)
        if !smoke {
            let existing=NSRunningApplication.runningApplications(withBundleIdentifier:Bundle.main.bundleIdentifier ?? "")
                .filter{$0.processIdentifier != ProcessInfo.processInfo.processIdentifier}
            if let first=existing.first{first.activate(options:[]);NSApp.terminate(nil);return}
        }
        if let data=try? Data(contentsOf:configURL),var loaded=try? JSONDecoder().decode(Settings.self,from:data){
            if (try? loaded.validate()) != nil{settings=loaded}
        }
        pet=PetPanel(contentRect:NSRect(x:0,y:0,width:w,height:h),styleMask:[.borderless,.nonactivatingPanel],backing:.buffered,defer:false)
        pet.isOpaque=false;pet.backgroundColor = .clear;pet.hasShadow=false;pet.hidesOnDeactivate=false
        pet.isFloatingPanel=true;pet.becomesKeyOnlyIfNeeded=true;pet.isMovableByWindowBackground=false
        pet.collectionBehavior=[.canJoinAllSpaces,.fullScreenAuxiliary]
        pet.level=settings.alwaysOnTop ? .floating : .normal
        petView=makeView();pet.contentView=petView
        move(to:clamp(settings.position))
        pet.ignoresMouseEvents=true
        petView.loadFileURL(uiURL.appendingPathComponent("pet.html"),allowingReadAccessTo:uiURL)
        pet.orderFrontRegardless()
        statusItem=NSStatusBar.system.statusItem(withLength:NSStatusItem.variableLength)
        statusItem.button?.image=NSImage(contentsOf:Bundle.main.resourceURL!.appendingPathComponent("tray.png"))
        statusItem.button?.image?.size=NSSize(width:20,height:20)
        statusItem.button?.toolTip="小猪替你顶一会儿"
        updateMenu()
        let workspace=NSWorkspace.shared.notificationCenter
        workspace.addObserver(forName:NSWorkspace.willSleepNotification,object:nil,queue:.main){[weak self] _ in self?.pauseChange("sleep",true)}
        workspace.addObserver(forName:NSWorkspace.didWakeNotification,object:nil,queue:.main){[weak self] _ in self?.pauseChange("sleep",false)}
        let distributed=DistributedNotificationCenter.default()
        distributed.addObserver(self,selector:#selector(screenLocked),name:NSNotification.Name("com.apple.screenIsLocked"),object:nil)
        distributed.addObserver(self,selector:#selector(screenUnlocked),name:NSNotification.Name("com.apple.screenIsUnlocked"),object:nil)
        NotificationCenter.default.addObserver(self,selector:#selector(screensChanged),name:NSApplication.didChangeScreenParametersNotification,object:nil)
        tickTimer=Timer.scheduledTimer(withTimeInterval:1,repeats:true){[weak self] _ in self?.tick()}
        mouseTimer=Timer.scheduledTimer(withTimeInterval:0.05,repeats:true){[weak self] _ in self?.mouseTick()}
        if smoke{smokeTimeout=Timer.scheduledTimer(withTimeInterval:30,repeats:false){_ in fputs("NATIVE_SMOKE_TIMEOUT\n",stderr);exit(1)}}
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender:NSApplication)->Bool{false}
    func applicationShouldHandleReopen(_ sender:NSApplication,hasVisibleWindows flag:Bool)->Bool{showPig();return false}
    @objc func screenLocked(){pauseChange("lock",true)}
    @objc func screenUnlocked(){pauseChange("lock",false)}
    @objc func screensChanged(){move(to:clamp(position()));settings.position=position();try? persist(settings)}
    func pauseChange(_ reason:String,_ value:Bool){
        let before=paused
        switch reason{case "lock":locked=value;case "sleep":sleeping=value;default:hidden=value}
        guard before != paused else{return}
        if paused{pauseAt=Date();reminder=nil;endDrag();pet.orderOut(nil)}
        else{if let start=pauseAt,action != nil{actionUntil=actionUntil.addingTimeInterval(Date().timeIntervalSince(start))}
            pauseAt=nil;clock.reset(Date());pet.orderFrontRegardless();lastMouse=NSPoint(x:-99999,y:-99999)}
        broadcast()
    }
    func showPig(){pauseChange("hidden",false);if !paused{pet?.orderFrontRegardless()}}
    var desktopTop:Double{Double(NSScreen.screens.first?.frame.maxY ?? 0)}
    func position()->Point{Point(x:pet.frame.minX,y:desktopTop-pet.frame.maxY)}
    func clamp(_ desired:Point?)->Point{
        let screens=NSScreen.screens
        guard let first=screens.first else{return Point(x:0,y:0)}
        let v=first.visibleFrame
        let p=desired ?? Point(x:v.maxX-w-24,y:desktopTop-v.minY-h-16)
        return screens.map{screen->(Point,Double) in
            let a=screen.visibleFrame
            let x=max(a.minX,min(p.x,a.maxX-w)),top=desktopTop-a.maxY
            let y=max(top,min(p.y,desktopTop-a.minY-h))
            return (Point(x:x,y:y),(x-p.x)*(x-p.x)+(y-p.y)*(y-p.y))
        }.min{$0.1<$1.1}!.0
    }
    func move(to p:Point){pet.setFrameOrigin(NSPoint(x:p.x,y:desktopTop-p.y-h))}
    func beginDrag(){
        if paused{return};dragging=true;pet.ignoresMouseEvents=false
        let mouse=NSEvent.mouseLocation;dragOffset=NSPoint(x:mouse.x-pet.frame.minX,y:mouse.y-pet.frame.minY)
        dragDeadline=Date().addingTimeInterval(30)
    }
    func endDrag(){
        guard dragging else{return};dragging=false;settings.position=position()
        do{try persist(settings)}catch{showError(error)}
        lastMouse=NSPoint(x:-99999,y:-99999)
    }
    func mouseTick(){
        if paused || pet == nil{return}
        let mouse=NSEvent.mouseLocation
        if dragging{
            if NSEvent.pressedMouseButtons&1==0 || Date()>dragDeadline{endDrag();return}
            move(to:clamp(Point(x:mouse.x-dragOffset.x,y:desktopTop-(mouse.y-dragOffset.y)-h)));return
        }
        let p=NSPoint(x:mouse.x-pet.frame.minX,y:pet.frame.maxY-mouse.y)
        if !pet.frame.contains(mouse){pet.ignoresMouseEvents=true;lastMouse=mouse;return}
        if mouse==lastMouse || hitPending{return}
        lastMouse=mouse;hitPending=true
        let js="(()=>{let e=document.elementFromPoint(\(p.x),\(p.y));return !!e?.closest('[data-hit]') && !(e instanceof HTMLButtonElement && e.disabled)})()"
        petView.evaluateJavaScript(js){[weak self] value,error in
            guard let self=self else{return};self.hitPending=false
            if !self.dragging{self.pet.ignoresMouseEvents = !(value as? Bool ?? false)}
        }
    }
    func tick(){
        let now=Date()
        if !paused,action != nil,now>=actionUntil{action=nil;broadcast()}
        if reminder != nil,now>=reminderUntil{reminder=nil;broadcast()}
        let due=clock.tick(settings,now,paused,action != nil || reminder != nil || dragging)
        if !due.isEmpty{reminder=due;reminderUntil=now.addingTimeInterval(8);lastMouse=NSPoint(x:-99999,y:-99999);broadcast()}
    }
    func perform(_ requested:String)throws{
        guard let seconds=duration[requested] else{throw PigError("未知的小猪动作")}
        if paused{return};action=requested;actionUntil=Date().addingTimeInterval(seconds);reminder=nil;broadcast()
    }
    func configure(){
        if preferences == nil{
            let window=NSWindow(contentRect:NSRect(x:0,y:0,width:620,height:760),styleMask:[.titled,.closable,.miniaturizable,.resizable],backing:.buffered,defer:false)
            window.title="小猪的安排";window.minSize=NSSize(width:540,height:650);window.isReleasedWhenClosed=false
            preferenceView=makeView();window.contentView=preferenceView;preferences=window
            preferenceView!.loadFileURL(uiURL.appendingPathComponent("settings.html"),allowingReadAccessTo:uiURL)
            window.center()
        }
        preferences!.makeKeyAndOrderFront(nil);NSApp.activate(ignoringOtherApps:true)
    }
    func menuItem(_ title:String,_ command:String,_ state:Bool?=nil)->NSMenuItem{
        let item=NSMenuItem(title:title,action:#selector(menuCommand(_:)),keyEquivalent:"")
        item.target=self;item.representedObject=command;if let state=state{item.state=state ? .on : .off};return item
    }
    func makeMenu()->NSMenu{
        let menu=NSMenu();menu.addItem(withTitle:"小猪替你顶一会儿",action:nil,keyEquivalent:"")
        let sub=NSMenu()
        for (i,title) in ["牛马猪","气鼓猪","躺平猪","下班猪"].enumerated(){sub.addItem(menuItem(title,"form:"+forms[i],settings.form==forms[i]))}
        let item=NSMenuItem(title:"换个形态",action:nil,keyEquivalent:"");item.submenu=sub;menu.addItem(item)
        for pair in [("替我上班","work"),("帮我出这口气","vent"),("陪我缓两分钟","rest"),("今天先到这里","offwork")]{menu.addItem(menuItem(pair.0,"act:"+pair.1))}
        menu.addItem(.separator());menu.addItem(menuItem("总在上面","top",settings.alwaysOnTop))
        menu.addItem(menuItem(hidden ? "叫小猪回来":"隐身一下","hide"))
        menu.addItem(menuItem("设置与轻提醒…","settings"));menu.addItem(.separator())
        menu.addItem(menuItem("让小猪下班（退出）","quit"));return menu
    }
    func updateMenu(){statusItem?.menu=makeMenu()}
    @objc func menuCommand(_ item:NSMenuItem){
        guard let cmd=item.representedObject as? String else{return}
        do{
            if cmd.hasPrefix("form:"){var next=settings;next.form=String(cmd.dropFirst(5));try save(next)}
            else if cmd.hasPrefix("act:"){try perform(String(cmd.dropFirst(4)))}
            else{switch cmd{
                case "top":var next=settings;next.alwaysOnTop.toggle();try save(next);pet.level=next.alwaysOnTop ? .floating : .normal
                case "hide":hidden ? showPig():pauseChange("hidden",true)
                case "settings":configure()
                case "quit":NSApp.terminate(nil)
                default:break
            }}
        }catch{showError(error)}
    }
    func showError(_ error:Error){let alert=NSAlert();alert.messageText="小猪遇到一点麻烦";alert.informativeText=error.localizedDescription;alert.runModal()}
    func reply(_ view:WKWebView,_ id:Int,_ ok:Bool,_ value:Any){
        view.evaluateJavaScript("window.__pigReply(\(id),\(ok ? "true":"false"),\(json(value)));",completionHandler:nil)
    }
    func userContentController(_ controller:WKUserContentController,didReceive message:WKScriptMessage){
        guard message.frameInfo.isMainFrame,let view=message.webView,(view===petView || view===preferenceView),
              let body=message.body as? [String:Any],let method=body["method"] as? String else{return}
        let id=body["id"] as? Int ?? 0,args=body["args"] as? [Any] ?? []
        do{
            var answer:Any=NSNull()
            switch method{
            case "state":answer=state()
            case "form":
                guard let form=args.first as? String,forms.contains(form)else{throw PigError("无效的形态")}
                var next=settings;next.form=form;try save(next)
            case "act":try perform(args.first as? String ?? "")
            case "configure":configure()
            case "hide":pauseChange("hidden",true)
            case "menu":endDrag();makeMenu().popUp(positioning:nil,at:NSEvent.mouseLocation,in:nil)
            case "quit":NSApp.terminate(nil)
            case "closeSettings":preferences?.close()
            case "dragStart":if view===petView{beginDrag()}
            case "dragEnd":if view===petView{endDrag()}
            case "interactive":if view===petView,!dragging{pet.ignoresMouseEvents = !(args.first as? Bool ?? false)}
            case "save":
                guard let raw=args.first else{throw PigError("设置缺失")}
                var next=try JSONDecoder().decode(Settings.self,from:JSONSerialization.data(withJSONObject:raw))
                try next.validate();next.position=settings.position;next.form=settings.form
                if next.launchAtLogin != settings.launchAtLogin{
                    if next.launchAtLogin{try SMAppService.mainApp.register()}else{try SMAppService.mainApp.unregister()}
                }
                do{try save(next)}catch{
                    if next.launchAtLogin != settings.launchAtLogin{
                        if settings.launchAtLogin{try? SMAppService.mainApp.register()}else{try? SMAppService.mainApp.unregister()}
                    };throw error
                }
                pet.level=next.alwaysOnTop ? .floating : .normal;clock.reset(Date())
                answer=state()["settings"]!
            case "smoke":
                guard smoke else{throw PigError("无效的调用")}
                if args.first as? String=="pet"{configure()}
                else if args.first as? String=="settings"{
                    pauseChange("hidden",true)
                    guard paused && !pet.isVisible else{throw PigError("隐藏检查失败")}
                    showPig();guard !paused else{throw PigError("恢复检查失败")}
                    print("PAINPIG_NATIVE_SMOKE_OK");fflush(stdout);exit(0)
                }else{fputs("NATIVE_SMOKE_FAILED: \(args)\n",stderr);exit(1)}
            default:throw PigError("未知的调用")
            }
            reply(view,id,true,answer)
        }catch{if smoke{fputs("NATIVE_ERROR: \(error.localizedDescription)\n",stderr)};reply(view,id,false,error.localizedDescription)}
    }
    func webView(_ webView:WKWebView,decidePolicyFor action:WKNavigationAction,decisionHandler:@escaping(WKNavigationActionPolicy)->Void){
        let url=action.request.url
        decisionHandler(url?.isFileURL == true && action.targetFrame?.isMainFrame == true ? .allow:.cancel)
    }
    func webViewWebContentProcessDidTerminate(_ webView:WKWebView){if smoke{exit(1)}else{showError(PigError("小猪画面停止了，请从菜单栏退出后重开。"))}}
    func webView(_ view:WKWebView,didFinish navigation:WKNavigation!){
        guard smoke else{return}
        let js:String
        if view===petView {
            js="""
            (async()=>{
              const s=await window.pig.getState();
              if(!document.querySelector('svg')||s.settings.form!=='worker')throw Error('pet initial state');
              if(!document.elementFromPoint(138,219)?.closest('[data-hit]'))throw Error('painted hit region');
              if(document.elementFromPoint(2,100)?.closest('[data-hit]'))throw Error('blank region');
              await window.pig.setForm('puffer');await window.pig.act('vent');
              await new Promise(r=>setTimeout(r,150));
              if(document.body.dataset.action!=='vent')throw Error('action event');
              window.webkit.messageHandlers.pig.postMessage({method:'smoke',args:['pet']});
            })().catch(e=>window.webkit.messageHandlers.pig.postMessage({method:'smoke',args:['error',String(e)]}));void 0;
            """
        }else{
            js="""
            (async()=>{
              const s=await window.pig.getState();
              if(s.settings.form!=='puffer'||document.querySelectorAll('input').length<8)throw Error('settings');
              window.webkit.messageHandlers.pig.postMessage({method:'smoke',args:['settings']});
            })().catch(e=>window.webkit.messageHandlers.pig.postMessage({method:'smoke',args:['error',String(e)]}));void 0;
            """
        }
        view.evaluateJavaScript(js){_,error in if let error=error{fputs("SMOKE_JS_ERROR: \(error)\n",stderr);exit(1)}}
    }
}
func selfTest(){
    func at(_ hour:Int,_ min:Int=0)->Date {Calendar.current.date(from:DateComponents(year:2026,month:11,day:16,hour:hour,minute:min))!}
    var s=Settings();try! s.validate()
    precondition(!s.reminders.water.enabled && !s.launchAtLogin)
    s.reminders.water=Interval(enabled:true,minutes:5);s.reminders.rest=Interval(enabled:true,minutes:5)
    var clock=ReminderClock(last:at(10))
    for i in 1...4{precondition(clock.tick(s,at(10,i),false,false).isEmpty)}
    precondition(clock.tick(s,at(10,5),false,false)==["water","rest"])
    clock.reset(at(10))
    for i in 1...5{precondition(clock.tick(s,at(10,i),true,false).isEmpty)}
    clock.reset(at(10));for i in 1...5{precondition(clock.tick(s,at(10,i),false,true).isEmpty)}
    precondition(clock.tick(s,at(10,6),false,false).isEmpty)
    precondition(clock.tick(s,at(12),false,false).isEmpty)
    s.reminders.offwork.enabled=true;clock=ReminderClock(last:at(17,59))
    precondition(clock.tick(s,at(18),false,false)==["offwork"])
    precondition(clock.tick(s,at(18,1),false,false).isEmpty)
    precondition(timeMinutes("25:00")==nil)
    print("PAINPIG_NATIVE_TESTS_OK")
}
if CommandLine.arguments.contains("--self-test"){selfTest();exit(0)}
let application=NSApplication.shared
let delegate=Delegate()
application.delegate=delegate
application.run()
