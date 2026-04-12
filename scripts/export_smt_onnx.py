"""
SMT++ (Sheet Music Transformer) PyTorch → ONNX Export Script.

Downloads the pretrained smt-grandstaff model from HuggingFace,
exports encoder and decoder as separate ONNX files,
and extracts the vocabulary as JSON.

Usage:
    pip install torch torchvision transformers onnx onnxruntime numpy
    python scripts/export_smt_onnx.py

Output:
    models/smt/encoder.onnx
    models/smt/decoder.onnx
    models/smt/vocab.json
    models/smt/config.json
"""

import json
import os
import sys

import numpy as np
import torch
import torch.nn as nn

# ─── Configuration ───

MODEL_ID = "antoniorv6/smt-grandstaff"
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "models", "smt")
OPSET_VERSION = 14
FIXED_HEIGHT = 256  # Fixed input height for encoder
FIXED_WIDTH = 1024  # Fixed input width for encoder


# ─── Encoder Wrapper ───

class EncoderWrapper(nn.Module):
    """Wraps the SMT encoder for clean ONNX export."""

    def __init__(self, model):
        super().__init__()
        self.encoder = model.encoder
        self.positional_2D = model.positional_2D

    def forward(self, pixel_values: torch.Tensor):
        """
        Args:
            pixel_values: (B, 1, H, W) grayscale image tensor
        Returns:
            encoder_2d: (B, H'*W', d_model) - 2D positional encoded features (for key)
            encoder_raw: (B, H'*W', d_model) - raw features (for value)
        """
        # Run ConvNext encoder
        features = self.encoder(pixel_values=pixel_values).last_hidden_state
        # features shape: (B, d_model, H', W')

        # Apply 2D positional encoding
        features_2d = self.positional_2D(features)

        # Flatten spatial dims: (B, d_model, H', W') -> (B, H'*W', d_model)
        B, C, H, W = features.shape
        encoder_raw = features.permute(0, 2, 3, 1).reshape(B, H * W, C)
        encoder_2d = features_2d.permute(0, 2, 3, 1).reshape(B, H * W, C)

        return encoder_2d, encoder_raw


# ─── Decoder Wrapper ───

class DecoderWrapper(nn.Module):
    """Wraps the SMT decoder for clean ONNX export."""

    def __init__(self, model):
        super().__init__()
        self.embedding = model.embedding
        self.positional_1D = model.positional_1D
        self.decoder = model.decoder
        self.out_linear = model.out_linear

        # Disable flash attention for ONNX compatibility
        self._disable_flash_attention()

    def _disable_flash_attention(self):
        """Force manual attention path for ONNX compatibility."""
        for layer in self.decoder.layers:
            if hasattr(layer, 'self_attention'):
                layer.self_attention.has_flash_attn = False
            if hasattr(layer, 'cross_attention'):
                layer.cross_attention.has_flash_attn = False
            # Also check nested attributes
            for name, module in layer.named_modules():
                if hasattr(module, 'has_flash_attn'):
                    module.has_flash_attn = False

    def forward(
        self,
        token_ids: torch.Tensor,
        encoder_2d: torch.Tensor,
        encoder_raw: torch.Tensor,
    ):
        """
        Args:
            token_ids: (B, seq_len) integer token IDs
            encoder_2d: (B, N, d_model) - 2D positional encoded features
            encoder_raw: (B, N, d_model) - raw features
        Returns:
            logits: (B, seq_len, vocab_size)
        """
        B, seq_len = token_ids.shape

        # Token embedding + positional encoding
        embedded = self.embedding(token_ids)  # (B, seq_len, d_model)
        embedded = self.positional_1D(embedded)  # Add 1D positional encoding

        # Create causal mask
        causal_mask = torch.triu(
            torch.ones(seq_len, seq_len, device=token_ids.device, dtype=torch.bool),
            diagonal=1,
        )

        # Create padding mask (all valid for single sequence)
        token_mask = torch.zeros(B, seq_len, device=token_ids.device, dtype=torch.bool)

        # Run decoder layers
        output = embedded
        for layer in self.decoder.layers:
            output = layer(
                output,
                encoder_2d,  # key
                encoder_raw,  # value
                tgt_mask=causal_mask,
                tgt_key_padding_mask=token_mask,
            )

        # Project to vocabulary
        logits = self.out_linear(output)  # (B, seq_len, vocab_size)

        return logits


