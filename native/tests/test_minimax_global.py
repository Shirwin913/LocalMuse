import sys, unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import torch
from minimax_global import windows, sample_global, decode_tiled

class GlobalSamplerTests(unittest.TestCase):
    def test_all_positions_covered_once_or_more(self):
        for length in (1,689,690,861,5167):
            counts=torch.zeros(length)
            spans=list(windows(length,689,344))
            for start,end in spans:counts[start:end]+=1
            self.assertTrue(bool((counts>0).all()))
            self.assertEqual(spans[-1][1],length)
    def test_invalid_window_rejected(self):
        with self.assertRaises(ValueError):list(windows(10,3,4))
    def test_overlap_does_not_amplify_velocity(self):
        condition=torch.ones(1,11,1)
        def model(hidden_states,timestep,encoder_hidden_states,return_dict):
            return (encoder_hidden_states.transpose(1,2).expand_as(hidden_states)*2,)
        out=sample_global(model,condition,42,4,1.7,6,3,lambda *a:None)
        initial=torch.randn((1,128,11),generator=torch.Generator('cpu').manual_seed(42))
        torch.testing.assert_close(out,initial+3.4)
        self.assertEqual(out.dtype,torch.float32)
    def test_step_times_and_progress(self):
        times=[];progress=[]
        def model(hidden_states,timestep,encoder_hidden_states,return_dict):
            times.append(float(timestep[0]));return (torch.zeros_like(hidden_states),)
        sample_global(model,torch.ones(1,3,1),7,4,1.7,6,3,lambda *a:progress.append(a))
        self.assertEqual(times,[0,0,.25,.25,.5,.5,.75,.75])
        self.assertEqual([p[1] for p in progress],[1,2,3,4])
    def test_tiled_decode_preserves_overlap_and_bounds(self):
        latents=torch.arange(23).float().reshape(1,1,23);sizes=[]
        def decoder(z):sizes.append(z.shape[-1]);return z.repeat_interleave(2,dim=-1)
        result,info=decode_tiled(decoder,latents,2,tile_length=8,overlap=2)
        torch.testing.assert_close(result,latents.repeat_interleave(2,dim=-1))
        self.assertTrue(all(n<=8 for n in sizes));self.assertGreater(info['tiles'],1)
    def test_tiled_decode_rejects_wrong_sample_count(self):
        with self.assertRaisesRegex(RuntimeError,'output length'):
            decode_tiled(lambda z:z,torch.ones(1,1,23),2,tile_length=8,overlap=2)
if __name__=='__main__':unittest.main()
