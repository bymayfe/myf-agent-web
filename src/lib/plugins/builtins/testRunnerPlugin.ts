// src/lib/plugins/builtins/testRunnerPlugin.ts
// Test Koşucu ve Kalite Doğrulama Eklentisi (Jest, Pytest, Vitest, Syntax Checker)

import type { MyfPlugin } from "../types";
import { runStreamingCommand } from "./terminalPlugin";

export const testRunnerPlugin: MyfPlugin = {
  id: "test-runner",
  name: "Test Runner & Syntax Checker",
  version: "1.0.0",
  description: "Runs unit tests (pytest, npm test, vitest) and checks syntax errors in the project.",
  category: "terminal",
  icon: "CheckCircle2",
  enabled: true,
  author: "MYF Agent Core",

  systemPromptContribution: () => {
    return `[PLUGIN: Test Runner & Syntax Checker]
Use 'run_unit_tests' to validate tests or detect syntax errors after code changes.`;
  },

  tools: [
    {
      name: "run_unit_tests",
      displayName: "Run Unit Tests",
      description: "Executes test runner commands (npm test, pytest, etc.) in the project directory and reports results.",
      parameters: {
        framework: {
          type: "string",
          description: "Test framework ('npm_test', 'pytest', 'vitest', or custom command)",
          default: "npm_test",
        },
      },
      execute: async (params, context) => {
        const fw = String(params.framework || "npm_test").toLowerCase();
        let cmd = "npm test 2>&1";
        if (fw === "pytest") cmd = "pytest -v 2>&1";
        else if (fw === "vitest") cmd = "npx vitest run 2>&1";
        else if (params.framework && typeof params.framework === "string" && params.framework.includes(" ")) {
          cmd = params.framework;
        }

        const cwd = context.projectDir || process.cwd();
        return runStreamingCommand(cmd, cwd);
      },
    },
  ],
};
