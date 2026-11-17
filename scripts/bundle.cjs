const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const name=process.argv[2]||'PainPig';
const destination='build/delivery';fs.mkdirSync(destination,{recursive:true});
const artifacts=[];
function visit(directory){for(const item of fs.readdirSync(directory,{withFileTypes:true})){
 const file=path.join(directory,item.name);if(item.isDirectory())visit(file);
 else if(/\.(exe|dmg|zip)$/.test(item.name))artifacts.push(file);
}}
visit('out/make');
if(!artifacts.length)throw new Error('No installer artifacts were produced');
const sums=[];
for(const file of artifacts){
 const target=path.join(destination,path.basename(file));fs.copyFileSync(file,target);
 sums.push(crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex')+'  '+path.basename(target));
}
fs.writeFileSync(path.join(destination,'SHA256SUMS.txt'),sums.join('\n')+'\n');
fs.copyFileSync('docs/INSTALL.zh-CN.md',path.join(destination,'安装说明.txt'));
fs.writeFileSync(path.join(destination,'BUILD-INFO.txt'),[
 name,'Version: 0.1.0','Commit: '+(process.env.GITHUB_SHA||'local'),
 'Built: '+new Date().toISOString(),'Platform: '+process.platform+' '+process.arch,
 'Signing: Windows unsigned; macOS ad-hoc (not Developer ID signed or notarized).',
 'Automated checks: TypeScript, reminder tests, desktop launch, packaged executable launch.',
 'Manual desktop interaction and installer acceptance: PENDING; see docs/QA.zh-CN.md.',
 'This is a friend-test build, not a signed public release.'
].join('\n')+'\n');
