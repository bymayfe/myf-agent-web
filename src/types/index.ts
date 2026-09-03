// src/types/index.ts
// Merkezi tip tanımları. Python tarafındaki settings.json / providers_config.json /
// agents_config.json şemalarıyla birebir uyumlu tutulur (geriye dönük veri taşınabilirliği için).

export type ExecutionMode = "interactive" | "sequential" | "subagent";

export type PermissionMode = "ask" | "session_allow" | "sandbox" | "full_autonomy";

export type TokenType = "content" | "thinking";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  thinking?: string;
  statusNote?: string;
  editedFiles?: any[];
  createdAt?: string;
}

export interface Settings {
  default_model: string;
  coordinator_name: string;
  think_mode: boolean;
  warmup: boolean;
  theme: string;
  temperature: number;
  max_tokens: number;
  planning_model: string;
  code_model: string;
  micro_fix_model: string;
  coordinator_model: string;
  micro_fix_max_tries: number;
  full_autonomy_cap: number;
  repomap_tokens: number;
  permission_mode: PermissionMode;
  auto_audit_log: boolean;
  execution_mode: ExecutionMode;
  active_provider: string;
}

export interface ProviderAgentModels {
  coordinator: string;
  product_manager?: string;
  software_architect?: string;
  developer?: string;
  qa_tester?: string;
  reviewer?: string;
  optimizer?: string;
  security_auditor?: string;
  documentation_writer?: string;
  devops_engineer?: string;
  custom?: string;
}

export interface ProviderConfig {
  label: string;
  description: string;
  api_base: string;
  /** Gerçek anahtar asla burada tutulmaz — sadece env değişkeni adı taşınır. */
  api_key_env: string | null;
  model_prefix: string;
  requires_key: boolean;
  key_url?: string;
  default_context_window: number;
  model_context_windows: Record<string, number>;
  agent_models: ProviderAgentModels;
}

export interface ProvidersFile {
  version: string;
  active_provider: string;
  providers: Record<string, ProviderConfig>;
}

export interface ModelOption {
  id: string;
  name: string;
  label: string;
  in_vram?: boolean;
  size_gb?: number;
}

export type AgentRoleType =
  | "product_manager"
  | "software_architect"
  | "developer"
  | "qa_tester"
  | "reviewer"
  | "optimizer"
  | "documentation_writer"
  | "devops_engineer"
  | "security_auditor"
  | "custom";

export interface AgentDefinition {
  id: string;
  display_name: string;
  role_type: AgentRoleType;
  model: string;
  pipeline_order: number;
  enabled: boolean;
  description: string;
  custom_prompt?: string | null;
}

export interface SessionMeta {
  session_id: string;
  title: string;
  slug: string;
  project_dir: string;
  created_at: string;
  updated_at: string;
}

export interface SessionFile extends SessionMeta {
  conversation_history: ChatMessage[];
}

export interface ProjectEntry {
  id: string;
  name: string;
  path: string;          // Filesystem absolute path
  addedAt: string;
  exists?: boolean;      // Runtime check (not persisted)
}

/** SSE üzerinden istemciye akan olay tipleri (chat sırasında). */
export type StreamEventType = "content" | "thinking" | "done" | "error" | "pipeline_start";

export interface StreamEvent {
  type: StreamEventType;
  data: string;
}

/** Pipeline (Faz 2) adım durumları — TrajectoryView bunu tüketecek. */
export type PipelineStepStatus = "pending" | "running" | "success" | "error";

export interface PipelineStep {
  id: string;
  agentDisplayName: string;
  roleType: AgentRoleType;
  status: PipelineStepStatus;
  startedAt?: string;
  finishedAt?: string;
  summary?: string;
}
