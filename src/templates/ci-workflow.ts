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
      - name: Install foodmax-ai-config
        run: npm install --no-save github:foodmax/ai-config-init#main
      - name: Verify
        run: npx foodmax-ai verify --strict
`;
