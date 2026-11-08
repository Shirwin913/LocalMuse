import sys,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import generation_service as service
class HeartMuLaDurationTests(unittest.TestCase):
    def flow(self,duration,seed=42):
        return {'music':{'class_type':'HeartMuLaVerified','inputs':{'tags':'lofi hip-hop','lyrics':'','seconds':duration,'seed':seed}}}
    def test_long_duration_reaches_job_without_clamping(self):
        for seconds in (10,60,180):
            with patch.object(service,'enqueue',return_value='test') as enqueue:
                self.assertEqual(service.create(self.flow(seconds)),'test')
                self.assertEqual(enqueue.call_args.args[0]['duration'],seconds)
    def test_invalid_duration_does_not_start_worker(self):
        for value in (9,181,True,'180',180.5):
            with patch.object(service,'enqueue') as enqueue:
                with self.assertRaises(ValueError):service.create(self.flow(value))
                enqueue.assert_not_called()
    def test_ending_setting_is_validated_and_preserved(self):
        flow=self.flow(180);flow['music']['inputs']['ending']='fade8'
        with patch.object(service,'enqueue',return_value='test') as enqueue:
            service.create(flow);self.assertEqual(enqueue.call_args.args[0]['ending'],'fade8')
        flow['music']['inputs']['ending']='invalid'
        with self.assertRaises(ValueError):service.create(flow)
    def test_boolean_seed_is_rejected(self):
        with self.assertRaises(ValueError):service.create(self.flow(180,True))
if __name__=='__main__':unittest.main()
