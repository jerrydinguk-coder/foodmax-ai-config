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
        run: npm install --no-save https://bgs2026-ap-southeast-1.devops.alibabacloudcs.com/codeup/kos/dev-tools/foodmax-ai-config-init.git#main
      - name: Verify
        run: npx foodmax-ai verify --strict
`;
