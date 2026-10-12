// macOS-only local models on Linux: Parakeet Japanese (parakeet-cli) and Nemotron EN / Multilingual (sherpa-asr-cli).
// Weights come from public HuggingFace repos (multi-file download, sha256-checked), not Vowen servers.
// Parakeet Mandarin (CoreML only, no ONNX export exists) stays darwin-only, so it is hidden on Linux.
// Applied after engines.patch.mjs (alphabetical), so `find` strings that overlap it use the patched text.
const MAIN = 'dist-electron/main.bundle.js';
const swap = (id, find, replace, count = 1) => ({ id, file: MAIN, find, replace, count });
const hf = (repo, files) => files.map(([name, size, sha256, remote = name]) => ({ name, url: `https://huggingface.co/${repo}/resolve/main/${remote}`, size, sha256 }));
const onnx = (filename, files) => JSON.stringify({ filename, size: files.reduce((a, f) => a + f.size, 0), files });

const JA = onnx('parakeet-tdt-0.6b-ja-int8', hf('visuall/parakeet-tdt_ctc-0.6b-ja-onnx', [
  ['encoder-model.int8.onnx', 652467248, '3c9f3f8840b105fad60ac743e50a2bbe01e467205ea0978f3a3407b2b18148b2'],
  ['decoder_joint-model.int8.onnx', 11627915, '1de334dbbf66233309e18b6242b5dbc34005851f282cd89e36597c3cb8564498'],
  // transcribe-rs hard-codes the preprocessor name; JA needs the 80-mel one
  ['nemo128.onnx', 90418, '3c6ce9142e22d7ba22a627ae9f20bd706cff7140af25c1410f88994324aec09e', 'nemo80.onnx'],
  ['vocab.txt', 28557, '732f64c53909f2620c713f4106b487d92e6f54a6915b3cd3d1dbd32f9f4f392a']]));
const EN = onnx('nemotron-streaming-en-int8', hf('csukuangfj2/sherpa-onnx-nemotron-speech-streaming-en-0.6b-1120ms-int8-2026-04-25', [
  ['encoder.int8.onnx', 652916852, '7d2246da3c077e8b57698d398e09d8ca67f50de73b3468af397b22213ce72117'],
  ['decoder.int8.onnx', 7257753, '0be9702c2f427a2b6bb241d298e0d3836a558de1f5b9fd3018f1cce6e2b3fa98'],
  ['joiner.int8.onnx', 1735862, 'a35eac38a22ebceb04d230ed7afe0d68f446ba6914a036b97f14fece95967e23'],
  ['tokens.txt', 8952, 'dc0b4584ab2e4ddbf888425c076c61b736e7356a015250db7d307e6f1a8188ff']]));
const MULTI = onnx('nemotron-streaming-multilingual-int8', hf('csukuangfj2/sherpa-onnx-nemotron-3.5-asr-streaming-0.6b-1120ms-int8-2026-06-11', [
  ['encoder.int8.onnx', 657601521, '2fff2166acaa535bd969fb223c1f0783d71029f143cb298bc54c2afe85abf772'],
  ['decoder.int8.onnx', 14978075, '19f9c98fc6d0a2c33a65a43b36fdb2e914c26c0aa9764be3aebc502a1e982fb0'],
  ['joiner.int8.onnx', 9504438, '4101c7c679a0bc30483794b27a059e34e79232aa2068d78d51231a22c8b0d7ce'],
  ['tokens.txt', 131440, '729cc103155bafa785f9cd45746cd41cabe97eab7182fc04d594129587958f8a']]));

// Downloads every entry of onnx.files into <dir>.partial, then renames. Same activeDownloads/cancel contract as the tarball path.
const DOWNLOAD_FILES = `async _downloadOnnxFiles(T, g, X) {
          if (this.activeDownloads.has(T)) {
            return;
          }
          const S = b();
          M.mkdirSync(S, { recursive: true });
          const I = D.join(S, g.filename);
          const R = I + ".partial";
          const st = { cancelled: false, request: null, response: null, writeStream: null, destDir: I };
          this.activeDownloads.set(T, st);
          let done = 0;
          try {
            M.rmSync(R, { recursive: true, force: true });
            M.mkdirSync(R, { recursive: true });
            for (const f of g.files) {
              const dest = D.join(R, f.name);
              await new Promise((v, N) => {
                const go = (u, n = 0) => {
                  if (n > 8) {
                    return N(new Error("Too many redirects"));
                  }
                  const rq = z.get(u, r => {
                    if ([301, 302, 303, 307, 308].includes(r.statusCode) && r.headers.location) {
                      r.resume();
                      return go(new URL(r.headers.location, u).href, n + 1);
                    }
                    if (r.statusCode !== 200) {
                      r.resume();
                      return N(new Error("HTTP " + r.statusCode + " downloading " + f.name));
                    }
                    const ws = M.createWriteStream(dest);
                    st.request = rq;
                    st.response = r;
                    st.writeStream = ws;
                    r.on("data", c => {
                      done += c.length;
                      X && X({ model: T, downloaded: done, total: g.size, percentage: Math.floor(done / g.size * 100).toString(), downloadedMB: (done / 1024 / 1024).toFixed(1), totalMB: (g.size / 1024 / 1024).toFixed(1) });
                    });
                    r.on("close", () => st.cancelled && N(new Error("Download cancelled")));
                    r.on("error", N);
                    ws.on("error", N);
                    ws.on("finish", v);
                    r.pipe(ws);
                  });
                  w(rq);
                  rq.on("error", N);
                };
                go(f.url);
              });
              if (st.cancelled) {
                throw new Error("Download cancelled");
              }
              if (f.sha256) {
                const h = L(776982).createHash("sha256");
                await H(M.createReadStream(dest), h);
                const got = h.digest("hex");
                if (got !== f.sha256) {
                  throw new Error("SHA-256 mismatch for " + f.name + ".\\nExpected: " + f.sha256 + "\\nGot:      " + got);
                }
              }
            }
            M.rmSync(I, { recursive: true, force: true });
            M.renameSync(R, I);
            return I;
          } catch (e) {
            M.rmSync(R, { recursive: true, force: true });
            throw e;
          } finally {
            this.activeDownloads.delete(T);
          }
        }
        async _downloadParakeetOnnxModel(T, k, X) {
          if (k.onnx && k.onnx.files) {
            return this._downloadOnnxFiles(T, k.onnx, X);
          }`;

