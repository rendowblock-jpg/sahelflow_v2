/**
 * SahelFlow Agent Configuration Types
 * Shared between server (orchestrator) and client (config UI).
 * No server-side imports — safe for 'use client' components.
 */

export interface OrderAgentConfig {
  enabled: boolean;
  auto_confirm_threshold: number;
  auto_reject_threshold: number;
  require_full_address: boolean;
}

export interface CommAgentConfig {
  enabled: boolean;
  auto_extract: boolean;
  suggest_replies: boolean;
  auto_send: boolean;
  language_preference: "auto" | "ar" | "fr" | "en";
}

export interface AgentConfig {
  order: OrderAgentConfig;
  comm: CommAgentConfig;
}

export const DEFAULT_ORDER_AGENT_CONFIG: OrderAgentConfig = {
  enabled: true,
  auto_confirm_threshold: 30,
  auto_reject_threshold: 85,
  require_full_address: true,
};

export const DEFAULT_COMM_AGENT_CONFIG: CommAgentConfig = {
  enabled: true,
  auto_extract: true,
  suggest_replies: true,
  auto_send: false,
  language_preference: "auto",
};

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  order: DEFAULT_ORDER_AGENT_CONFIG,
  comm: DEFAULT_COMM_AGENT_CONFIG,
};
