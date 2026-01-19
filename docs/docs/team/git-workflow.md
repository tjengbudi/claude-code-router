# Git-Based Configuration Sharing

This guide explains how teams share agent model configurations using git, enabling zero-setup onboarding for new team members.

## Overview

The CCR agent system stores team-shared configurations in `projects.json`, located in `~/.claude-code-router/projects.json`. This file is safe to commit to git because it contains only metadata and provider/model names - **NO API keys**.

## What's Safe to Commit

✅ **Safe to commit to git:**
- Provider names (e.g., `"openai"`, `"anthropic"`, `"google"`)
- Model names (e.g., `"gpt-4o"`, `"claude-3-5-sonnet-20241022"`)
- Project metadata (paths, names, UUIDs)
- Agent metadata (IDs, file paths)
- Schema version for compatibility

❌ **Never committed to git:**
- API keys (stored in `~/.claude-code-router/config.json` or environment variables)
- Secrets, tokens, credentials

## File Format

The `projects.json` file uses JSON5 format for human readability:

```json5
// Project configurations for CCR agent system
// Schema version: 1.0.0
// This file is safe to commit to git (contains no API keys)
{
  schemaVersion: "1.0.0",
  projects: {
    "550e8400-e29b-41d4-a716-446655440000": {
      id: "550e8400-e29b-41d4-a716-446655440000",
      name: "my-bmm-project",
      path: "/home/user/my-bmm-project",
      createdAt: "2026-01-19T10:00:00.000Z",
      updatedAt: "2026-01-19T10:00:00.000Z",
      agents: {
        "agent-uuid-1": {
          id: "agent-uuid-1",
          name: "dev.md",
          relativePath: ".bmad/bmm/agents/dev.md",
          absolutePath: "/home/user/my-bmm-project/.bmad/bmm/agents/dev.md",
          model: "openai,gpt-4o"
        },
        "agent-uuid-2": {
          id: "agent-uuid-2",
          name: "SM.md",
          relativePath: ".bmad/bmm/agents/SM.md",
          absolutePath: "/home/user/my-bmm-project/.bmad/bmm/agents/SM.md",
          model: "anthropic,claude-haiku"
        },
        "agent-uuid-3": {
          id: "agent-uuid-3",
          name: "pm.md",
          relativePath: ".bmad/bmm/agents/pm.md",
          absolutePath: "/home/user/my-bmm-project/.bmad/bmm/agents/pm.md"
          // No model property → uses Router.default
        }
      }
    }
  }
}
```

## Team Workflow

### Developer A: Configure and Share

1. **Configure agents for your project:**
   ```bash
   ccr project configure <project-id>
   # Select models for each agent interactively
   # Saves to ~/.claude-code-router/projects.json
   ```

2. **Commit and push to share:**
   ```bash
   cp ~/.claude-code-router/projects.json /path/to/project/.claude-code-router/
   git add .claude-code-router/projects.json
   git commit -m "Configure agent model assignments"
   git push origin main
   ```

### Developer B: Pull and Use

1. **Pull changes from git:**
   ```bash
   git pull origin main
   ```

2. **Copy projects.json to CCR directory:**
   ```bash
   mkdir -p ~/.claude-code-router
   cp .claude-code-router/projects.json ~/.claude-code-router/
   ```

3. **Start working - agent routing works immediately!**
   ```bash
   ccr code "Help me refactor this function"
   # Uses configured models automatically
   ```

### New Team Member Onboarding

1. **Clone the repository:**
   ```bash
   git clone <repo-url>
   cd <repo>
   ```

2. **Install CCR globally (one-time setup):**
   ```bash
   npm install -g @musistudio/claude-code-router
   ```

3. **Copy projects.json:**
   ```bash
   mkdir -p ~/.claude-code-router
   cp .claude-code-router/projects.json ~/.claude-code-router/
   ```

4. **Configure your API keys:**
   ```bash
   ccr model
   # Or edit ~/.claude-code-router/config.json
   ```

5. **Start working - agent routing is pre-configured!**

## Merge Conflict Resolution

When two developers configure the same agent differently, git will detect a merge conflict in `projects.json`. The JSON5 format makes conflicts easy to resolve manually.

### Example Conflict

```json5
<<<<<<< HEAD
  model: "openai,gpt-4o"  // Developer A's choice
=======
  model: "anthropic,claude-sonnet-4"  // Developer B's choice
>>>>>>> feature-branch
```

### Resolution Steps

1. **Discuss with your team** to decide which model to use
2. **Edit the file** to keep the chosen configuration:
   ```json5
   model: "openai,gpt-4o"  // Team decided to use GPT-4o
   ```
3. **Mark as resolved** and commit:
   ```bash
   git add projects.json
   git commit -m "Resolve merge conflict: use GPT-4o for dev agent"
   ```

## Preventing Merge Conflicts

Follow these best practices to minimize conflicts:

- **Coordinate in team chat** before configuring agents
- **One PR per agent** configuration rather than bulk changes
- **Pull before pushing** to catch conflicts early
- **Communicate changes** in pull request descriptions

## Schema Version

The `schemaVersion` field indicates the format version of `projects.json`. This enables:

- **Backward compatibility**: Loading older files with newer CCR versions
- **Forward compatibility**: Loading newer files with older CCR versions (with warnings)
- **Graceful migration**: Future schema changes will be handled automatically

If you see a schema version warning, the system will attempt compatibility mode. This is normal when upgrading CCR or working with teammates on different versions.

## Security Guarantee

The `projects.json` file is **safe to commit to public repositories** because:

1. **Validation** rejects API key patterns during save
2. **Only metadata** is stored (provider names, model names)
3. **No secrets** are ever written to the file
4. **Audit tests** verify compliance

API keys are stored locally in:
- `~/.claude-code-router/config.json` (global config)
- Environment variables (CI/CD)
- `.env` files (should be gitignored)

## Troubleshooting

### projects.json not found

```bash
# Ensure CCR directory exists
mkdir -p ~/.claude-code-router

# Copy from your project if you have it
cp .claude-code-router/projects.json ~/.claude-code-router/
```

### Schema version warning

This is informational - CCR will attempt compatibility mode. To resolve:

```bash
# Re-save your projects.json to update schema version
ccr project list  # Triggers re-save with current schema
```

### Merge conflict keeps happening

1. Coordinate with your team in chat
2. Decide on a configuration approach
3. Configure once and commit
4. Have other team members pull that configuration

### Changes not reflected

```bash
# Reload CCR after copying projects.json
ccr restart
```

## .gitignore Configuration

**Do NOT** ignore `projects.json` - it should be committed to share configurations.

**DO** ignore these files (they contain secrets):
```
.claude-code-router/config.json
.env
*.key
```

Example `.gitignore`:
```gitignore
# CCR: Contains API keys
.claude-code-router/config.json

# CCR: Local overrides
.env.local

# General: Environment files
.env
*.key
```

## Best Practices

1. **Commit projects.json early** in your workflow
2. **Document agent choices** in commit messages
3. **Review changes** in pull requests
4. **Coordinate as a team** for major configuration changes
5. **Keep API keys separate** in local config or environment variables
