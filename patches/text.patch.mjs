// Text delivery on Linux: route paste through the text-writer helper; resolve selected-text helper.
const F = "dist-electron/main.bundle.js";
export default [
  { id: "P1-text-writer-linux", file: F,
    find: `const Cx = Ca === "direct" ? "direct" : CJ === "darwin" ? "text-writer" : null;`,
    replace: `const Cx = Ca === "direct" ? "direct" : CJ === "darwin" || CJ === "linux" ? "text-writer" : null;` },
  { id: "P2-selected-text-linux", file: F,
    find: `const H = h === "darwin" ? "mac" : h === "win32" ? "win" : null;`,
    replace: `const H = h === "darwin" ? "mac" : h === "win32" ? "win" : h === "linux" ? "linux" : null;` },
];
