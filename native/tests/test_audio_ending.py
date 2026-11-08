import sys,tempfile,unittest
from pathlib import Path
import numpy as np,soundfile as sf
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from audio_ending import fade_file,write_audio,validate_ending
class EndingTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.folder=Path(self.temp.name)
        self.rate=1000;time=np.arange(20000)/self.rate
        self.wave=np.stack([.4*np.sin(2*np.pi*13*time),.3*np.cos(2*np.pi*17*time)],axis=1).astype('float32')
        self.source=self.folder/'original.wav';sf.write(self.source,self.wave,self.rate,subtype='PCM_16')
    def test_fade_preserves_source_length_channels_and_untouched_prefix(self):
        original=self.source.read_bytes();target=self.folder/'fade.wav'
        info=fade_file(self.source,target,'fade8');audio,rate=sf.read(target,always_2d=True)
        source,_=sf.read(self.source,always_2d=True);start=round(info['start_seconds']*rate)
        self.assertEqual(original,self.source.read_bytes());self.assertEqual(audio.shape,source.shape)
        self.assertTrue(np.array_equal(audio[:start],source[:start]));self.assertTrue(np.all(audio[-300:]==0))
        self.assertTrue(np.isfinite(audio).all());self.assertLessEqual(abs(audio).max(),abs(source).max())
        self.assertEqual(info['fade_seconds'],5) # capped to last quarter of 20 seconds
    def test_none_and_fade_write_modes_keep_originals(self):
        raw=self.folder/'raw.wav';self.assertEqual(write_audio(self.wave,self.rate,raw)['mode'],'none')
        target=self.folder/'result.wav';write_audio(self.wave,self.rate,target,'fade12')
        self.assertTrue((self.folder/'result.original.wav').exists());self.assertTrue(target.exists())
    def test_invalid_modes_and_source_overwrite_rejected(self):
        for value in ('unknown',None,True):
            with self.assertRaises(ValueError):validate_ending(value)
        with self.assertRaises(ValueError):fade_file(self.source,self.source,'fade8')
    def test_short_clip_ending_is_bounded(self):
        source=self.folder/'short.wav';sf.write(source,self.wave[:100],self.rate)
        target=self.folder/'short-fade.wav';info=fade_file(source,target,'fade12')
        self.assertLessEqual(info['fade_seconds'],.025)
        audio,rate=sf.read(target,always_2d=True);self.assertEqual(len(audio),100);self.assertTrue(np.all(audio[-5:]==0))
if __name__=='__main__':unittest.main()
