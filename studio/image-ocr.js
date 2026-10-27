const fs=require('fs/promises'),os=require('os'),path=require('path'),{execFile}=require('child_process'),{promisify}=require('util');
const exec=promisify(execFile);
module.exports=async function extractText(buffer){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'chat-ocr-'));const file=path.join(dir,'image');
 try{
  await fs.writeFile(file,buffer);
  const {stdout}=await exec('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'windows-ocr.ps1'),'-ImagePath',file],{windowsHide:true,timeout:45000,maxBuffer:2*1024*1024,encoding:'utf8'});
  return JSON.parse(stdout.replace(/^\uFEFF/,'').trim()).text.replace(/([\u3400-\u9fff])\s+(?=[\u3400-\u9fff])/g,'$1').trim();
 }finally{await fs.unlink(file).catch(()=>{});await fs.rmdir(dir).catch(()=>{});}
};
