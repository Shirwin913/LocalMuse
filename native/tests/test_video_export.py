import subprocess,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from video_export import export_video,output_size

class ExportTests(unittest.TestCase):
    def test_reject_overwriting_source(self):
        with self.assertRaises(ValueError):export_video(Path('original.mp4'),Path('original.mp4'),'720p',True)
    def test_failure_preserves_existing_files_and_removes_partial(self):
        with tempfile.TemporaryDirectory() as temp:
            source=Path(temp)/'source.mp4';source.write_bytes(b'original')
            target=Path(temp)/'result.mp4';target.write_bytes(b'previous result')
            def fail(*args,**kwargs):
                (Path(temp)/'result.encoding.mp4').write_bytes(b'partial')
                raise subprocess.TimeoutExpired('ffmpeg',600)
            with patch('video_export.subprocess.run',side_effect=fail):
                with self.assertRaises(subprocess.TimeoutExpired):export_video(source,target,'1080p',True)
            self.assertEqual(source.read_bytes(),b'original')
            self.assertEqual(target.read_bytes(),b'previous result')
            self.assertFalse((Path(temp)/'result.encoding.mp4').exists())
    def test_whitelisted_geometry(self):
        self.assertEqual(output_size('source',864,480),(864,480))
        self.assertEqual(output_size('720p',864,480),(1280,720))
        self.assertEqual(output_size('1080p',864,480),(1920,1080))
        with self.assertRaises(ValueError):output_size('4k',864,480)
if __name__=='__main__':unittest.main()
