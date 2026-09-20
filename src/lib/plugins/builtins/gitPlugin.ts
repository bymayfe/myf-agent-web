// src/lib/plugins/builtins/gitPlugin.ts
// Git Versiyon Kontrol Eklentisi (Status, Diff, Log, Branch takibi)

import type { MyfPlugin } from "../types";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export const gitPlugin: MyfPlugin = {
  id: "git-ops",
  name: "Git Version Control",
  version: "1.0.0",
  description: "Inspects project Git status, recent commits, and file diffs.",
  category: "devops",
  icon: "GitBranch",
  enabled: true,
  author: "MYF Agent Core",

  systemPromptContribution: () => {
    return `[PLUGIN: Git Version Control]
Use 'git_status', 'git_diff', and 'git_log' to inspect the Git status, modified files, or commit history of the active project.`;
  },

  tools: [
    {
      name: "git_status",
      displayName: "Git Status",
      description: "Lists current Git branch status and modified / staged files in the active project.",
      parameters: {},
      execute: async (_params, context) => {
        const cwd = context.projectDir || process.cwd();
        try {
          const { stdout } = await execAsync("git status --short --branch", { cwd, timeout: 10000 });
          return {
            success: true,
            output: stdout.trim() || "Git working directory is clean, no uncommitted changes.",
          };
        } catch {
          return {
            success: true,
            output: "No Git repository initialized in this directory yet. If the directory is empty, stop calling inspection tools and immediately start creating the requested project and files.",
          };
        }
      },
    },
    {
      name: "git_diff",
      displayName: "Git Diff",
      description: "Shows uncommitted or staged code differences (git diff) in the project.",
      parameters: {
        staged: {
          type: "boolean",
          description: "Show only staged (to be committed) changes",
          default: false,
        },
        filePath: {
          type: "string",
          description: "File path to view diff for a specific file",
        },
      },
      execute: async (params, context) => {
        const cwd = context.projectDir || process.cwd();
        const stagedFlag = params.staged ? "--staged" : "";
        const file = params.filePath ? `"${params.filePath}"` : "";
        try {
          const { stdout } = await execAsync(`git diff ${stagedFlag} ${file}`, { cwd, timeout: 15000 });
          const diff = stdout.trim();
          if (!diff) {
            return { success: true, output: "No diff found." };
          }
          // Diff çok büyükse kısalt
          const truncated = diff.length > 5000 ? diff.slice(0, 5000) + "\n... (output truncated)" : diff;
          return {
            success: true,
            output: truncated,
          };
        } catch (err) {
          return {
            success: false,
            output: `Could not get diff: ${err instanceof Error ? err.message : "Error"}`,
          };
        }
      },
    },
    {
      name: "git_log",
      displayName: "Git Commit Log",
      description: "Shows recent Git commit history in the project.",
      parameters: {
        limit: {
          type: "number",
          description: "Number of commits to display (default: 5)",
          default: 5,
        },
      },
      execute: async (params, context) => {
        const cwd = context.projectDir || process.cwd();
        const limit = typeof params.limit === "number" ? Math.min(params.limit, 20) : 5;
        try {
          const { stdout } = await execAsync(`git log -n ${limit} --oneline --decorate`, { cwd, timeout: 10000 });
          return {
            success: true,
            output: stdout.trim() || "No commit history yet.",
          };
        } catch (err) {
          return {
            success: false,
            output: `Could not get commit history: ${err instanceof Error ? err.message : "Error"}`,
          };
        }
      },
    },
  ],
};
