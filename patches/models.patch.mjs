// Newer cloud models than the pinned Vowen release lists. Requests only send model, max_tokens and system,
// so a new model ID needs nothing else.
const MAIN = 'dist-electron/main.bundle.js';
const SETTINGS = 'dist-react/settings.js';

export default [
  // Claude Haiku 5.5 becomes the recommended Anthropic model; Haiku 4.5 stays selectable.
  {
    id: 'anthropic-haiku-5-5-list',
    file: SETTINGS,
    find: `value: "claude-haiku-4-5",
        label: "Claude Haiku 4.5 (Recommended)"
      }, {`,
    replace: `value: "claude-haiku-5-5",
        label: "Claude Haiku 5.5 (Recommended)"
      }, {
        value: "claude-haiku-4-5",
        label: "Claude Haiku 4.5"
      }, {`,
  },
  {
    id: 'anthropic-haiku-5-5-default-ui',
    file: SETTINGS,
    find: `case "anthropic":
      return "claude-haiku-4-5";`,
    replace: `case "anthropic":
      return "claude-haiku-5-5";`,
  },
  {
    id: 'anthropic-haiku-5-5-default',
    file: MAIN,
    find: `apiUrl: "https://api.anthropic.com/v1/messages",
            defaultModel: "claude-haiku-4-5",`,
    replace: `apiUrl: "https://api.anthropic.com/v1/messages",
            defaultModel: "claude-haiku-5-5",`,
  },
];
