const {spawn}=require('node:child_process');
const path=require('node:path');
const arch=process.argv[2]||process.arch;
const executable=process.platform==='darwin'
 ? path.resolve('out','PainPig-darwin-'+arch,'PainPig.app','Contents','MacOS','PainPig')
 : path.resolve('out','PainPig-win32-'+arch,'PainPig.exe');
const child=spawn(executable,['--smoke-test'],{stdio:['ignore','pipe','pipe']});
let output='';let done=false;
const timer=setTimeout(()=>{child.kill();console.error('Packaged app smoke timed out');process.exitCode=1;},60_000);
for(const stream of [child.stdout,child.stderr])stream.on('data',data=>{output+=data.toString();process.stdout.write(data);});
child.on('error',error=>{clearTimeout(timer);console.error(error);process.exitCode=1;});
child.on('close',code=>{done=true;clearTimeout(timer);if(code!==0||!output.includes('PAINPIG_SMOKE_OK')){console.error('Packaged smoke failed',code);process.exitCode=1;}});
