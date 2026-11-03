import sys,unittest,tempfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from video_backend import parse_workflow
class VideoRequestTests(unittest.TestCase):
 def flow(self):return {'video':{'class_type':'ProjectWanVideo','inputs':{'prompt':'a blue sphere rolling','seconds':1,'seed':42,'width':832,'height':480}}}
 def test_frame_grid_and_model(self):
  job=parse_workflow(self.flow());self.assertEqual(job['num_frames'],17);self.assertEqual(job['model'],'wan-2.1-t2v-1.3b')
 def test_reject_long_and_boolean_duration(self):
  for v in (0,4,True,'2'):
   f=self.flow();f['video']['inputs']['seconds']=v
   with self.assertRaises(ValueError):parse_workflow(f)
 def test_reject_unsafe_dimensions(self):
  for w,h in ((4096,4096),(0,144),(257,144),(None,144),(832,832)):
   f=self.flow();f['video']['inputs'].update(width=w,height=h)
   with self.assertRaises(ValueError):parse_workflow(f)
 def test_reject_invalid_seed(self):
  f=self.flow();f['video']['inputs']['seed']=-1
  with self.assertRaises(ValueError):parse_workflow(f)
 def test_i2v_requires_safe_existing_image(self):
  flow=self.flow();flow['video']['class_type']='ProjectWanImageVideo'
  with tempfile.TemporaryDirectory() as folder:
   Path(folder,'frame.png').write_bytes(b'fixture')
   flow['video']['inputs']['image']='frame.png'
   job=parse_workflow(flow,input_root=folder)
   self.assertEqual(job['mode'],'video');self.assertEqual(job['model'],'wan-2.1-i2v-14b-nf4')
   for image in ('../frame.png','missing.png',None):
    flow['video']['inputs']['image']=image
    with self.assertRaises(ValueError):parse_workflow(flow,input_root=folder)
 def test_i2v_rejects_unvalidated_length(self):
  flow=self.flow();flow['video']['class_type']='ProjectWanImageVideo';flow['video']['inputs']['seconds']=2
  with self.assertRaises(ValueError):parse_workflow(flow)
if __name__=='__main__':unittest.main()
