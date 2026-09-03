// src/lib/plugins/builtins/testRunnerPlugin.ts
// Test Koşucu ve Kalite Doğrulama Eklentisi (Jest, Pytest, Vitest, Syntax Checker)

import type { MyfPlugin } from "../types";
import { runStreamingCommand } from "./terminalPlugin";

export const testRunnerPlugin: MyfPlugin = {
  id: "test-runner",
  name: "Test Koşucu & Sentaks Denetçisi",
  version: "1.0.0",
  description: "Projedeki birim testleri (pytest, npm test, vitest) çalıştırır ve sentaks hatalarını denetler.",
  category: "terminal",
  icon: "CheckCircle2",
  enabled: true,
  author: "MYF Agent Core",

  systemPromptContribution: () => {
    return `[EKLENTİ: Test Koşucu & Sentaks Denetçisi]
Kod değişikliklerinden sonra testleri doğrulamak veya sentaks hatalarını yakalamak için 'run_unit_tests' aracını kullanabilirsin.`;
  },

  tools: [
    {
      name: "run_unit_tests",
      displayName: "Birim Testlerini Koş",
      description: "Proje dizinindeki test komutunu (npm test, pytest vb.) çalıştırır ve sonuçları raporlar.",
      parameters: {
        framework: {
          type: "string",
          description: "Test aracı ('npm_test', 'pytest', 'vitest' veya özel komut)",
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
