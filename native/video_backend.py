"""Validated local Wan video capabilities and bounded request parsing."""
from pathlib import Path
import gpu_backend
ROOT=Path(__file__).resolve().parents[1]
MODEL=ROOT/'models/generation/wan-1.3b'
def ready():
 return gpu_backend.torch_ready() and gpu_backend.marker(MODEL).is_file() and all((MODEL/p).is_file() for p in ('transformer.safetensors','vae.safetensors','text_encoder/model.safetensors.index.json','tokenizer/spiece.model'))
def image_ready():
 return ready() and gpu_backend.marker(ROOT/'models/generation/wan-i2v-14b').is_file() and all((ROOT/'models/generation'/p).is_file() for p in ('wan-i2v-14b/transformer.safetensors','ip-adapter/image_encoder/model.safetensors'))
def parse_workflow(flow,input_root=None):
 data=next(n['inputs'] for n in flow.values() if n.get('class_type') in ('ProjectWanVideo','ProjectWanImageVideo'))
 i2v=any(n.get('class_type')=='ProjectWanImageVideo' for n in flow.values())
 limit=1 if i2v else 3
 prompt=data.get('prompt');seconds=data.get('seconds');seed=data.get('seed');width=data.get('width');height=data.get('height')
 if not isinstance(prompt,str) or not 1<=len(prompt)<=12000:raise ValueError('影片提示詞需為1–12000字元')
 if type(seconds) is not int or not 1<=seconds<=limit:raise ValueError('本機圖片生影片目前支援1秒' if i2v else '本機文字短片目前支援1–3秒')
 if type(seed) is not int or not 0<=seed<=9007199254740991:raise ValueError('影片種子不正確')
 if any(type(n) is not int or n%16 or not 352<=n<=832 for n in (width,height)) or width*height>832*480:raise ValueError('影片解析度超出本機預覽限制')
 image=None
 if i2v:
  image=data.get('image');base=Path(input_root or ROOT/'generated/input').resolve()
  if not isinstance(image,str) or Path(image).name!=image or Path(image).suffix.lower() not in ('.png','.jpg','.jpeg','.webp'):raise ValueError('參考圖片檔名不正確')
  candidate=(base/image).resolve()
  if not candidate.is_relative_to(base) or not candidate.is_file():raise ValueError('找不到參考圖片')
 return {'mode':'video' if i2v else 'text-video','model':'wan-2.1-i2v-14b-nf4' if i2v else 'wan-2.1-t2v-1.3b','image':image,'prompt':prompt,'seed':seed,'width':width,'height':height,'num_frames':seconds*16+1,'fps':16,'steps':20 if i2v else 30}
