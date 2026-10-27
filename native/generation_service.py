"""Project-owned generation queue with a legacy transport adapter for the existing UI."""
import json,os,sys,threading,subprocess,time,uuid,math,argparse,mimetypes
from pathlib import Path
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from urllib.parse import urlparse,parse_qs
from email.parser import BytesParser
from email.policy import default
ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'generated'
for name in ['input','output','jobs']: (DATA/name).mkdir(parents=True,exist_ok=True)
jobs={};workers={};lock=threading.Lock();stopping=threading.Event()
for f in (DATA/'jobs').glob('*.json'):
    if f.name.endswith('.progress.json'):continue
    try:
        j=json.loads(f.read_text(encoding='utf-8'))
        if j['status'] in ('queued','running'):j.update(status='error',error='上次生成中斷，請重新送出')
        jobs[j['id']]=j
    except (ValueError,KeyError):pass

def save(job): (DATA/'jobs'/(job['id']+'.json')).write_text(json.dumps(job,ensure_ascii=False,indent=2),encoding='utf-8')
def run(job):
    with lock:
        if stopping.is_set():
            job.update(status='error',error='服務已關閉');save(job);return
        job['status']='running';save(job)
        try:
            env={**os.environ,'PYTHONUTF8':'1','HF_HUB_OFFLINE':'1','TRANSFORMERS_OFFLINE':'1'}
            with (DATA/'jobs'/(job['id']+'.log')).open('w',encoding='utf-8') as log:
                child=subprocess.Popen([str(ROOT/'runtime/generation-env/Scripts/python.exe'),str(ROOT/('native/music_worker.py' if job['mode']=='music' else 'native/image_worker.py')),str(DATA/'jobs'/(job['id']+'.json'))],cwd=ROOT,env=env,stdout=log,stderr=subprocess.STDOUT)
                workers[job['id']]=child
                try:
                    child.wait(timeout=1800 if job['mode']=='music' else 600)
                except subprocess.TimeoutExpired:
                    child.kill();child.wait();raise RuntimeError('生成逾時，請查看任務記錄')
                finally:workers.pop(job['id'],None)
                result=child
            if result.returncode!=0:
                tail=(DATA/'jobs'/(job['id']+'.log')).read_text(encoding='utf-8',errors='replace')[-1800:]
                raise RuntimeError(tail)
            if not (DATA/'output'/job['output']).is_file():raise RuntimeError('生成程式沒有輸出檔案')
            job['status']='done'
        except Exception as exc:job.update(status='error',error=str(exc))
        finally:save(job)

def catalog():return json.loads((ROOT/'models/generation/catalog.json').read_text(encoding='utf-8'))
def enqueue(job):
    jobs[job['id']]=job;save(job);threading.Thread(target=run,args=(job,),daemon=True).start();return job['id']

