"""Load T5 through an ASCII relative path inside a dedicated worker.

SentencePiece's Windows file loader rejects some absolute Unicode paths.
Python can enter that directory first; the tokenizer stays entirely local.
"""
from pathlib import Path
from contextlib import chdir
from transformers import T5Tokenizer

def load_tokenizer(folder):
    folder=Path(folder).resolve()
    with chdir(folder):
        tokenizer=T5Tokenizer.from_pretrained('.',local_files_only=True,legacy=True)
    if not callable(tokenizer):raise RuntimeError('Wan tokenizer could not be loaded')
    tokenizer.vocab_file=str(folder/'spiece.model')
    return tokenizer
