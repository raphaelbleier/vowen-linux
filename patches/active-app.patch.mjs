// Active-app detection, app/browser lists, app icon and key swallowing hook for Linux.
// Helpers: vowen-activewin (this file), vowen-input swallow list (shims/uiohook-napi).
const MAIN = "dist-electron/main.bundle.js";

// Module-scope helpers for module 699470 (active app). Z is the module's require.
const HELPERS = `
      const __vwBin = () => process.env.VOWEN_ACTIVEWIN_BIN || Z(16928).join(process.resourcesPath, "bin", "vowen-activewin");
      let __vwCur = null;
      const __vwRun = (args, ms = 3000) => new Promise((res, rej) => Z(535317).execFile(__vwBin(), args, {
        timeout: ms,
        maxBuffer: 1 << 25
      }, (e, out) => {
        if (e) { rej(e); return; }
        try { res(JSON.parse(out)); } catch (x) { rej(x); }
      }));
      function __vwWatch(cb) {
        let child = null, stopped = false, tries = 0;
        const start = () => {
          let buf = "";
          try {
            child = Z(535317).spawn(__vwBin(), ["--watch", "--parent-stdin"], { stdio: ["pipe", "pipe", "inherit"] });
          } catch (e) {
            console.error("[AppWatcher] vowen-activewin spawn failed:", e.message);
            return;
          }
          child.on("error", e => console.error("[AppWatcher] vowen-activewin:", e.message));
          child.stdin.on("error", () => {});
          child.stdout.setEncoding("utf8");
          child.stdout.on("data", d => {
            buf += d;
            let i;
            while ((i = buf.indexOf("\\n")) >= 0) {
              const line = buf.slice(0, i);
              buf = buf.slice(i + 1);
              try {
                const r = JSON.parse(line);
                __vwCur = r;
                if (r.bundleId || r.appName) { tries = 0; cb(r); }
              } catch (e) {}
            }
          });
          child.on("exit", code => {
            child = null;
            __vwCur = null;
            if (stopped || code === 0 || code === 4 || ++tries > 5) return;
            setTimeout(() => { if (!stopped) start(); }, 2000);
          });
        };
        start();
        return () => {
          stopped = true;
          __vwCur = null;
          if (child) { try { child.stdin.end(); child.kill("SIGTERM"); } catch (e) {} }
        };
      }
`;

export default [
  { id: "active-app-own-ids-helpers", file: MAIN,
    find: `const z = new Set(["com.vowen.app", "com.github.electron"]);`,
    replace: `const z = new Set(["com.vowen.app", "com.github.electron", "vowen", "electron"]);` + HELPERS },
  { id: "active-app-get", file: MAIN,
    find: `          } else {
            return {
              appName: "",
              windowTitle: "",
              appPath: ""
            };
          }
        } catch (O) {
          console.error("Failed to detect active app:", O.message);`,
    replace: `          } else if (Y === "linux") {
            return __vwCur || await __vwRun(["--get"]);
          } else {
            return {
              appName: "",
              windowTitle: "",
              appPath: ""
            };
          }
        } catch (O) {
          console.error("Failed to detect active app:", O.message);` },
  { id: "active-app-export-helper", file: MAIN,
    find: `        getActiveApp: h,
        isOwnApp: function (Y) {`,
    replace: `        getActiveApp: h,
        linuxHelper: __vwRun,
        isOwnApp: function (Y) {` },
  { id: "active-app-watcher", file: MAIN,
    find: `            }(Y);
          } else {
            return () => {};
          }
        }
      };`,
    replace: `            }(Y);
          } else if (process.platform === "linux") {
            return __vwWatch(Y);
          } else {
            return () => {};
          }
        }
      };` },
  { id: "active-app-watcher-guard", file: MAIN,
    find: `        _initActiveAppWatcher() {
          if (process.platform !== "darwin" && process.platform !== "win32") {`,
    replace: `        _initActiveAppWatcher() {
          if (process.platform !== "darwin" && process.platform !== "win32" && process.platform !== "linux") {` },
  { id: "system-apps-linux", file: MAIN,
    find: `process.platform === "darwin" ? await this._getSystemApplicationsDarwin() : [];`,
    replace: `process.platform === "darwin" ? await this._getSystemApplicationsDarwin() : process.platform === "linux" ? await C2(699470).linuxHelper(["--list-apps"], 60000) : [];` },
  { id: "browsers-linux-list", file: MAIN,
    find: `                if (process.platform !== "win32") {
                  return [];
                }`,
    replace: `                if (process.platform === "linux") {
                  const lb = await L(699470).linuxHelper(["--list-browsers"], 60000);
                  V = lb;
                  b = Date.now();
                  return lb;
                }
                if (process.platform !== "win32") {
                  return [];
                }` },
  { id: "browsers-linux-profiles", file: MAIN,
    find: `      async function S(I) {
        const R = E.get(I);`,
    replace: `      async function S(I) {
        if (process.platform === "linux") {
          try { return await L(699470).linuxHelper(["--list-profiles", String(I)], 10000); } catch (e) { return []; }
        }
        const R = E.get(I);` },
  { id: "browsers-linux-launch", file: MAIN,
    find: `} else if (process.platform === "win32" && k.path) {`,
    replace: `} else if ((process.platform === "win32" || process.platform === "linux") && k.path) {` },
  { id: "app-icon-linux", file: MAIN,
    find: `          if (z.platform() !== "darwin") {
            if (Q?.dataURL) {
              return Q.dataURL;
            }`,
    replace: `          if (z.platform() === "linux") {
            if (Q?.dataURL) {
              return Q.dataURL;
            }
            const u = await L(699470).linuxHelper(["--icon", I?.bundleId || ""], 10000).catch(() => null);
            if (u && u.icon) {
              E.set(R, { appPath: K, dataURL: u.icon, lastUsed: Date.now() });
              X();
              return u.icon;
            }
            return null;
          }
          if (z.platform() !== "darwin") {
            if (Q?.dataURL) {
              return Q.dataURL;
            }` },

  // Key swallowing (opt-in on the helper side, VOWEN_SWALLOW=1): tell the uiohook shim which accelerators the app
  // already registers as "suppression" globalShortcuts so vowen-input can hide them from the focused app.
  { id: "swallow-sync-clear-when-suppressed", file: MAIN,
    find: `          this._releaseSuppressionShortcuts();
          if (this._appSuppressed) {
            return;
          }`,
    replace: `          this._releaseSuppressionShortcuts();
          if (this._appSuppressed) {
            globalThis.__vowenSetSwallow?.("hotkeys", []);
            return;
          }` },
  { id: "swallow-sync-set", file: MAIN,
    find: `          g.size;
        }
        _releaseSuppressionShortcuts() {`,
    replace: `          globalThis.__vowenSetSwallow?.("hotkeys", X.map(S => this._hotkeyToAccelerator(S)).filter(Boolean));
          g.size;
        }
        _releaseSuppressionShortcuts() {` },
  { id: "swallow-escape-on", file: MAIN,
    find: `          try {
            this._dictationEscapeRegistered = aE.register("Escape", () => {`,
    replace: `          globalThis.__vowenSetSwallow?.("escape", ["Escape"]);
          try {
            this._dictationEscapeRegistered = aE.register("Escape", () => {` },
  { id: "swallow-escape-off", file: MAIN,
    find: `                  C2(91288).globalShortcut.unregister("Escape");`,
    replace: `                  C2(91288).globalShortcut.unregister("Escape");
                  globalThis.__vowenSetSwallow?.("escape", []);` },
];
