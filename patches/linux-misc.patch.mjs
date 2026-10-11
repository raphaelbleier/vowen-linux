// Linux fill-ins for platform-gated features: screenshots, file-manager selection, reveal/open folder,
// meeting-app names, cloud-sync folders, cold-start deep links, lock/suspend, and mac-only UI.
// Helper code lives in runtime/ (installed as <app>/linux/); the bundle reaches it via require("../linux/...").
const MAIN = "dist-electron/main.bundle.js";
const SETTINGS = "dist-react/settings.js";
const U = `require("../linux/linux-util.js")`;

export default [
  // --- G-SHOT: bootstrap.js serves desktopCapturer "screen" sources from the vowen-screenshot helper ---
  { id: "shot-region-supported", file: MAIN,
    find: `function H() {
        return process.platform === "darwin" || process.platform === "win32";
      }
      p.exports = {
        captureRegion:`,
    replace: `function H() {
        return process.platform === "darwin" || process.platform === "win32" || process.platform === "linux";
      }
      p.exports = {
        captureRegion:` },
  { id: "shot-region-desktopcapturer", file: MAIN,
    find: `if (process.platform === "win32") {
            return async function (m, B) {`,
    replace: `if (process.platform === "win32" || process.platform === "linux") {
            return async function (m, B) {` },
  { id: "shot-meeting-supported", file: MAIN,
    find: `isSupported() {
          return process.platform === "darwin" || process.platform === "win32";
        }
        _baseDir() {`,
    replace: `isSupported() {
          return process.platform === "darwin" || process.platform === "win32" || process.platform === "linux";
        }
        _baseDir() {` },
  { id: "shot-click-capture-setting", file: SETTINGS,
    find: `const eP = process.platform === "darwin" || process.platform === "win32";
  const eQ = process.platform === "darwin" ? "Cmd" : "Ctrl";`,
    replace: `const eP = process.platform === "darwin" || process.platform === "win32" || process.platform === "linux";
  const eQ = process.platform === "darwin" ? "Cmd" : "Ctrl";` },

  // --- G-FILES: Ctrl+C in the file manager, read text/uri-list ---
  { id: "selected-files-linux", file: MAIN,
    find: `} else if (C8 === "win32") {
            return C3();
          } else {`,
    replace: `} else if (C8 === "win32") {
            return C3();
          } else if (C8 === "linux") {
            const CG = L(263969);
            CG._suppressKeyEvents = true;
            try {
              return await require("../linux/selected-files.js")();
            } finally {
              CG._suppressKeyEvents = false;
            }
          } else {` },

  // --- G-REVEAL / open folder ---
  { id: "reveal-in-file-manager", file: MAIN,
    find: `await Y("open", ["-R", N]);`,
    replace: `await (process.platform === "linux" ? ${U}.reveal(N) : Y("open", ["-R", N]));` },
  { id: "voice-open-folder-xdg", file: MAIN,
    find: `let am = ab[aH];`,
    replace: `if (process.platform === "linux") Object.assign(ab, ${U}.xdgDirs());
              let am = ab[aH];` },

  // --- G-MEET: process names (comm + ".exe", see audio.patch) ---
  { id: "meeting-teams-proc", file: MAIN,
    find: `proc: CC => CC === "ms-teams_modulehost.exe" || CC === "ms-teams.exe" || CC === "teams.exe",`,
    replace: `proc: CC => CC === "ms-teams_modulehost.exe" || CC === "ms-teams.exe" || CC === "teams.exe" || CC === "teams-for-linux.exe",` },
  { id: "meeting-teams-exes", file: MAIN,
    find: `exes: ["ms-teams.exe", "teams.exe", "ms-teams_modulehost.exe"]`,
    replace: `exes: ["ms-teams.exe", "teams.exe", "ms-teams_modulehost.exe", "teams-for-linux.exe"]` },
  { id: "meeting-webex-proc", file: MAIN,
    find: `proc: CC => CC === "webexmeetingsapp.exe" || CC === "webex.exe",`,
    replace: `proc: CC => CC === "webexmeetingsapp.exe" || CC === "webex.exe" || CC === "ciscocollabhost.exe",` },
  { id: "meeting-webex-exes", file: MAIN,
    find: `exes: ["webex.exe", "webexmeetingsapp.exe"]`,
    replace: `exes: ["webex.exe", "webexmeetingsapp.exe", "ciscocollabhost.exe"]` },
  { id: "meeting-discord-exes", file: MAIN,
    find: `exes: ["discord.exe", "discordptb.exe", "discordcanary.exe"]`,
    replace: `exes: ["discord.exe", "discordptb.exe", "discordcanary.exe", "vesktop.exe", "webcord.exe", "legcord.exe"]` },
  { id: "meeting-browser-exes", file: MAIN,
    find: `exes: ["chrome.exe", "msedge.exe", "brave.exe", "firefox.exe", "opera.exe", "vivaldi.exe", "arc.exe"]`,
    replace: `exes: ["chrome.exe", "msedge.exe", "brave.exe", "firefox.exe", "opera.exe", "vivaldi.exe", "arc.exe", "chromium.exe", "chromium-browser.exe", "google-chrome.exe", "brave-browser.exe", "firefox-bin.exe", "firefox-esr.exe", "vivaldi-bin.exe", "librewolf.exe", "zen.exe", "floorp.exe", "waterfox.exe", "microsoft-edge.exe"]` },

  // --- G-SYNC ---
  { id: "sync-gdrive-linux", file: MAIN,
    find: `} else if (process.platform === "win32") {
          const V = [q.join(M.homedir(), "Google Drive"), q.join(M.homedir(), "My Drive")];`,
    replace: `} else if (process.platform === "linux") {
          return require("../linux/sync-paths.js").gdrive();
        } else if (process.platform === "win32") {
          const V = [q.join(M.homedir(), "Google Drive"), q.join(M.homedir(), "My Drive")];` },
  { id: "sync-onedrive-linux", file: MAIN,
    find: `} else if (process.platform === "win32") {
          b(process.env.OneDriveConsumer, "Personal");`,
    replace: `} else if (process.platform === "linux") {
          for (const c of require("../linux/sync-paths.js").onedrive()) {
            b(c);
          }
        } else if (process.platform === "win32") {
          b(process.env.OneDriveConsumer, "Personal");` },
  { id: "sync-dropbox-linux", file: MAIN,
    find: `} else if (process.platform === "win32") {
          const H = q.join(M.homedir(), "AppData/Local/Dropbox/info.json");`,
    replace: `} else if (process.platform === "linux") {
          return require("../linux/sync-paths.js").dropbox();
        } else if (process.platform === "win32") {
          const H = q.join(M.homedir(), "AppData/Local/Dropbox/info.json");` },

  // --- G-DEEP: cold-start vowen:// links and audio/video files from argv (macOS gets open-url/open-file events) ---
  { id: "cold-start-argv", file: MAIN,
    find: `(function () {
            Cl = true;
            if (CQ.length === 0) {`,
    replace: `(function () {
            Cl = true;
            if (process.platform === "linux") {
              CQ.push(...process.argv.slice(1).filter(az => CW.test(az)));
              const coldLink = process.argv.find(az => az.startsWith("vowen://"));
              if (coldLink) {
                Cb.handleDeepLink(coldLink);
              }
            }
            if (CQ.length === 0) {` },

  // --- lock / suspend (bootstrap.js emits lock-screen / unlock-screen from the ScreenSaver D-Bus signal) ---
  { id: "stop-recording-on-lock", file: MAIN,
    find: `action: process.platform === "darwin" ? () => CY.stopRecordingOnSleep("lock-screen") : null`,
    replace: `action: process.platform === "darwin" || process.platform === "linux" ? () => CY.stopRecordingOnSleep("lock-screen") : null` },
  { id: "stop-recording-on-suspend", file: MAIN,
    find: `action: process.platform === "darwin" ? () => CY.stopRecordingOnSleep("suspend") : null`,
    replace: `action: process.platform === "darwin" || process.platform === "linux" ? () => CY.stopRecordingOnSleep("suspend") : null` },

  // --- hide mac-only UI ---
  { id: "ui-hide-notch-style", file: SETTINGS,
    find: `label: "Notch"
            }].map(({`,
    replace: `label: "Notch"
            }].filter(f => f.value !== "notch" || process.platform === "darwin").map(({` },
  { id: "ui-hide-update-row", file: SETTINGS,
    find: `"data-search-keywords": "update updates version upgrade check new release",`,
    replace: `style: process.platform === "linux" ? { display: "none" } : undefined,
          "data-search-keywords": "update updates version upgrade check new release",` },
];
