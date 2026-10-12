// Newer cloud models than the pinned Vowen release lists. Requests only send model, max_tokens and system,
// so a new model ID needs nothing else.
const SETTINGS = 'dist-react/settings.js';

export default [
  {
    id: 'anthropic-haiku-5-5',
    file: SETTINGS,
    find: `value: "claude-haiku-4-5",
        label: "Claude Haiku 4.5 (Recommended)"
      }, {`,
    replace: `value: "claude-haiku-4-5",
        label: "Claude Haiku 4.5 (Recommended)"
      }, {
        value: "claude-haiku-5-5",
        label: "Claude Haiku 5.5"
      }, {`,
  },
];
