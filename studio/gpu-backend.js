// Node side of native/gpu_backend.py: which generation runtime this computer uses.
// Without the AMD installer's config, behaviour is exactly the original NVIDIA setup.
const fs=require('fs'),path=require('path');
const BACKENDS=['nvidia','amd','none'];
function backend(root){
 const forced=String(process.env.LOCALMUSE_GPU||'').trim().toLowerCase();
 if(BACKENDS.includes(forced))return forced;
 try{const data=JSON.parse(fs.readFileSync(path.join(root,'runtime/gpu-backend.json'),'utf8'));if(BACKENDS.includes(data.backend))return data.backend;}catch{}
 return 'nvidia';
}
function generationPython(root){return path.join(root,backend(root)==='amd'?'runtime/generation-env-amd/Scripts/python.exe':'runtime/generation-env/Scripts/python.exe');}
module.exports={backend,generationPython};
