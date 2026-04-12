"""
SMT++ (Sheet Music Transformer) PyTorch → ONNX Export Script.

Downloads smt-grandstaff from HuggingFace, handles weight key remapping
(checkpoint uses old names), exports encoder/decoder as separate ONNX files,
and extracts vocabulary as JSON.

Usage:
    pip install torch torchvision transformers onnx onnxruntime onnxscript numpy loguru safetensors
    python scripts/export_smt_onnx.py
"""

import json
import os
import sys
import tempfile
import subprocess

import numpy as np
import torch
import torch.nn as nn

MODEL_ID = "antoniorv6/smt-grandstaff"
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "models", "smt")
OPSET_VERSION = 14
FIXED_HEIGHT = 256
FIXED_WIDTH = 1024

# ─── Ensure SMT code available ───

def _ensure_smt():
    smt_dir = os.path.join(tempfile.gettempdir(), "SMT")
    if not os.path.exists(os.path.join(smt_dir, "smt_model")):
        print("Cloning SMT repository...")
        subprocess.run(
            ["git", "clone", "--depth", "1", "https://github.com/antoniorv6/SMT.git", smt_dir],
            check=True,
        )
    sys.path.insert(0, smt_dir)

_ensure_smt()


# ─── Key remapping: checkpoint (old) → code (new) ───

def remap_state_dict(state_dict):
    """Remap checkpoint keys from old naming to current code naming."""
    mapping = {
        'input_attention': 'self_attn',
        'cross_attention': 'cross_attn',
        'ffNet': 'ffn',
        '.lk.': '.k_proj.',
        '.lq.': '.q_proj.',
        '.lv.': '.v_proj.',
        '.out_layer.': '.vocab_projection.',
        '.norm1.': '.norm_layers.0.',
        '.norm2.': '.norm_layers.1.',
        '.norm3.': '.norm_layers.2.',
    }
    new_dict = {}
    for key, value in state_dict.items():
        new_key = key
        for old, new in mapping.items():
            new_key = new_key.replace(old, new)
        # out_layer was Conv1d (shape [out, in, 1]) → vocab_projection is Linear (shape [out, in])
        if 'vocab_projection.weight' in new_key and value.dim() == 3:
            value = value.squeeze(-1)
        new_dict[new_key] = value
    return new_dict


# ─── Wrappers ───

class EncoderWrapper(nn.Module):
    def __init__(self, encoder, pos2D):
        super().__init__()
        self.encoder = encoder
        self.pos2D = pos2D

    def forward(self, pixel_values):
        features = self.encoder(pixel_values=pixel_values).last_hidden_state
        features_2d = self.pos2D(features)
        B, C, H, W = features.shape
        raw = features.permute(0, 2, 3, 1).reshape(B, H * W, C)
        pos = features_2d.permute(0, 2, 3, 1).reshape(B, H * W, C)
        return pos, raw


class DecoderWrapper(nn.Module):
    def __init__(self, decoder_module):
        super().__init__()
        self.decoder_module = decoder_module
        # Disable flash attention
        for _, m in self.decoder_module.named_modules():
            if hasattr(m, 'has_flash_attn'):
                m.has_flash_attn = False

    def forward(self, token_ids, encoder_2d, encoder_raw):
        # Use the Decoder module's own forward which handles tuple unpacking
        _, predictions, _ = self.decoder_module(
            decoder_input=token_ids,
            encoder_output_2D=encoder_2d,
            encoder_output_raw=encoder_raw,
            return_weights=False,
        )
        return predictions


# ─── Main ───

