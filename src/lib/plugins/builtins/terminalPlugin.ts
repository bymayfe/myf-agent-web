// src/lib/plugins/builtins/terminalPlugin.ts
// Terminal ve Komut Çalıştırma Eklentisi (Güvenli, canlı yayınlanan komut çalıştırma)

import type { MyfPlugin } from "../types";
import { terminalManager } from "@/lib/terminalManager";

export function runStreamingCommand(
  cmd: string,
  cwd: string,
  onChunk?: (chunk: string) => void,
  customId?: string
): Promise<{ success: boolean; output: string }> {
  return terminalManager.runCommand({
    id: customId,
    cmd,
    cwd,
    onChunk,
    autoKillDevServerOnReady: true,
  });
}


export const terminalPlugin: MyfPlugin = {
  id: "terminal-ops",
  name: "Terminal & Shell Runner",
  version: "1.0.0",
  description: "Executes test, build, and shell commands in the project directory.",
  category: "terminal",
  icon: "Terminal",
  enabled: true,
  author: "MYF Agent Core",

  systemPromptContribution: () => {
    return `[PLUGIN: Terminal & Shell Runner]
Use 'run_command' to run shell commands, builds, or tests in the project directory.
IMPORTANT: You do NOT need to prefix 'next dev' or 'npm run dev' with 'timeout'. The system automatically detects when the dev server is ready, validates the output, and safely terminates the test to avoid locking the port.`;
  },

  tools: [
    {
      name: "run_command",
      displayName: "Run Command",
      description: "Executes a shell command in the project working directory (e.g. 'npm run build', 'npm test', 'npm run dev', 'ls -la', 'python main.py'). Dev servers do not require timeout.",
      parameters: {
        command: {
          type: "string",
          description: "Shell command to execute (e.g. 'npm run build', 'npm test', 'npm run dev', 'python script.py')",
          required: true,
        },
      },
      execute: async (params, context) => {
        const cmd = String(params.command || "").trim();
        if (!cmd) return { success: false, output: "Command is required." };
        const cwd = context.projectDir || process.cwd();
        return runStreamingCommand(cmd, cwd);
      },
    },
  ],
};
