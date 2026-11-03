"""Worker-local compatibility for the pinned MiniMax Diffusers implementation.

Preserve the saved workflow's sampling controls and empty lyrics instead of
changing the user's conditioning to satisfy the upstream UI validation.
"""
def validate_text_inputs(state):
    if not isinstance(state.prompt, str) or not state.prompt.strip():
        raise ValueError('MiniMax prompt must be a non-empty string')
    if not isinstance(state.lyrics, str):
        raise ValueError('MiniMax lyrics must be a string (empty is allowed)')


def configure_encoder(encoders, settings):
    encoders._AR_CFG_SCALE = settings['text_cfg_scale']
    encoders._AR_CFG_TOP_K = settings['top_k']
    encoders._AR_SAMPLING_TOP_K = settings['top_k']
    encoders.MiniMaxMusic3TextEncoderStep.check_inputs = staticmethod(validate_text_inputs)
