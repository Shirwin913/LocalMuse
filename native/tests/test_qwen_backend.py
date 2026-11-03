import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from qwen_backend import parse_workflow
class QwenTests(unittest.TestCase):
    def request(self,**changes):
        p={'prompt':'一隻可愛的貓咪，用日式漫畫風格','seed':15853914971458,'width':1024,'height':1024};p.update(changes)
        return {'qwen':{'class_type':'ProjectQwenImage','inputs':p}}
    def test_preserves_chinese_and_original_sampling(self):
        job=parse_workflow(self.request());self.assertIn('貓',job['prompt']);self.assertEqual(job['steps'],25);self.assertEqual(job['cfg'],1)
    def test_rejects_invalid_seed(self):
        for seed in (-1,True,1.5,9007199254740992):
            with self.assertRaises(ValueError):parse_workflow(self.request(seed=seed))
    def test_rejects_unbounded_resolution(self):
        for change in ({'width':1025},{'height':False},{'width':1536,'height':1536}):
            with self.assertRaises(ValueError):parse_workflow(self.request(**change))
    def test_rejects_reference_path_escape(self):
        for image in ('../private.png','missing.png'):
            with self.assertRaises(ValueError):parse_workflow(self.request(image=image))
if __name__=='__main__':unittest.main()
