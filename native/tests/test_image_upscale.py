import sys, unittest
from pathlib import Path
import torch
import numpy as np
from PIL import Image
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from image_upscale import target_size, enhance

class Nearest(torch.nn.Module):
    def __init__(self):
        super().__init__()
        self.weight = torch.nn.Parameter(torch.ones(1))
    def forward(self, value):
        return torch.nn.functional.interpolate(value, scale_factor=2, mode='nearest')

class UpscaleTests(unittest.TestCase):
    def test_dimensions_preserve_aspect(self):
        self.assertEqual(target_size(1024, 576, '4k'), (3840, 2160))
        self.assertEqual(target_size(576, 1024, '4k'), (2160, 3840))
        self.assertEqual(target_size(1024, 1024, '4k'), (3840, 3840))
        self.assertEqual(target_size(513, 511, '2x'), (1026, 1022))
    def test_reject_invalid_and_oversize(self):
        for args in [(1024, 1024, 'bad'), (4000, 2000, '4k'), (2500, 2500, '2x')]:
            with self.assertRaises(ValueError): target_size(*args)
    def test_tiles_cover_odd_edges_without_seams(self):
        data = np.random.default_rng(5).integers(0, 256, (131, 259, 3), dtype=np.uint8)
        output = np.array(enhance(Nearest(), Image.fromarray(data), 'cpu', tile=128))
        np.testing.assert_array_equal(output, data.repeat(2, 0).repeat(2, 1))

if __name__ == '__main__': unittest.main()
