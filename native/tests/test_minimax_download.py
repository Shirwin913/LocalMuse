import hashlib, io, sys, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import download_minimax as downloader
class Response(io.BytesIO):
    def __init__(self,data,status=206,range_header='bytes 0-5/6'):
        super().__init__(data);self.status=status;self.headers={'Content-Range':range_header}
    def geturl(self):return 'https://example.com/refreshed'
class TransferTests(unittest.TestCase):
    def setUp(self):
        downloader.STOP.clear();work=Path(__file__).resolve().parents[2]/'work'
        self.tmp=tempfile.TemporaryDirectory(dir=work)
        self.assertTrue(Path(self.tmp.name).resolve().is_relative_to(work.resolve()))
        self.addCleanup(self.tmp.cleanup);self.target=Path(self.tmp.name)/'chunk.part'
    def test_range_download(self):
        with patch.object(downloader.urllib.request,'urlopen',return_value=Response(b'abcdef')):
            downloader.transfer('https://example.com/model',0,5,self.target)
        self.assertEqual(self.target.read_bytes(),b'abcdef')
    def test_partial_resume(self):
        self.target.write_bytes(b'ab')
        with patch.object(downloader.urllib.request,'urlopen',return_value=Response(b'cdef',range_header='bytes 2-5/6')) as request:
            downloader.transfer('https://example.com/model',0,5,self.target)
        self.assertEqual(request.call_args.args[0].get_header('Range'),'bytes=2-5')
        self.assertEqual(self.target.read_bytes(),b'abcdef')
    def test_completed_chunk_skips_network(self):
        self.target.write_bytes(b'abcdef')
        with patch.object(downloader.urllib.request,'urlopen') as request:
            downloader.transfer('https://example.com/model',0,5,self.target)
        request.assert_not_called()
    def test_small_full_response(self):
        with patch.object(downloader.urllib.request,'urlopen',return_value=Response(b'abcdef',status=200)):
            downloader.transfer('https://example.com/config',0,5,self.target)
        self.assertEqual(self.target.read_bytes(),b'abcdef')
    def test_expired_url_is_refreshed(self):
        url='https://example.com/expired'
        with patch.object(downloader,'CACHE',Path(self.tmp.name)), patch.object(downloader,'URL_CACHE',{'.':url}), patch.object(downloader.time,'sleep'), patch.object(downloader.urllib.request,'urlopen',side_effect=[HTTPError(url,403,'expired',{},None),Response(b''),Response(b'abcdef')]) as request:
            downloader.transfer(url,0,5,self.target)
        self.assertEqual(self.target.read_bytes(),b'abcdef')
        self.assertEqual(request.call_args.args[0].full_url,'https://example.com/refreshed')
    def test_checksum(self):
        self.target.write_bytes(b'abcdef')
        self.assertEqual(downloader.checksum(self.target),hashlib.sha256(b'abcdef').hexdigest())
if __name__=='__main__':unittest.main()
