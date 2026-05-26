export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'docs', 'chore', 'refactor', 'test', 'perf', 'build', 'ci'],
    ],
    'header-max-length': [2, 'always', 100],
    // Disabled: we have proper nouns (Codeup, Claude Code, MCP, Feishu) and Chinese
    // characters that don't follow western lowercase conventions.
    'subject-case': [0],
    // Allow Chinese full-width punctuation at end of subject
    'subject-full-stop': [0],
  },
};
