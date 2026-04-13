/**
 * Native module bridge.
 * Originally planned for N-API C++ bindings to CoreML/ONNX Runtime.
 * Replaced with onnxruntime-node (npm) for cross-platform inference
 * without native C++ compilation.
 *
 * Re-exports from the ModelManager which provides:
 * - ONNX model loading via onnxruntime-node
 * - DirectML (Windows GPU) and CPU execution providers
 * - Memory tracking and lifecycle management
 */

export { ModelManager } from '../main/omr/modelManager';
export type { ModelManagerConfig, LoadedModel, ModelLoadOptions } from '../main/omr/modelManager';
