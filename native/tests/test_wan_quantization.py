import sys,unittest,types
from pathlib import Path
from unittest.mock import Mock,patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from wan_quantization import align_quantization_statistics,raw_checkpoint_quantization
class QuantizationTests(unittest.TestCase):
 def test_offload_statistics_follow_activation_device(self):
  stats=Mock();module=types.SimpleNamespace(weight=types.SimpleNamespace(quant_state=stats))
  align_quantization_statistics(module,(types.SimpleNamespace(device='cuda:0'),))
  stats.to.assert_called_once_with('cuda:0')
 def test_loader_is_restored_on_failure(self):
  factory=object();dispatch=object();read=object()
  loader=types.SimpleNamespace(DiffusersAutoQuantizer=factory,dispatch_model=dispatch,load_single_file_checkpoint=read)
  package=types.ModuleType('diffusers');loaders=types.ModuleType('diffusers.loaders');loaders.single_file_model=loader
  bnb=types.ModuleType('bitsandbytes')
  with patch.dict(sys.modules,{'diffusers':package,'diffusers.loaders':loaders,'bitsandbytes':bnb}):
   with self.assertRaisesRegex(RuntimeError,'test interruption'):
    with raw_checkpoint_quantization():
     self.assertIsNot(loader.dispatch_model,dispatch)
     raise RuntimeError('test interruption')
   self.assertIs(loader.dispatch_model,dispatch);self.assertIs(loader.DiffusersAutoQuantizer,factory);self.assertIs(loader.load_single_file_checkpoint,read)
if __name__=='__main__':unittest.main()
