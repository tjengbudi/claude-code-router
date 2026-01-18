import path from "node:path";
import os from "node:os";

export const HOME_DIR = path.join(os.homedir(), ".claude-code-router");

export const CONFIG_FILE = path.join(HOME_DIR, "config.json");

export const PLUGINS_DIR = path.join(HOME_DIR, "plugins");

export const PRESETS_DIR = path.join(HOME_DIR, "presets");

export const PID_FILE = path.join(HOME_DIR, '.claude-code-router.pid');

export const REFERENCE_COUNT_FILE = path.join(os.tmpdir(), "claude-code-reference-count.txt");

// Claude projects directory
export const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");

// CCR projects file
export const PROJECTS_FILE = path.join(HOME_DIR, "projects.json");

// Agent ID regex pattern (UUID v4)
export const AGENT_ID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Model string regex pattern (provider,modelname) - Story 2.1
// Validates format: "openai,gpt-4o", "anthropic,claude-3-5-sonnet-20241022", "openrouter,meta-llama/llama-3-70b", etc.
// Supports forward slashes in model names for providers like openrouter
export const MODEL_STRING_REGEX = /^[a-z0-9_-]+,[a-z0-9_./-]+$/i;

// API key patterns to reject (security: NFR-S1)
export const API_KEY_PATTERNS = [
  /^sk-[-a-z0-9]+$/i,           // OpenAI API keys
  /^sk-proj-[-a-z0-9]+$/i,      // OpenAI project API keys
  /^pk-[-a-z0-9]+$/i,           // Stripe API keys
  /^xox[baprs]-[-a-z0-9]+$/i,   // Slack API keys
  /^ghp_[a-zA-Z0-9]{36}$/i,     // GitHub personal access tokens
  /^gho_[a-zA-Z0-9]{36}$/i,     // GitHub OAuth tokens
  /^ghu_[a-zA-Z0-9]{36}$/i,     // GitHub user tokens
  /^ghs_[a-zA-Z0-9]{36}$/i,     // GitHub server tokens
  /^ghr_[a-zA-Z0-9]{36}$/i,     // GitHub refresh tokens
  /^AKIA[0-9A-Z]{16}$/i,        // AWS access keys
];


export interface DefaultConfig {
  LOG: boolean;
  OPENAI_API_KEY: string;
  OPENAI_BASE_URL: string;
  OPENAI_MODEL: string;
}

export const DEFAULT_CONFIG: DefaultConfig = {
  LOG: false,
  OPENAI_API_KEY: "",
  OPENAI_BASE_URL: "",
  OPENAI_MODEL: "",
};