def create(flow):
    kinds={node.get('class_type') for node in flow.values()}
    if 'HeartMuLaVerified' in kinds:
        inputs=next(node['inputs'] for node in flow.values() if node.get('class_type')=='HeartMuLaVerified')
        prompt=inputs.get('tags','');lyrics=inputs.get('lyrics','');duration=inputs.get('seconds',10);seed=inputs.get('seed',42)
        if not isinstance(prompt,str) or not 1<=len(prompt)<=12000 or not isinstance(lyrics,str) or len(lyrics)>12000:raise ValueError('音樂風格或歌詞長度不正確')
        if not isinstance(duration,int) or not 10<=duration<=60:raise ValueError('HeartMuLa 長度需為 10–60 秒')
        if not isinstance(seed,int) or not 0<=seed<=2147483647:raise ValueError('HeartMuLa 種子不正確')
        ident=str(uuid.uuid4())
        return enqueue({'id':ident,'status':'queued','mode':'music','prompt':prompt,'lyrics':lyrics,'duration':duration,'seed':seed,'output':ident+'.wav','created':time.time(),'model':'heartmula-3b'})
    if '459:452' in flow and '459:474' not in flow:
        mode='text-image';prompt=flow['459:452']['inputs']['prompt'];ratio=flow['13']['inputs']['aspect_ratio'];mp=float(flow['13']['inputs']['megapixels']);image=None
    elif '459:474' in flow:
        mode='image-edit';encoder=flow['459:474']['inputs'];prompt=encoder['prompt'];refs=[v for k,v in encoder.items() if k.startswith('images.image_')]
        if len(refs)!=1:raise ValueError('獨立圖片轉換目前只接受一張參考圖；尚未支援多圖與 Qwen 指令式編輯。')
        image=flow[refs[0][0]]['inputs']['image'];ratio='1:1';mp=.25
        if Path(image).name!=image or not (DATA/'input'/image).is_file():raise ValueError('找不到參考圖片')
    else:raise ValueError('此生成類型尚未完成獨立化。目前支援 SDXL Turbo 文生圖及單圖轉換，不會轉送 ComfyUI。')
    if not isinstance(prompt,str) or not 1<=len(prompt)<=12000:raise ValueError('提示詞長度不正確')
    a,b=map(int,ratio.split(' ')[0].split(':'));w=math.sqrt(max(.2,min(mp,1))*1000000*a/b);h=w*b/a;scale=min(1,768/max(w,h));w=max(256,int(w*scale)//64*64);h=max(256,int(h*scale)//64*64)
    ident=str(uuid.uuid4());job={'id':ident,'status':'queued','mode':mode,'prompt':prompt,'seed':int(flow['459:458']['inputs']['seed']),'width':w,'height':h,'image':image,'output':ident+'.png','created':time.time(),'model':'sdxl-turbo'}
    return enqueue(job)

class Handler(BaseHTTPRequestHandler):
    def reply(self,code,data,mime='application/json'):
        body=json.dumps(data,ensure_ascii=False).encode() if mime=='application/json' else data
        self.send_response(code);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
    def do_GET(self):
        url=urlparse(self.path);route=url.path
        if route=='/capabilities':return self.reply(200,{'engine':'project-native','label':'專案獨立生成引擎','models':catalog()['models'],'modes':['text-image','image-edit','music'],'musicModels':['heartmula'],'limitations':'SDXL Turbo 單圖轉換；HeartMuLa 10–60 秒，CPU 解碼需數分鐘。影片、MiniMax 音樂、多圖精準編輯尚未獨立化。','offline':True})
        if route=='/progress':
            state={}
            for ident,j in jobs.items():
                f=DATA/'jobs'/(ident+'.progress.json')
                try:
                    p=json.loads(f.read_text(encoding='utf-8'));state[ident]={'stage':p['stage'],'value':p['current'],'max':p['total']}
                except (OSError,ValueError,KeyError):pass
            return self.reply(200,state)
        if route=='/queue':
            return self.reply(200,{'queue_running':[[0,j['id']] for j in jobs.values() if j['status']=='running'],'queue_pending':[[0,j['id']] for j in jobs.values() if j['status']=='queued']})
        if route.startswith('/history/'):
            ident=route.split('/')[-1];j=jobs.get(ident)
            if not j or j['status'] in ('running','queued'):return self.reply(200,{})
            kind='audio' if j['mode']=='music' else 'images'
            outputs={'result':{kind:[{'filename':j['output'],'type':'output','subfolder':''}]}} if j['status']=='done' else {}
            return self.reply(200,{ident:{'status':{'completed':j['status']=='done','status_str':'success' if j['status']=='done' else 'error','messages':[j.get('error','')]},'outputs':outputs}})
        if route=='/view':
            name=parse_qs(url.query).get('filename',[''])[0]
            if Path(name).name!=name or Path(name).suffix not in ('.png','.wav'):return self.reply(400,{'error':'Invalid filename'})
            f=DATA/'output'/name
            if not f.is_file():return self.reply(404,{'error':'Not found'})
            return self.reply(200,f.read_bytes(),'audio/wav' if f.suffix=='.wav' else 'image/png')
        if route=='/system_stats':return self.reply(200,{'system':{'engine':'project-native'}})
        self.reply(404,{'error':'Not found'})
    def do_POST(self):
        if self.headers.get('Origin'):return self.reply(403,{'error':'僅供專案後端呼叫'})
        try:
            length=int(self.headers.get('Content-Length',0))
            if not 0<length<=40*1024*1024:return self.reply(413,{'error':'Request too large'})
            raw=self.rfile.read(length)
            if self.path=='/upload/image':
                mime=self.headers.get('Content-Type','')
                parts=BytesParser(policy=default).parsebytes(('Content-Type: '+mime+'\r\nMIME-Version: 1.0\r\n\r\n').encode()+raw)
                for part in parts.iter_parts():
                    if part.get_param('name',header='content-disposition')=='image':
                        suffix=Path(part.get_filename() or '').suffix.lower()
                        if suffix not in ('.png','.jpg','.jpeg','.webp'):raise ValueError('不支援的圖片格式')
                        name=str(uuid.uuid4())+suffix;(DATA/'input'/name).write_bytes(part.get_payload(decode=True));return self.reply(200,{'name':name,'subfolder':'','type':'input'})
                raise ValueError('沒有圖片')
            data=json.loads(raw)
            if self.path=='/shutdown':
                stopping.set()
                for child in list(workers.values()):
                    child.terminate()
                    try:child.wait(timeout=10)
                    except subprocess.TimeoutExpired:child.kill();child.wait()
                self.reply(200,{'ok':True})
                threading.Thread(target=self.server.shutdown,daemon=True).start()
                return
            if self.path=='/free':return self.reply(200,{'ok':True})
            if self.path=='/prompt':
                if any(j['status'] in ('queued','running') for j in jobs.values()):return self.reply(409,{'error':'獨立生成引擎忙碌中'})
                return self.reply(200,{'prompt_id':create(data['prompt'])})
            self.reply(404,{'error':'Not found'})
        except Exception as exc:self.reply(400,{'error':str(exc)})

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=8789);args=parser.parse_args()
    server=ThreadingHTTPServer(('127.0.0.1',args.port),Handler)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close()
