export const CI_WORKFLOW_YAML = `name: AI config verify

on:
  pull_request:
  push:
    branches: [main]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Install foodmax-ai-config from npm
        run: npm install --no-save foodmax-ai-config@latest
      - name: Verify against package's locked manifest
        run: npx foodmax-ai verify --strict
`;
