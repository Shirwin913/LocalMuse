import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from h3_backend import parse_workflow,frame_count,lora_application
class H3Tests(unittest.TestCase):
    def test_high_quality_is_limited_to_validated_combination(self):
        job=parse_workflow(self.flow(quality='480p',width=864,height=480,seconds=3))
        self.assertEqual(job['quality'],'480p');self.assertEqual(job['steps'],20)
        for change in ({'profile':'turbo'},{'image':'anything.png'},{'width':832},{'seconds':10},{'quality':'unknown'}):
            values={'quality':'480p','width':864,'height':480};values.update(change)
            with self.assertRaises(ValueError):parse_workflow(self.flow(**values))
    def test_upscaled_output_keeps_generation_dimensions(self):
        for resolution in ('720p','1080p'):
            job=parse_workflow(self.flow(quality='480p',width=864,height=480,output_resolution=resolution))
            self.assertEqual((job['width'],job['height']),(864,480))
            self.assertEqual(job['output_resolution'],resolution)
        for values in ({'output_resolution':'4k'},{'output_resolution':'720p'},{'output_resolution':True}):
            with self.assertRaises(ValueError):parse_workflow(self.flow(**values))
        self.assertEqual(parse_workflow(self.flow())['output_resolution'],'source')
    def test_old_recipes_keep_standard_dimensions(self):
        self.assertEqual(parse_workflow(self.flow())['quality'],'standard')
        with self.assertRaises(ValueError):parse_workflow(self.flow(width=864,height=480))
    def test_lora_application_evidence(self):
        self.assertEqual(lora_application('[I] (624 / 624) LoRA tensors have been applied, file=x'),(624,624))
        self.assertEqual(lora_application('[I] (0 / 624) LoRA tensors have been applied'),(0,624))
        self.assertIsNone(lora_application('loading lora file'))
    def flow(self,**changes):
        p={'prompt':'一隻貓咪緩慢眨眼','seed':42,'seconds':1,'width':512,'height':288};p.update(changes)
        return {'h3':{'class_type':'ProjectMiniMaxH3','inputs':p}}
    def test_original_and_turbo_are_explicit(self):
        self.assertEqual(parse_workflow(self.flow())['steps'],20)
        self.assertEqual(parse_workflow(self.flow(profile='turbo'))['steps'],8)
        with self.assertRaises(ValueError):parse_workflow(self.flow(profile='other'))
    def test_comfy_frame_grid_is_preserved(self):
        self.assertEqual([frame_count(s) for s in (1,2,3)],[39,56,73])
    def test_unvalidated_lengths_and_dimensions_rejected(self):
        for change in ({'seconds':4},{'seconds':True},{'width':1024,'height':1024},{'width':513},{'height':False}):
            with self.assertRaises(ValueError):parse_workflow(self.flow(**change))
    def test_unsafe_seed_and_reference_rejected(self):
        for change in ({'seed':True},{'seed':-1},{'image':'../private.png'},{'image':'missing.png'}):
            with self.assertRaises(ValueError):parse_workflow(self.flow(**change))
if __name__=='__main__':unittest.main()
