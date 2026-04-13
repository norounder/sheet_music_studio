"""
Optimize SMT++ ONNX models: INT8 quantization + graph optimization.

Usage:
    pip install onnxruntime onnx
    python scripts/optimize_smt_onnx.py

Output:
    models/smt/encoder_opt.onnx
    models/smt/decoder_opt.onnx
"""

import os
import time

import numpy as np
import onnxruntime as ort
from onnxruntime.quantization import quantize_dynamic, QuantType

MODEL_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "models", "smt")


def optimize_model(input_path: str, output_path: str, name: str):
    """Apply INT8 dynamic quantization to an ONNX model."""
    print(f"Quantizing {name}...")

    input_size = os.path.getsize(input_path)
    # Also include .data file if exists
    data_path = input_path + ".data"
    if os.path.exists(data_path):
        input_size += os.path.getsize(data_path)

    quantize_dynamic(
        model_input=input_path,
        model_output=output_path,
        weight_type=QuantType.QInt8,
    )

    output_size = os.path.getsize(output_path)
    data_out = output_path + ".data"
    if os.path.exists(data_out):
        output_size += os.path.getsize(data_out)

    ratio = input_size / output_size if output_size > 0 else 0
    print(f"  {input_size / 1024 / 1024:.1f} MB → {output_size / 1024 / 1024:.1f} MB ({ratio:.1f}x reduction)")


def benchmark(encoder_path: str, decoder_path: str, label: str):
    """Benchmark encoder + decoder inference speed."""
    print(f"\nBenchmark [{label}]:")

    providers = ort.get_available_providers()
    use_providers = []
    if 'DmlExecutionProvider' in providers:
        use_providers.append('DmlExecutionProvider')
    use_providers.append('CPUExecutionProvider')

    sess_opts = ort.SessionOptions()
    sess_opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

    enc_sess = ort.InferenceSession(encoder_path, sess_options=sess_opts, providers=use_providers)
    dec_sess = ort.InferenceSession(decoder_path, sess_options=sess_opts, providers=use_providers)

    print(f"  Providers: {enc_sess.get_providers()}")

    # Encoder
    img = np.random.randn(1, 1, 256, 1024).astype(np.float32)
    # Warmup
    enc_out = enc_sess.run(None, {"pixel_values": img})

    t0 = time.time()
    for _ in range(3):
        enc_out = enc_sess.run(None, {"pixel_values": img})
    enc_time = (time.time() - t0) / 3
    print(f"  Encoder: {enc_time * 1000:.0f}ms")

    # Decoder
    tokens = np.zeros((1, 5), dtype=np.int64)
    feeds = {"token_ids": tokens, "encoder_2d": enc_out[0], "encoder_raw": enc_out[1]}
    # Warmup
    dec_sess.run(None, feeds)

    t0 = time.time()
    for _ in range(20):
        dec_sess.run(None, feeds)
    dec_time = (time.time() - t0) / 20
    print(f"  Decoder/step: {dec_time * 1000:.0f}ms")
    print(f"  Est. 200 tokens: {dec_time * 200:.1f}s")
    print(f"  Est. 500 tokens: {dec_time * 500:.1f}s")

    return enc_time, dec_time


def main():
    encoder_in = os.path.join(MODEL_DIR, "encoder.onnx")
    decoder_in = os.path.join(MODEL_DIR, "decoder.onnx")
    encoder_out = os.path.join(MODEL_DIR, "encoder_opt.onnx")
    decoder_out = os.path.join(MODEL_DIR, "decoder_opt.onnx")

    if not os.path.exists(encoder_in) or not os.path.exists(decoder_in):
        print("Error: Run export_smt_onnx.py first to generate encoder.onnx and decoder.onnx")
        return

    # Benchmark original
    enc_orig, dec_orig = benchmark(encoder_in, decoder_in, "Original FP32")

    # Quantize
    optimize_model(encoder_in, encoder_out, "encoder")
    optimize_model(decoder_in, decoder_out, "decoder")

    # Benchmark optimized
    enc_opt, dec_opt = benchmark(encoder_out, decoder_out, "Optimized INT8")

    # Summary
    enc_speedup = enc_orig / enc_opt if enc_opt > 0 else 0
    dec_speedup = dec_orig / dec_opt if dec_opt > 0 else 0
    print(f"\n{'=' * 50}")
    print(f"Optimization Results:")
    print(f"  Encoder speedup: {enc_speedup:.1f}x")
    print(f"  Decoder speedup: {dec_speedup:.1f}x")
    print(f"{'=' * 50}")


if __name__ == "__main__":
    main()
