import hashlib, json, os, pathlib, shutil, subprocess, sys, tempfile, urllib.request, zipfile

root = pathlib.Path(__file__).resolve().parents[1]
delivery = root / "build/mac-delivery"
delivery.mkdir(parents=True, exist_ok=True)
arch = subprocess.check_output(["uname", "-m"], text=True).strip()
dmg = root / "build/mac-native" / ("PainPig-Lite-" + arch + ".dmg")
def run(args):
    try:
        p = subprocess.run([str(x) for x in args], capture_output=True, text=True, timeout=90)
        return {"exit": p.returncode, "output": (p.stdout+p.stderr).strip()}
    except subprocess.TimeoutExpired:
        return {"exit": None, "output": "TIMEOUT: assessment incomplete"}
def assess(app):
    return {"signature_integrity": run(["codesign","--verify","--deep","--strict","--verbose=2",app]),
            "signature_details": run(["codesign","-dv","--verbose=4",app]),
            "gatekeeper": run(["spctl","--assess","--type","execute","--verbose=4",app])}
report = {
    "version":"0.2.0", "architecture":arch, "commit":os.environ.get("GITHUB_SHA","local"),
    "dmg_bytes":dmg.stat().st_size,
    "size_target_bytes":20_000_000, "developer_id_signed":False, "notarized":False,
    "dmg_integrity":run(["hdiutil","verify",dmg]),
    "native_smoke":"passed during build",
    "manual_download_and_finder_open":"NOT VERIFIED",
    "real_device_interaction":"NOT VERIFIED"
}
assert report["dmg_bytes"] <= report["size_target_bytes"], "DMG exceeds 20 MB target"
assert report["dmg_integrity"]["exit"] == 0, "DMG integrity failed"
with tempfile.TemporaryDirectory(prefix="painpig-audit-") as tmp:
    tmp = pathlib.Path(tmp)
    mount = tmp/"new-mount"; mount.mkdir()
    attached = run(["hdiutil","attach","-readonly","-nobrowse","-mountpoint",mount,dmg])
    assert attached["exit"] == 0, attached
    try:
        app = tmp/"PainPig.app"
        shutil.copytree(mount/"PainPig.app",app,symlinks=True)
        report["new_app"] = assess(app)
        assert report["new_app"]["signature_integrity"]["exit"] == 0, "New app signature damaged after DMG extraction"
        quarantine = run(["xattr","-w","com.apple.quarantine","0083;00000000;Safari;00000000-0000-0000-0000-000000000001",app])
        report["quarantine_simulation"] = quarantine
        report["downloaded_app_assessment"] = run(["spctl","--assess","--type","execute","--verbose=4",app])
    finally:
        run(["hdiutil","detach",mount])
    old_id = "14335623252" if arch=="arm64" else "14335978156"
    token = os.environ.get("GH_TOKEN","")
    if token:
        try:
            request=urllib.request.Request("https://api.github.com/repos/Issac-gao/go_viral/actions/artifacts/"+old_id+"/zip",
                headers={"Authorization":"Bearer "+token,"Accept":"application/vnd.github+json"})
            old_zip=tmp/"original.zip"
            with urllib.request.urlopen(request,timeout=90) as response,old_zip.open("wb") as target:
                shutil.copyfileobj(response,target)
            old_files=tmp/"original";old_files.mkdir()
            with zipfile.ZipFile(old_zip) as z:
                for info in z.infolist():
                    if info.filename.endswith(".dmg"):
                        # Only use basename; never trust an archive path.
                        target=old_files/pathlib.Path(info.filename).name
                        target.write_bytes(z.read(info))
            old_dmg=next(old_files.glob("*.dmg"))
            report["original_dmg_bytes"]=old_dmg.stat().st_size
            report["reduction_percent"]=round(100*(1-report["dmg_bytes"]/old_dmg.stat().st_size),2)
            report["original_dmg_integrity"]=run(["hdiutil","verify",old_dmg])
            old_mount=tmp/"old-mount";old_mount.mkdir()
            old_attach=run(["hdiutil","attach","-readonly","-nobrowse","-mountpoint",old_mount,old_dmg])
            if old_attach["exit"]==0:
                try:
                    old_app=next(old_mount.glob("*.app"))
                    report["original_app"]=assess(old_app)
                finally:run(["hdiutil","detach",old_mount])
            else:report["original_mount"]=old_attach
        except Exception as error:
            report["original_audit_error"]=str(error).replace(token,"[REDACTED]")
report_file=delivery/"SECURITY-REPORT.json"
report_file.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
shutil.copy2(dmg,delivery/dmg.name)
shutil.copy2(root/"macos/INSTALL.zh-CN.txt",delivery/"安装说明.txt")
digest=hashlib.sha256(dmg.read_bytes()).hexdigest()
(delivery/"SHA256SUMS.txt").write_text(digest+"  "+dmg.name+"\n")
print(json.dumps(report,ensure_ascii=False,indent=2))
