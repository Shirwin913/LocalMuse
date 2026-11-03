import sys,unittest
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from h3_nvfp4_repack import unblock_scales,repack_blocks
def blocked_scales(values):
    rows,cols=values.shape;nr=(rows+127)//128;nc=(cols+3)//4
    storage=np.zeros(nr*nc*512,dtype=np.uint8)
    for r in range(rows):
        for c in range(cols):
            index=((r//128*nc+c//4)*32+r%32)*16+(r%128//32)*4+c%4
            storage[index]=values[r,c]
    return storage.reshape(nr*128,nc*4)
class RepackTests(unittest.TestCase):
    def test_scale_swizzle_across_tile_boundaries(self):
        values=np.arange(129*8,dtype=np.uint16).astype(np.uint8).reshape(129,8)
        np.testing.assert_array_equal(unblock_scales(blocked_scales(values),129,8),values)
    def test_all_weight_codes_and_scale_bytes_are_preserved(self):
        rng=np.random.default_rng(42);packed=rng.integers(0,256,(129,64),dtype=np.uint8);scales=rng.integers(0,127,(129,8),dtype=np.uint8)
        out=repack_blocks(packed,blocked_scales(scales))
        np.testing.assert_array_equal(out[...,:4].reshape(129,8),scales)
        original=np.stack((packed>>4,packed&15),axis=-1).reshape(129,8,16)
        q=out[...,4:].reshape(129,8,8)
        restored=np.concatenate((q&15,q>>4),axis=-1)
        np.testing.assert_array_equal(restored,original)
    def test_unaligned_width_is_rejected(self):
        with self.assertRaises(ValueError):repack_blocks(np.zeros((128,24),dtype=np.uint8),np.zeros((128,4),dtype=np.uint8))
if __name__=='__main__':unittest.main()
