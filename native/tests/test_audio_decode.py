import sys, unittest
from pathlib import Path
from unittest.mock import patch
from contextlib import nullcontext
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import torch
from audio_decode import decode_audio
class Codec:
    def __init__(self, oom=False, fail=False):self.moves=[];self.oom=oom;self.fail=fail
    def parameters(self):return [torch.zeros(1)]
    def buffers(self):return []
    def to(self,**kw):self.moves.append(kw['device']);return self
    def eval(self):return self
    def detokenize(self,codes,device):
        if device=='cuda' and self.oom:raise torch.cuda.OutOfMemoryError('simulated')
        if self.fail:raise ValueError('real error')
        return torch.ones(2,48)
class Tests(unittest.TestCase):
    def check(self,available,free,oom=False):
        codec=Codec(oom);stages=[]
        with patch.object(torch.cuda,'is_available',return_value=available),patch.object(torch.cuda,'mem_get_info',return_value=(free,10*1024**3)),patch.object(torch.cuda,'empty_cache'),patch.object(torch.cuda,'manual_seed_all'),patch.object(torch,'autocast',return_value=nullcontext()):
            wave,info=decode_audio(codec,torch.zeros(8,125),stages.append,42)
        self.assertEqual(tuple(wave.shape),(2,48));return codec,info
    def test_gpu(self):
        codec,info=self.check(True,9*1024**3);self.assertEqual(info['device'],'cuda');self.assertEqual(codec.moves,['cuda'])
    def test_low_memory(self):
        codec,info=self.check(True,1024);self.assertEqual(info['reason'],'insufficient_vram');self.assertEqual(codec.moves,['cpu'])
    def test_no_cuda(self):self.assertEqual(self.check(False,0)[1]['reason'],'cuda_unavailable')
    def test_oom_fallback(self):
        codec,info=self.check(True,9*1024**3,True);self.assertEqual(info['reason'],'gpu_out_of_memory');self.assertEqual(codec.moves,['cuda','cpu','cpu'])
    def test_other_errors_not_hidden(self):
        with patch.object(torch.cuda,'is_available',return_value=False):
            with self.assertRaises(ValueError):decode_audio(Codec(fail=True),torch.zeros(8,125),lambda *a:None,42)
if __name__ == "__main__":
    unittest.main()
