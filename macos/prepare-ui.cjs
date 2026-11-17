const fs=require('node:fs');
const base='build/mac-native/PainPig.app/Contents/Resources/';
const wrap=code=>'(function(){\n'+code.split('export {};').join('')+'\n})();';
fs.writeFileSync(base+'bridge.js',wrap(fs.readFileSync('build/native-ts/macos/bridge.js','utf8')));
for(const name of ['pet','settings']){
  const js=base+'ui/'+name+'.js',html=base+'ui/'+name+'.html';
  fs.writeFileSync(js,wrap(fs.readFileSync(js,'utf8')));
  fs.writeFileSync(html,fs.readFileSync(html,'utf8').replace('type="module"','defer'));
}