export default [
  // --- catalog: the three ONNX-capable models (Mandarin stays darwin-only)
  swap('maconly-cat-ja', `parakeetVariant: "ja",\n          platforms: ["darwin"],`,
    `parakeetVariant: "ja",\n          platforms: ["darwin", "linux"],\n          onnx: ${JA},`),
  swap('maconly-cat-nemotron-en', `nemotronVariant: "en",\n          platforms: ["darwin"],`,
    `nemotronVariant: "en",\n          platforms: ["darwin", "linux"],\n          onnx: ${EN},`),
  swap('maconly-cat-nemotron-multi', `nemotronVariant: "multilingual",\n          platforms: ["darwin"],`,
    `nemotronVariant: "multilingual",\n          platforms: ["darwin", "linux"],\n          onnx: ${MULTI},`),

  // --- storage / install detection / download / delete for Nemotron
  // model path and delete: same shape, two sites
  swap('maconly-nemotron-filename', `if (k.engine === "nemotron") {\n            const C1 = k.coreml && k.coreml.filename || k.filename;`,
    `if (k.engine === "nemotron") {\n            const C1 = process.platform === "linux" && k.onnx ? k.onnx.filename : k.coreml && k.coreml.filename || k.filename;`, 2),
  swap('maconly-nemotron-installed',
    `if (M.existsSync(D.join(C3, "metadata.json")) && M.existsSync(D.join(C3, "tokenizer.json"))) {`,
    `if (M.existsSync(D.join(C3, "metadata.json")) && M.existsSync(D.join(C3, "tokenizer.json")) || process.platform === "linux" && M.existsSync(D.join(C3, "tokens.txt"))) {`),
  swap('maconly-nemotron-download',
    `return await this._downloadNemotronModel(T, X, k);`,
    `return process.platform === "linux" && X.onnx ? await this._downloadParakeetOnnxModel(T, X, k) : await this._downloadNemotronModel(T, X, k);`),

  // --- multi-file HuggingFace downloader (entries with onnx.files)
  swap('maconly-download-files', `async _downloadParakeetOnnxModel(T, k, X) {`, DOWNLOAD_FILES),

  // --- sherpa-asr-cli binary path
  // packaged and dev paths: same shape, two sites
  swap('maconly-binary-path', `diarizeCli: M.join(V, "bin", "diarize-cli" + E),`,
    `diarizeCli: M.join(V, "bin", "diarize-cli" + E),\n              sherpaAsrCli: M.join(V, "bin", "sherpa-asr-cli" + E),`, 2),

  // --- transcription: Nemotron goes through the one-shot path with sherpa-asr-cli
  swap('maconly-nemotron-route',
    `if (process.platform !== "darwin") {\n                throw new Error("Nemotron is only available on macOS.");\n              }`,
    `if (process.platform === "linux") {
                if (aP && aP.diarize) {
                  throw new Error("Speaker diarization is not supported by Nemotron.");
                }
                if (!aL || !CC.existsSync(aL)) {
                  throw new Error("Nemotron model not found. Please download it from Settings > Models.");
                }
                return await this._transcribeWithParakeetOnnxOneShot(aa, aL, ax, aF, false, {
                  cli: this.binaryPaths.sherpaAsrCli,
                  language: aG.nemotronVariant === "multilingual" ? C2(900375).nemotronLanguageTag(aJ.language) : null
                });
              }
              if (process.platform !== "darwin") {
                throw new Error("Nemotron is only available on macOS.");
              }`),
  swap('maconly-oneshot-sig', `async _transcribeWithParakeetOnnxOneShot(aa, at, aG, aJ, ax = false) {`,
    `async _transcribeWithParakeetOnnxOneShot(aa, at, aG, aJ, ax = false, cliOpts = {}) {\n          const cliPath = cliOpts.cli || this.binaryPaths.parakeetCli;`),
  swap('maconly-oneshot-check',
    `if (!this.binaryPaths.parakeetCli || !CC.existsSync(this.binaryPaths.parakeetCli)) {\n              throw new Error("parakeet-cli binary not found. Please rebuild the app.");`,
    `if (!cliPath || !CC.existsSync(cliPath)) {\n              throw new Error("ASR engine binary not found. Please reinstall the engines.");`),
  swap('maconly-oneshot-args', `const aZ = [at, aA];\n            if (aP) {\n              aZ.push("--timestamps");\n            }`,
    `const aZ = [at, aA];\n            if (aP) {\n              aZ.push("--timestamps");\n            }\n            if (cliOpts.language) {\n              aZ.push("--language", cliOpts.language);\n            }`),
  swap('maconly-oneshot-spawn', `const az = Cx(this.binaryPaths.parakeetCli, aZ, {`, `const az = Cx(cliPath, aZ, {`),
];