# ─── Main Export ───

def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    print(f"Loading SMT++ model from {MODEL_ID}...")

    # Import SMT model class
    # Need to install the SMT package or add to path
    try:
        from transformers import AutoConfig, AutoModelForCausalLM
        # Register the custom model
        # Try loading directly - may need custom code
        config = AutoConfig.from_pretrained(MODEL_ID, trust_remote_code=True)
        model = AutoModelForCausalLM.from_pretrained(
            MODEL_ID, trust_remote_code=True, config=config
        )
    except Exception as e:
        print(f"AutoModel failed: {e}")
        print("Trying alternative loading method...")
        try:
            # Clone SMT repo and use its model directly
            _load_smt_from_repo()
            return
        except Exception as e2:
            print(f"Alternative method also failed: {e2}")
            print("\nPlease install SMT package first:")
            print("  git clone https://github.com/antoniorv6/SMT.git /tmp/SMT")
            print("  cd /tmp/SMT && pip install -e .")
            print("  python scripts/export_smt_onnx.py")
            sys.exit(1)

    model.eval()
    print(f"Model loaded: {sum(p.numel() for p in model.parameters()):,} parameters")

    # ─── Extract Vocabulary ───
    print("Extracting vocabulary...")
    vocab_data = {
        "w2i": config.w2i if hasattr(config, 'w2i') else {},
        "i2w": config.i2w if hasattr(config, 'i2w') else {},
        "bos_token_id": None,
        "eos_token_id": None,
        "pad_token_id": 0,
        "vocab_size": config.out_categories if hasattr(config, 'out_categories') else 0,
    }

    # Find special token IDs
    w2i = vocab_data["w2i"]
    if isinstance(w2i, dict):
        vocab_data["bos_token_id"] = w2i.get("<bos>")
        vocab_data["eos_token_id"] = w2i.get("<eos>")
        vocab_data["pad_token_id"] = w2i.get("<pad>", 0)
        vocab_data["vocab_size"] = len(w2i)

    vocab_path = os.path.join(OUTPUT_DIR, "vocab.json")
    with open(vocab_path, "w", encoding="utf-8") as f:
        json.dump(vocab_data, f, ensure_ascii=False, indent=2)
    print(f"  Vocabulary saved: {vocab_path} ({vocab_data['vocab_size']} tokens)")

    # Save config
    config_path = os.path.join(OUTPUT_DIR, "config.json")
    config_dict = {
        "d_model": getattr(config, 'd_model', 256),
        "num_dec_layers": getattr(config, 'num_dec_layers', 8),
        "attn_heads": getattr(config, 'attn_heads', 4),
        "maxlen": getattr(config, 'maxlen', 1512),
        "out_categories": vocab_data["vocab_size"],
        "fixed_height": FIXED_HEIGHT,
        "fixed_width": FIXED_WIDTH,
        "bos_token_id": vocab_data["bos_token_id"],
        "eos_token_id": vocab_data["eos_token_id"],
        "pad_token_id": vocab_data["pad_token_id"],
    }
    with open(config_path, "w") as f:
        json.dump(config_dict, f, indent=2)
    print(f"  Config saved: {config_path}")

    # ─── Export Encoder ───
    print("Exporting encoder to ONNX...")
    encoder_wrapper = EncoderWrapper(model)
    encoder_wrapper.eval()

    dummy_image = torch.randn(1, 1, FIXED_HEIGHT, FIXED_WIDTH)
    encoder_path = os.path.join(OUTPUT_DIR, "encoder.onnx")

    torch.onnx.export(
        encoder_wrapper,
        (dummy_image,),
        encoder_path,
        opset_version=OPSET_VERSION,
        input_names=["pixel_values"],
        output_names=["encoder_2d", "encoder_raw"],
        dynamic_axes={
            "pixel_values": {0: "batch", 2: "height", 3: "width"},
            "encoder_2d": {0: "batch", 1: "seq_len"},
            "encoder_raw": {0: "batch", 1: "seq_len"},
        },
    )
    encoder_size = os.path.getsize(encoder_path) / (1024 * 1024)
    print(f"  Encoder saved: {encoder_path} ({encoder_size:.1f} MB)")

    # ─── Export Decoder ───
    print("Exporting decoder to ONNX...")
    decoder_wrapper = DecoderWrapper(model)
    decoder_wrapper.eval()

    # Run encoder to get feature shapes
    with torch.no_grad():
        enc_2d, enc_raw = encoder_wrapper(dummy_image)

    seq_len = 10  # Initial sequence length for tracing
    dummy_tokens = torch.zeros(1, seq_len, dtype=torch.long)
    decoder_path = os.path.join(OUTPUT_DIR, "decoder.onnx")

    torch.onnx.export(
        decoder_wrapper,
        (dummy_tokens, enc_2d, enc_raw),
        decoder_path,
        opset_version=OPSET_VERSION,
        input_names=["token_ids", "encoder_2d", "encoder_raw"],
        output_names=["logits"],
        dynamic_axes={
            "token_ids": {0: "batch", 1: "seq_len"},
            "encoder_2d": {0: "batch", 1: "feature_len"},
            "encoder_raw": {0: "batch", 1: "feature_len"},
            "logits": {0: "batch", 1: "seq_len"},
        },
    )
    decoder_size = os.path.getsize(decoder_path) / (1024 * 1024)
    print(f"  Decoder saved: {decoder_path} ({decoder_size:.1f} MB)")

    # ─── Validate ───
    print("Validating ONNX models...")
    import onnx
    import onnxruntime as ort

    # Validate encoder
    onnx_model = onnx.load(encoder_path)
    onnx.checker.check_model(onnx_model)
    print("  Encoder ONNX: valid ✓")

    # Validate decoder
    onnx_model = onnx.load(decoder_path)
    onnx.checker.check_model(onnx_model)
    print("  Decoder ONNX: valid ✓")

    # Test inference
    enc_session = ort.InferenceSession(encoder_path)
    enc_result = enc_session.run(None, {"pixel_values": dummy_image.numpy()})
    print(f"  Encoder output shapes: {[r.shape for r in enc_result]}")

    dec_session = ort.InferenceSession(decoder_path)
    dec_result = dec_session.run(None, {
        "token_ids": dummy_tokens.numpy(),
        "encoder_2d": enc_result[0],
        "encoder_raw": enc_result[1],
    })
    print(f"  Decoder output shape: {dec_result[0].shape}")

    # ─── Summary ───
    total_size = encoder_size + decoder_size
    print(f"\n{'='*50}")
    print(f"Export complete!")
    print(f"  Encoder:  {encoder_size:.1f} MB")
    print(f"  Decoder:  {decoder_size:.1f} MB")
    print(f"  Total:    {total_size:.1f} MB")
    print(f"  Vocab:    {vocab_data['vocab_size']} tokens")
    print(f"  Output:   {OUTPUT_DIR}")
    print(f"{'='*50}")


def _load_smt_from_repo():
    """Alternative: clone SMT repo and load model from source."""
    import subprocess
    import tempfile

    smt_dir = os.path.join(tempfile.gettempdir(), "SMT")
    if not os.path.exists(smt_dir):
        print("Cloning SMT repository...")
        subprocess.run(
            ["git", "clone", "--depth", "1", "https://github.com/antoniorv6/SMT.git", smt_dir],
            check=True,
        )

    sys.path.insert(0, smt_dir)

    # Now try loading again
    from transformers import AutoConfig, AutoModelForCausalLM
    config = AutoConfig.from_pretrained(MODEL_ID, trust_remote_code=True)
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_ID, trust_remote_code=True, config=config
    )
    model.eval()

    # Call main export logic (recursive but with model now loaded)
    # Re-run with the model loaded in sys.path
    main()


if __name__ == "__main__":
    main()
