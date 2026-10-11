// Meeting detection on Linux: treat Linux like win32 with linux-mic-listener (windows-mic-listener protocol).
// audio-recorder (dictation + loopback) needs no JS patch: the resolver already returns resources/bin/audio-recorder.
const F = "dist-electron/main.bundle.js";
export default [
  { id: "mic-start-gate", file: F,
    find: `if (!this._running && (process.platform === "darwin" || process.platform === "win32")) {`,
    replace: `if (!this._running && (process.platform === "darwin" || process.platform === "win32" || process.platform === "linux")) {` },
  { id: "mic-event-driven", file: F,
    find: `return process.platform === "win32" && this._tryEventDrivenWin32();`,
    replace: `return (process.platform === "win32" || process.platform === "linux") && this._tryEventDrivenWin32();` },
  { id: "mic-listener-binary", file: F,
    find: `const CG = C5("windows-mic-listener.exe");`,
    replace: `const CG = C5(process.platform === "linux" ? "linux-mic-listener" : "windows-mic-listener.exe");` },
  { id: "mic-pid-to-app", file: F,
    find: `              } else if (process.platform === "win32") {
                const {
                  stdout: Cp
                } = await B("tasklist /FI`,
    replace: `              } else if (process.platform === "linux") {
                const {
                  stdout: Cp
                } = await B("ps -p " + CG + " -o comm=", X);
                const CZ = (Cp || "").trim().toLowerCase();
                if (CZ) {
                  Cx = this._ownProcessInfo().exeNames.has(CZ) ? I : this._matchWin32Exe(CZ + ".exe");
                }
              } else if (process.platform === "win32") {
                const {
                  stdout: Cp
                } = await B("tasklist /FI` },
  { id: "process-detection", file: F,
    find: `          } else if (process.platform === "win32") {
            this._startWin32ProcessDetection();`,
    replace: `          } else if (process.platform === "win32" || process.platform === "linux") {
            this._startWin32ProcessDetection();` },
  { id: "meeting-apps-present", file: F,
    find: `          const CJ = new Set();
          if (process.platform === "win32") {`,
    replace: `          const CJ = new Set();
          if (process.platform === "win32" || process.platform === "linux") {` },
  { id: "process-list-exe-names", file: F,
    find: `const Cx = (await CJ()).map(CF => (CF.name || "").toLowerCase());`,
    replace: `const Cx = (await CJ()).map(CF => (CF.name || "").toLowerCase()).map(n => process.platform === "linux" ? n + ".exe" : n);` },
];
