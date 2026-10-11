// Lifecycle fixes: updater, autostart, tray, media pause.
const MAIN = 'dist-electron/main.bundle.js';
const SETTINGS = 'dist-react/settings.js';

export default [
  {
    // The upstream feed has no Linux build; updates come from re-running the installer.
    id: 'updater-check-disabled',
    file: MAIN,
    find: `checkForUpdates: async function () {
          if (!M.isPackaged) {`,
    replace: `checkForUpdates: async function () {
          if (process.platform === "linux") {
            D.showMessageBox({
              type: "info",
              title: "Vowen for Linux",
              message: "Updates are installed by re-running the vowen-linux installer.",
              buttons: [O.t("common.ok")]
            });
            return;
          }
          if (!M.isPackaged) {`,
  },
  {
    id: 'updater-yaml-disabled',
    file: MAIN,
    find: `async checkForUpdatesFromYaml() {`,
    replace: `async checkForUpdatesFromYaml() {
          if (process.platform === "linux") {
            const { CURRENT_VERSION } = C2(900375);
            return { currentVersion: CURRENT_VERSION, latestVersion: CURRENT_VERSION, releaseDate: null, downloadUrl: null };
          }`,
  },
  {
    id: 'tray-click-opens-settings',
    file: MAIN,
    find: `if (process.platform === "win32") {
            this.tray.on("click", () => {`,
    replace: `if (process.platform === "win32" || process.platform === "linux") {
            this.tray.on("click", () => {`,
  },
  {
    id: 'start-minimized-to-tray',
    file: MAIN,
    find: `const aD = process.platform === "win32" && aq.startMinimizedToTray === true || Co;`,
    replace: `const aD = (process.platform === "win32" || process.platform === "linux") && aq.startMinimizedToTray === true || Co;`,
  },
  {
    id: 'start-minimized-to-tray-setting',
    file: SETTINGS,
    find: `const eR = process.platform === "win32";`,
    replace: `const eR = process.platform === "win32" || process.platform === "linux";`,
  },
  {
    id: 'playback-controller-linux',
    file: MAIN,
    find: `if (j !== "darwin" && j !== "win32") {
          return null;
        }
        const W = j === "win32" ? "playback-controller.exe" : "playback-controller";`,
    replace: `if (j !== "darwin" && j !== "win32" && j !== "linux") {
          return null;
        }
        const W = j === "win32" ? "playback-controller.exe" : "playback-controller";`,
  },
];
