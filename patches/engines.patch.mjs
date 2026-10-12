// Local engines on Linux: Parakeet v2/v3 (ONNX, same path as Windows), local diarization.
// Whisper needs no patch (resolver + LD_LIBRARY_PATH already handle Linux). The whisper-server
// flags are left alone: -nfa / beam 5 only exist for the Windows CUDA exe, and flash-attn is fine on sm_75+.
const MAIN = 'dist-electron/main.bundle.js';
const SETTINGS = 'dist-react/settings.js';
const WL = '(process.platform === "win32" || process.platform === "linux")';
const swap = (id, file, find, replace, count = 1) => ({ id, file, find, replace, count });

export default [
  // --- catalog: show Parakeet v3 / v2 on Linux
  swap('parakeet-v3-platforms', MAIN,
    `parakeetVariant: "v3",\n          platforms: ["darwin", "win32"],`,
    `parakeetVariant: "v3",\n          platforms: ["darwin", "win32", "linux"],`),
  swap('parakeet-v2-platforms', MAIN,
    `parakeetVariant: "v2",\n          platforms: ["darwin", "win32"],`,
    `parakeetVariant: "v2",\n          platforms: ["darwin", "win32", "linux"],`),

  // --- model storage / download / delete: use the ONNX archives instead of CoreML
  swap('parakeet-getModelPath', MAIN,
    `const g = b();\n            if (process.platform === "win32" && k.onnx) {`,
    `const g = b();\n            if (${WL} && k.onnx) {`),
  swap('parakeet-getInstalledModels', MAIN,
    `if (g.engine === "parakeet") {\n              if (process.platform === "win32" && g.onnx) {`,
    `if (g.engine === "parakeet") {\n              if (${WL} && g.onnx) {`),
  swap('parakeet-downloadModel', MAIN,
    `if (process.platform === "win32") {\n              return await this._downloadParakeetOnnxModel(T, X, k);`,
    `if (${WL}) {\n              return await this._downloadParakeetOnnxModel(T, X, k);`),
  swap('parakeet-deleteModel', MAIN,
    `let g;\n          if (process.platform === "win32" && k.onnx) {`,
    `let g;\n          if (${WL} && k.onnx) {`),

  // --- transcription through parakeet-cli
  swap('parakeet-transcribe-route', MAIN,
    `if (aG.engine === "parakeet") {\n              if (process.platform === "win32") {`,
    `if (aG.engine === "parakeet") {\n              if (${WL}) {`),
  swap('parakeet-onnx-env', MAIN,
    `_buildParakeetOnnxEnv() {
          const aa = {
            ...process.env,
            PATH: this.binaryPaths.libPath + ";" + (process.env.PATH || "")
          };
          const at = Ca.join(this.binaryPaths.libPath, "onnxruntime.dll");`,
    `_buildParakeetOnnxEnv() {
          const aa = process.platform === "linux" ? {
            ...process.env,
            LD_LIBRARY_PATH: this.binaryPaths.libPath + ":" + (process.env.LD_LIBRARY_PATH || "")
          } : {
            ...process.env,
            PATH: this.binaryPaths.libPath + ";" + (process.env.PATH || "")
          };
          const at = Ca.join(this.binaryPaths.libPath, process.platform === "linux" ? "libonnxruntime.so" : "onnxruntime.dll");`),

  // --- manual/segment mode: always use the (GPU-capable) whisper-server instead of per-call whisper-cli
  swap('manual-mode-server', MAIN,
    `if (process.platform === "win32" && !aJ.resourceEfficientMode) {\n                if (C2(628236).isDownloaded()) {`,
    `if (${WL} && !aJ.resourceEfficientMode) {\n                if (process.platform === "linux" || C2(628236).isDownloaded()) {`),

  // --- local diarization (diarize-cli daemon, same as Windows)
  swap('diarize-supported', MAIN,
    `_localDiarizeSupported() {\n          return process.platform === "darwin" || process.platform === "win32";`,
    `_localDiarizeSupported() {\n          return process.platform === "darwin" || ${WL};`),
  swap('diarize-backend', MAIN,
    `if (process.platform === "win32") {\n            const at = typeof global.ensureWindowsDiarizer == "function"`,
    `if (${WL}) {\n            const at = typeof global.ensureWindowsDiarizer == "function"`),
  swap('diarize-ensure', MAIN,
    `global.ensureWindowsDiarizer = async function () {\n        if (process.platform !== "win32") {`,
    `global.ensureWindowsDiarizer = async function () {\n        if (process.platform !== "win32" && process.platform !== "linux") {`),
  swap('diarize-prewarm', MAIN,
    `const aO = process.platform === "win32" ? global.ensureWindowsDiarizer`,
    `const aO = ${WL} ? global.ensureWindowsDiarizer`),

  // --- model lists that gate the diarization / local-model UI (main + renderer)
  swap('diarize-capable-main', MAIN,
    `...(process.platform === "darwin" || process.platform === "win32" ? ["parakeet-tdt-0.6b", "parakeet-tdt-0.6b-v2", "whisper-large-v3-turbo-groq"`,
    `...(process.platform === "darwin" || ${WL} ? ["parakeet-tdt-0.6b", "parakeet-tdt-0.6b-v2", "whisper-large-v3-turbo-groq"`),
  swap('diarize-capable-renderer', SETTINGS,
    `...(process.platform === "darwin" || process.platform === "win32" ? ["parakeet-tdt-0.6b", "parakeet-tdt-0.6b-v2", "tiny"`,
    `...(process.platform === "darwin" || ${WL} ? ["parakeet-tdt-0.6b", "parakeet-tdt-0.6b-v2", "tiny"`, 5),
  swap('parakeet-onnx-size', SETTINGS,
    `= process?.platform === "win32" && gG.onnx?.size`,
    `= (process?.platform === "win32" || process?.platform === "linux") && gG.onnx?.size`, 2),
];
