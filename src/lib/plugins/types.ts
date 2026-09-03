// src/lib/plugins/types.ts
// MYF Agent Eklenti (Plugin) ve Araç (Tool) Tip Tanımları
// DeepSeek Harness & Modern TS Agent standartlarına uygun modüler yapı.

export type PluginCategory = "search" | "devops" | "filesystem" | "codebase" | "terminal" | "custom";

export interface ToolParameter {
  type: "string" | "number" | "boolean" | "array" | "object";
  description: string;
  required?: boolean;
  default?: unknown;
}

export interface ToolDefinition {
  name: string;
  displayName: string;
  description: string;
  parameters: Record<string, ToolParameter>;
  execute: (params: Record<string, unknown>, context: PluginContext) => Promise<ToolExecutionResult>;
}

export interface ToolExecutionResult {
  success: boolean;
  output: string;
  data?: unknown;
  error?: string;
}

export interface PluginContext {
  projectDir: string;
  sessionId?: string;
  env: Record<string, string | undefined>;
  log: (message: string) => void;
}

export interface PluginLifecycleHooks {
  onInitialize?: (context: PluginContext) => Promise<void>;
  beforeToolExecute?: (toolName: string, params: Record<string, unknown>, context: PluginContext) => Promise<boolean>;
  afterToolExecute?: (toolName: string, result: ToolExecutionResult, context: PluginContext) => Promise<void>;
  beforeLLMCall?: (messages: unknown[], context: PluginContext) => Promise<void>;
  afterLLMCall?: (response: string, context: PluginContext) => Promise<string>;
}

export interface MyfPlugin {
  id: string;
  name: string;
  version: string;
  description: string;
  category: PluginCategory;
  icon: string; // Lucide icon name or emoji
  enabled: boolean;
  author?: string;
  tools: ToolDefinition[];
  hooks?: PluginLifecycleHooks;
  /** LLM Sistem promptuna eklenecek ek talimatlar */
  systemPromptContribution?: (context: PluginContext) => string;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  category: PluginCategory;
  icon: string;
  enabled: boolean;
  author?: string;
  toolNames: { name: string; displayName: string; description: string }[];
}

export interface PluginsConfig {
  plugins: Record<string, { enabled: boolean; config?: Record<string, unknown> }>;
}
