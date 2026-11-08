import json, os, sys, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import gpu_backend


class BackendTests(unittest.TestCase):
    def setUp(self):
        gpu_backend._cached = None
        self.addCleanup(setattr, gpu_backend, '_cached', None)
        self.temp = tempfile.TemporaryDirectory(dir=os.environ.get('LOCALMUSE_TEST_TMP'))
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for name, value in (('ROOT', self.root), ('CONFIG', self.root / 'runtime/gpu-backend.json')):
            patcher = patch.object(gpu_backend, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        env = patch.dict(os.environ, {}, clear=False)
        env.start()
        self.addCleanup(env.stop)
        os.environ.pop('LOCALMUSE_GPU', None)

    def detect(self, nvidia=False, adapters=()):
        with patch.object(gpu_backend, '_nvidia_present', return_value=nvidia), \
             patch.object(gpu_backend, 'display_adapters', return_value=list(adapters)):
            return gpu_backend.detect()

    def test_nvidia_detected_by_driver_tool(self):
        self.assertEqual(self.detect(nvidia=True, adapters=['AMD Radeon(TM) Graphics']), 'nvidia')

    def test_existing_nvidia_environment_is_kept_without_driver_tool(self):
        python = self.root / 'runtime/generation-env/Scripts/python.exe'
        python.parent.mkdir(parents=True)
        python.write_text('')
        self.assertEqual(self.detect(adapters=['AMD Radeon RX 7900 XTX']), 'nvidia')

    def test_amd_detected_from_display_adapter(self):
        self.assertEqual(self.detect(adapters=['AMD Radeon RX 9070 XT']), 'amd')

    def test_no_supported_gpu(self):
        self.assertEqual(self.detect(adapters=['Intel(R) UHD Graphics']), 'none')

    def test_config_and_environment_override(self):
        self.CONFIG = self.root / 'runtime/gpu-backend.json'
        self.CONFIG.parent.mkdir(parents=True)
        self.CONFIG.write_text(json.dumps({'backend': 'amd'}))
        self.assertEqual(self.detect(nvidia=True), 'amd')
        os.environ['LOCALMUSE_GPU'] = 'none'
        self.assertEqual(self.detect(nvidia=True), 'none')

    def test_nvidia_paths_and_markers_unchanged(self):
        gpu_backend._cached = 'nvidia'
        self.assertEqual(gpu_backend.marker(self.root / 'm'), self.root / 'm/validated.json')
        self.assertEqual(gpu_backend.marker(self.root / 'm', 'validated-turbo.json'), self.root / 'm/validated-turbo.json')
        self.assertTrue(str(gpu_backend.generation_python()).endswith('generation-env/Scripts/python.exe'))
        self.assertTrue(str(gpu_backend.sd_engine()).endswith('sd-cpp/sd-cli.exe'))
        self.assertTrue(gpu_backend.supports_bitsandbytes())
        self.assertTrue(gpu_backend.torch_ready())

    def test_amd_uses_separate_runtimes_and_markers(self):
        gpu_backend._cached = 'amd'
        self.assertEqual(gpu_backend.marker(self.root / 'm', 'validated-turbo.json'), self.root / 'm/validated-amd-turbo.json')
        self.assertTrue(str(gpu_backend.generation_python()).endswith('generation-env-amd/Scripts/python.exe'))
        self.assertTrue(str(gpu_backend.minimax_python()).endswith('minimax-env-amd/Scripts/python.exe'))
        self.assertTrue(str(gpu_backend.sd_engine()).endswith('sd-cpp-amd/sd-cli.exe'))
        self.assertFalse(gpu_backend.supports_bitsandbytes())
        self.assertFalse(gpu_backend.torch_ready())  # not installed yet
        self.assertIn('setup-amd.bat', gpu_backend.status()['reason'])

    def test_require_gpu_messages(self):
        class Torch:
            class cuda:
                @staticmethod
                def is_available(): return False
        gpu_backend._cached = 'amd'
        with self.assertRaisesRegex(RuntimeError, 'ROCm'):
            gpu_backend.require_gpu(Torch, 'X')
        gpu_backend._cached = 'nvidia'
        with self.assertRaisesRegex(RuntimeError, 'CUDA'):
            gpu_backend.require_gpu(Torch, 'X')


class CapabilityTests(unittest.TestCase):
    def setUp(self):
        import generation_service as service
        self.service = service
        self.addCleanup(setattr, gpu_backend, '_cached', None)

    def caps(self):
        return {'modes': ['text-image', 'image-edit', 'music', 'text-video'], 'imageModels': ['sdxl-turbo'],
                'musicModels': ['heartmula'], 'videoModels': ['wan'], 'imageMethods': ['transform']}

    def test_nvidia_capabilities_untouched(self):
        gpu_backend._cached = 'nvidia'
        result = self.service.adjust_capabilities(self.caps())
        self.assertEqual(result['modes'], ['text-image', 'image-edit', 'music', 'text-video'])
        self.assertEqual(result['gpu']['backend'], 'nvidia')

    def test_no_gpu_disables_generation(self):
        gpu_backend._cached = 'none'
        result = self.service.adjust_capabilities(self.caps())
        self.assertEqual((result['modes'], result['imageModels'], result['musicModels']), ([], [], []))
        with self.assertRaises(ValueError):
            self.service.create({'1': {'class_type': 'HeartMuLaVerified', 'inputs': {}}})

    def test_amd_only_lists_validated_models(self):
        gpu_backend._cached = 'amd'
        with patch.object(self.service, 'sdxl_ready', return_value=True), patch.object(self.service, 'heartmula_ready', return_value=False), \
             patch.object(self.service, 'qwen_ready', return_value=False), patch.object(self.service, 'h3_ready', return_value=True), \
             patch.object(self.service, 'video_ready', return_value=False), patch.object(self.service, 'image_video_ready', return_value=False), \
             patch.object(self.service, 'minimax_ready', return_value=False), patch.object(self.service, 'reference_ready', return_value=False):
            result = self.service.adjust_capabilities(self.caps())
        self.assertEqual(result['modes'], ['text-image', 'image-edit', 'text-video', 'video'])
        self.assertEqual(result['musicModels'], [])
        self.assertEqual(result['videoModels'], ['minimax-h3'])

    def test_amd_worker_command_uses_amd_python(self):
        gpu_backend._cached = 'amd'
        python, worker = self.service.command({'mode': 'music', 'model': 'heartmula-3b'})
        self.assertIn('generation-env-amd', str(python))
        self.assertEqual(worker, 'native/music_worker.py')
        python, worker = self.service.command({'mode': 'music', 'model': 'minimax-music3'})
        self.assertIn('minimax-env-amd', str(python))
        gpu_backend._cached = 'nvidia'
        python, _ = self.service.command({'mode': 'text-image', 'model': 'sdxl-turbo'})
        self.assertTrue(str(python).endswith(os.path.join('generation-env', 'Scripts', 'python.exe')))


if __name__ == '__main__':
    unittest.main()