def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    from transformers import AutoConfig, AutoModelForCausalLM
    from smt_model.configuration_smt import SMTConfig
    from smt_model.modeling_smt import SMTModelForCausalLM
    AutoConfig.register("SMT", SMTConfig)
    AutoModelForCausalLM.register(SMTConfig, SMTModelForCausalLM)

    print(f"Loading config from {MODEL_ID}...")
    config = AutoConfig.from_pretrained(MODEL_ID, trust_remote_code=True)

    print("Creating model and loading weights with key remapping...")
    model = SMTModelForCausalLM(config)

    # Load safetensors with key remapping
    from safetensors.torch import load_file
    from huggingface_hub import hf_hub_download
    sf_path = hf_hub_download(MODEL_ID, "model.safetensors")
    old_state = load_file(sf_path)
    new_state = remap_state_dict(old_state)

    # Load with strict=False to see what's missing
    result = model.load_state_dict(new_state, strict=False)
    if result.missing_keys:
        # Filter out expected missing (pos2D, loss)
        important_missing = [k for k in result.missing_keys
                           if not k.startswith('loss') and 'norm_layers' not in k]
        if important_missing:
            print(f"WARNING: Missing keys after remap: {important_missing[:10]}")
    if result.unexpected_keys:
        print(f"WARNING: Unexpected keys: {result.unexpected_keys[:10]}")

    loaded_count = len(old_state) - len(result.unexpected_keys)
    print(f"Loaded {loaded_count}/{len(old_state)} weights successfully")

    model.eval()
    params = sum(p.numel() for p in model.parameters())
    print(f"Model: {params:,} parameters")

    # ─── Extract Vocabulary ───
    print("Extracting vocabulary...")
    w2i = config.w2i if hasattr(config, 'w2i') else {}
    i2w = config.i2w if hasattr(config, 'i2w') else {}

    vocab_data = {
        "w2i": w2i,
        "i2w": i2w,
        "bos_token_id": w2i.get("<bos>") if isinstance(w2i, dict) else None,
        "eos_token_id": w2i.get("<eos>") if isinstance(w2i, dict) else None,
        "pad_token_id": w2i.get("<pad>", 0) if isinstance(w2i, dict) else 0,
        "vocab_size": len(w2i) if isinstance(w2i, dict) else 0,
    }

    vocab_path = os.path.join(OUTPUT_DIR, "vocab.json")
    with open(vocab_path, "w", encoding="utf-8") as f:
        json.dump(vocab_data, f, ensure_ascii=False)
    print(f"  vocab.json: {vocab_data['vocab_size']} tokens, bos={vocab_data['bos_token_id']}, eos={vocab_data['eos_token_id']}")

    config_out = {
        "d_model": getattr(config, 'd_model', 256),
        "maxlen": getattr(config, 'maxlen', 1512),
        "out_categories": vocab_data["vocab_size"],
        "fixed_height": FIXED_HEIGHT,
        "fixed_width": FIXED_WIDTH,
        "bos_token_id": vocab_data["bos_token_id"],
        "eos_token_id": vocab_data["eos_token_id"],
        "pad_token_id": vocab_data["pad_token_id"],
    }
    config_path = os.path.join(OUTPUT_DIR, "config.json")
    with open(config_path, "w") as f:
        json.dump(config_out, f, indent=2)
    print(f"  config.json saved")

    # ─── Export Encoder ───
    print("Exporting encoder...")
    enc_wrapper = EncoderWrapper(model.encoder, model.pos2D)
    enc_wrapper.eval()

    dummy_img = torch.randn(1, 1, FIXED_HEIGHT, FIXED_WIDTH)
    encoder_path = os.path.join(OUTPUT_DIR, "encoder.onnx")

    with torch.no_grad():
        torch.onnx.export(
            enc_wrapper, (dummy_img,), encoder_path,
            opset_version=OPSET_VERSION,
            input_names=["pixel_values"],
            output_names=["encoder_2d", "encoder_raw"],
            dynamic_axes={
                "pixel_values": {2: "height", 3: "width"},
                "encoder_2d": {1: "seq_len"},
                "encoder_raw": {1: "seq_len"},
            },
        )
    enc_mb = os.path.getsize(encoder_path) / (1024 * 1024)
    print(f"  encoder.onnx: {enc_mb:.1f} MB")

    # ─── Export Decoder ───
    print("Exporting decoder...")
    dec_wrapper = DecoderWrapper(model.decoder)
    dec_wrapper.eval()

    with torch.no_grad():
        enc_2d, enc_raw = enc_wrapper(dummy_img)

    dummy_tokens = torch.zeros(1, 10, dtype=torch.long)
    decoder_path = os.path.join(OUTPUT_DIR, "decoder.onnx")

    with torch.no_grad():
        torch.onnx.export(
            dec_wrapper, (dummy_tokens, enc_2d, enc_raw), decoder_path,
            opset_version=OPSET_VERSION,
            input_names=["token_ids", "encoder_2d", "encoder_raw"],
            output_names=["logits"],
            dynamic_axes={
                "token_ids": {1: "seq_len"},
                "encoder_2d": {1: "feature_len"},
                "encoder_raw": {1: "feature_len"},
                "logits": {1: "seq_len"},
            },
        )
    dec_mb = os.path.getsize(decoder_path) / (1024 * 1024)
    print(f"  decoder.onnx: {dec_mb:.1f} MB")

    # ─── Validate ───
    print("Validating...")
    import onnx
    onnx.checker.check_model(onnx.load(encoder_path))
    print("  encoder: valid ✓")
    onnx.checker.check_model(onnx.load(decoder_path))
    print("  decoder: valid ✓")

    import onnxruntime as ort
    enc_sess = ort.InferenceSession(encoder_path)
    enc_out = enc_sess.run(None, {"pixel_values": dummy_img.numpy()})
    print(f"  encoder output: {[o.shape for o in enc_out]}")

    dec_sess = ort.InferenceSession(decoder_path)
    dec_out = dec_sess.run(None, {
        "token_ids": dummy_tokens.numpy(),
        "encoder_2d": enc_out[0],
        "encoder_raw": enc_out[1],
    })
    print(f"  decoder output: {dec_out[0].shape}")

    total = enc_mb + dec_mb
    print(f"\n{'='*50}")
    print(f"Export complete! Total: {total:.1f} MB")
    print(f"  {OUTPUT_DIR}")
    print(f"{'='*50}")


if __name__ == "__main__":
    main()
