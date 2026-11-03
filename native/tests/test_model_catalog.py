import json,struct,sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
from model_catalog import load_catalog

def gguf(path,architecture='llama'):
    path.parent.mkdir(parents=True,exist_ok=True)
    def string(text):
        data=text.encode();return struct.pack('<Q',len(data))+data
    path.write_bytes(b'GGUF'+struct.pack('<IQQ',3,1,1)+string('general.architecture')+struct.pack('<I',8)+string(architecture))

class CatalogTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)/'models';self.root.mkdir()
    def config(self,items):
        (self.root/'catalog.json').write_text(json.dumps(items),encoding='utf-8')
    def test_discovery_is_live_and_recursive_without_config(self):
        gguf(self.root/'custom/new-model.gguf')
        items=load_catalog(self.root);self.assertEqual(len(items),1)
        item=next(iter(items.values()));self.assertEqual(item['label'],'new-model');self.assertTrue(item['discovered'])
        (self.root/'custom/new-model.gguf').unlink();self.assertEqual(load_catalog(self.root),{})
    def test_explicit_alias_and_projector_are_preserved_without_duplicates(self):
        gguf(self.root/'chat.gguf');gguf(self.root/'vision.gguf','clip')
        self.config([{'id':'old-id','label':'我的模型','model':'chat.gguf','projector':'vision.gguf'}])
        items=load_catalog(self.root);self.assertEqual(list(items),['old-id']);self.assertEqual(items['old-id']['label'],'我的模型');self.assertEqual(items['old-id']['projector'],'vision.gguf')
    def test_generation_projectors_and_invalid_headers_are_not_chat_models(self):
        for name in ('mmproj-x.gguf','anything-projector.gguf','generation/encoder.gguf'):gguf(self.root/name)
        gguf(self.root/'vision-only.gguf','clip');(self.root/'partial.gguf').write_bytes(b'GGUF');(self.root/'wrong.gguf').write_bytes(b'not a model')
        self.assertEqual(load_catalog(self.root),{})
    def test_missing_projector_does_not_advertise_vision(self):
        gguf(self.root/'chat.gguf');self.config([{'id':'x','model':'chat.gguf','projector':'missing.gguf'}])
        self.assertNotIn('projector',load_catalog(self.root)['x'])
    def test_missing_and_external_configured_files_are_excluded(self):
        gguf(self.root.parent/'outside.gguf')
        self.config([{'id':'outside','model':'../outside.gguf'},{'id':'missing','model':'missing.gguf'}])
        self.assertEqual(load_catalog(self.root),{})
    def test_only_first_shard_is_listed_and_only_when_complete(self):
        gguf(self.root/'invalid-00001-of-00000.gguf');self.assertEqual(load_catalog(self.root),{})
        gguf(self.root/'split-00001-of-00002.gguf');self.assertEqual(load_catalog(self.root),{})
        gguf(self.root/'split-00002-of-00002.gguf');self.assertEqual(len(load_catalog(self.root)),1)
    def test_external_symlink_is_not_followed(self):
        gguf(self.root.parent/'outside.gguf')
        try:(self.root/'linked.gguf').symlink_to(self.root.parent/'outside.gguf')
        except OSError:self.skipTest('Windows symlink creation unavailable')
        self.assertEqual(load_catalog(self.root),{})
    def test_malformed_catalog_is_reported(self):
        (self.root/'catalog.json').write_text('{',encoding='utf-8')
        with self.assertRaises(ValueError):load_catalog(self.root)
if __name__=='__main__':unittest.main()
