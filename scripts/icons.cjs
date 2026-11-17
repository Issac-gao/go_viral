// Self-contained RGBA icon generator. No network assets or native npm dependencies.
const fs=require('node:fs'),zlib=require('node:zlib'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const table=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc(buf){let n=0xffffffff;for(const b of buf)n=table[(n^b)&255]^(n>>>8);return(n^0xffffffff)>>>0;}
function chunk(type,data){const t=Buffer.from(type);const out=Buffer.alloc(12+data.length);out.writeUInt32BE(data.length,0);t.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc(Buffer.concat([t,data])),out.length-4);return out;}
function png(size){
 const data=Buffer.alloc((size*4+1)*size);
 const shapes=[
 [30,25,11,18,[103,67,57,255]],[30,25,8,15,[246,188,192,255]],
 [71,25,11,18,[103,67,57,255]],[71,25,8,15,[246,188,192,255]],
 [50,56,41,35,[103,67,57,255]],[50,56,38,32,[246,188,192,255]],
 [34,48,3,3,[103,67,57,255]],[66,48,3,3,[103,67,57,255]],
 [50,65,18,13,[103,67,57,255]],[50,65,15,10,[235,160,170,255]],
 [44,65,2,4,[103,67,57,255]],[56,65,2,4,[103,67,57,255]]
 ];
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  let color=[0,0,0,0];const px=(x+.5)*100/size,py=(y+.5)*100/size;
  for(const [cx,cy,rx,ry,c] of shapes)if(((px-cx)/rx)**2+((py-cy)/ry)**2<=1)color=c;
  const p=y*(size*4+1)+1+x*4;for(let k=0;k<4;k++)data[p+k]=color[k];
 }
 const header=Buffer.alloc(13);header.writeUInt32BE(size,0);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(data)),chunk('IEND',Buffer.alloc(0))]);
}
fs.mkdirSync('build',{recursive:true});fs.mkdirSync('dist/assets',{recursive:true});
fs.writeFileSync('build/icon.png',png(512));fs.writeFileSync('dist/assets/tray.png',png(24));
const image=png(256),head=Buffer.alloc(22);head.writeUInt16LE(1,2);head.writeUInt16LE(1,4);head.writeUInt16LE(1,10);head.writeUInt16LE(32,12);head.writeUInt32LE(image.length,14);head.writeUInt32LE(22,18);
fs.writeFileSync('build/icon.ico',Buffer.concat([head,image]));
if(process.platform==='darwin'){
 const folder='build/icon.iconset';fs.mkdirSync(folder,{recursive:true});
 for(const size of [16,32,128,256,512]){
  fs.writeFileSync(path.join(folder,'icon_'+size+'x'+size+'.png'),png(size));
  fs.writeFileSync(path.join(folder,'icon_'+size+'x'+size+'@2x.png'),png(size*2));
 }
 execFileSync('iconutil',['-c','icns',folder,'-o','build/icon.icns'],{stdio:'inherit'});
}
