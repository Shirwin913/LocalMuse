import sys, json, unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import minimax_backend as backend
from minimax_compat import validate_text_inputs, configure_encoder
from types import SimpleNamespace
ROOT=Path(__file__).resolve().parents[2]
class MiniMaxTests(unittest.TestCase):
    def flow(self):return json.loads((ROOT/'studio/music-workflow.json').read_text(encoding='utf-8'))
    def test_existing_workflow(self):
        job=backend.parse_workflow(self.flow())
        self.assertEqual(job['model'],'minimax-music3');self.assertEqual(job['duration'],60)
        self.assertIsInstance(job['seed'],int)
    def test_workflow_sampling_is_preserved(self):
        flow=self.flow();flow['37:13']['inputs'].update(cfg_scale=2.3,top_k=40)
        flow['37:9']['inputs'].update(steps=24,cfg=2.0)
        job=backend.parse_workflow(flow)
        self.assertEqual((job['text_cfg_scale'],job['top_k'],job['steps'],job['diffusion_cfg']),(2.3,40,24,2.0))
        original=backend.parse_workflow(self.flow())
        self.assertEqual(original['text_cfg_scale'],1.7)
    def test_unsupported_sampler_is_rejected(self):
        flow=self.flow();flow['37:9']['inputs']['sampler_name']='dpmpp_2m'
        with self.assertRaises(ValueError):backend.parse_workflow(flow)
    def test_invalid_sampling_settings(self):
        for key,value in [('cfg_scale',float('nan')),('cfg_scale',True),('top_k',0),('top_k',False)]:
            flow=self.flow();flow['37:13']['inputs'][key]=value
            with self.assertRaises(ValueError):backend.parse_workflow(flow)
    def test_empty_lyrics_remain_empty(self):
        state=SimpleNamespace(prompt='piano',lyrics='')
        validate_text_inputs(state)
        self.assertEqual(state.lyrics,'')
        for invalid in (None,123):
            with self.assertRaises(ValueError):validate_text_inputs(SimpleNamespace(prompt='piano',lyrics=invalid))
    def test_pinned_encoder_receives_workflow_cfg(self):
        class Encoder:pass
        encoders=SimpleNamespace(MiniMaxMusic3TextEncoderStep=Encoder)
        configure_encoder(encoders,{'text_cfg_scale':1.7,'top_k':50})
        self.assertEqual(encoders._AR_CFG_SCALE,1.7)
        self.assertEqual(encoders._AR_CFG_TOP_K,50)
        self.assertEqual(encoders._AR_SAMPLING_TOP_K,50)
        Encoder.check_inputs(SimpleNamespace(prompt='piano',lyrics=''))
    def test_profile_is_explicit_and_validated(self):
        flow=self.flow();self.assertEqual(backend.parse_workflow(flow)['sampling_profile'],'global-euler')
        flow['37:13']['inputs']['project_profile']='reference'
        self.assertEqual(backend.parse_workflow(flow)['sampling_profile'],'reference')
        flow['37:13']['inputs']['project_profile']='unknown'
        with self.assertRaises(ValueError):backend.parse_workflow(flow)
    def test_duration_limits(self):
        for value in [0,4,301,True,'10']:
            flow=self.flow();flow['37:13']['inputs']['max_duration']=value
            with self.assertRaises(ValueError):backend.parse_workflow(flow)
    def test_lyrics_limit(self):
        flow=self.flow();flow['37:13']['inputs']['lyrics']='x'*12001
        with self.assertRaises(ValueError):backend.parse_workflow(flow)
    def test_invalid_seed(self):
        flow=self.flow();flow['37:13']['inputs']['seed']=-1
        with self.assertRaises(ValueError):backend.parse_workflow(flow)
    def test_not_ready_without_models(self):
        with patch.object(backend,'installed',return_value=False):self.assertFalse(backend.ready())
if __name__=='__main__':unittest.main()
