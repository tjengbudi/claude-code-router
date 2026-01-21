# Git-Based Agent Sharing

This guide explains how teams share agent definitions using git, enabling zero-setup onboarding for new team members.

## Architectural Evolution (Story 4.5)

**IMPORTANT: This workflow represents a significant architectural change from earlier versions.**

### Previous Architecture (Pre-Story 4.5)
- `projects.json` was committed to git for configuration sharing
- All team members used the same model configuration
- Merge conflicts occurred when members configured different models

### Current Architecture (Story 4.5+)
- Agent `.md` files with `CCR-AGENT-ID` tags are committed to git
- `projects.json` stays in `~/.claude-code-router/` (local-only, NOT committed)
- Each team member configures their own model assignments independently

### Why the Change?
1. **Independent model preferences**: Each developer can use their preferred models
2. **Zero merge conflicts**: Each team member has their own `projects.json`
3. **Git-native workflow**: Standard pull/commit/push for agent sharing
4. **Better security**: No accidental commit of model preferences with potential cost implications

## Overview

The CCR agent system uses a **git-based workflow** for sharing agent definitions:

- **Agent .md files** with `CCR-AGENT-ID` tags are committed to git (shared across team)
- **projects.json** stays in `~/.claude-code-router/` (local-only, NOT committed)
- Each team member configures their own model assignments independently

## What's Shared vs. What's Local

✅ **Shared via git (committed to repository):**
- Agent `.md` files in `.bmad/bmm/agents/`
- CCR-AGENT-ID tags injected into agent files
- Agent structure and definitions

❌ **NOT shared (local to each team member):**
- `projects.json` (stays in `~/.claude-code-router/`)
- Model assignments (each team member chooses their own)
- API keys and secrets

## Architecture Diagram

```
Git-Tracked Repository:
├── .bmad/bmm/agents/
│   ├── dev.md              # Contains: <!-- CCR-AGENT-ID: uuid -->
│   ├── sm.md               # Contains: <!-- CCR-AGENT-ID: uuid -->
│   └── new-agent.md        # New agents shared via git

Local Only (~/.claude-code-router/):
└── projects.json           # Each team member has their own copy
```

## Team Workflow

### Developer A: Add New Agent

1. **Create new agent file:**
   ```bash
   cd .bmad/bmm/agents/
   # Create new-agent.md
   ```

2. **Run project scan to inject CCR-AGENT-ID:**
   ```bash
   ccr project scan <project-id>
   # System detects new agent and injects UUID
   # Prompts for model configuration (optional)
   ```

3. **Commit and push:**
   ```bash
   git add .bmad/bmm/agents/new-agent.md
   git commit -m "feat(agents): add new-agent"
   git push origin main
   ```

### Developer B: Receive Agent from Git

1. **Pull changes:**
   ```bash
   git pull origin main
   # Receives new-agent.md with CCR-AGENT-ID already injected
   ```

2. **Run project scan:**
   ```bash
   ccr project scan <project-id>
   # System detects new agent with existing CCR-AGENT-ID
   # Prompts for model configuration
   ```

3. **Configure model interactively:**
   ```
   Enter model for new-agent (provider,model): openai,gpt-4o
   ```

4. **Start working:**
   ```bash
   ccr code "Help me with this task"
   # Uses your configured model for new-agent
   ```

## Key Differences from Old Workflow

| Aspect | Old Workflow (pre-4.5) | New Workflow (post-4.5) |
|--------|------------------------|-------------------------|
| Shared via git | `projects.json` | Agent `.md` files with `CCR-AGENT-ID` |
| projects.json location | In repository | `~/.claude-code-router/` (local) |
| Model configuration | Shared across team | Each member configures independently |
| Merge conflicts | In `projects.json` | In agent `.md` files (rare) |

## Benefits of New Architecture

1. **Agent definitions are versioned** - Track changes to agent structure
2. **Independent model choices** - Each developer uses their preferred models
3. **Zero merge conflicts in config** - Each team member has their own `projects.json`
4. **Git-native workflow** - Standard pull/commit/push for agent sharing

## New Team Member Onboarding

1. **Clone the repository:**
   ```bash
   git clone <repo-url>
   cd <repo>
   ```

2. **Install CCR globally:**
   ```bash
   npm install -g @musistudio/claude-code-router
   ```

3. **Scan project to detect agents:**
   ```bash
   ccr project scan <project-id>
   # Detects all agents with CCR-AGENT-ID tags
   # Prompts for model configuration
   ```

4. **Configure your models interactively:**
   ```
   Found 3 agents:
   - dev.md: Enter model (provider,model): openai,gpt-4o
   - sm.md: Enter model (provider,model): anthropic,claude-haiku
   - pm.md: Enter model (provider,model): [skip for Router.default]
   ```

5. **Start working:**
   ```bash
   ccr code "Help me implement this feature"
   ```

## Merge Conflict Handling

When two developers add different agents, git handles this naturally:

### Scenario 1: Different Agents (No Conflict)

```
Developer A adds: agent-a.md
Developer B adds: agent-b.md
Result: Git merges both automatically
```

### Scenario 2: Same Agent File (Conflict Possible)

```
Developer A modifies: dev.md
Developer B modifies: dev.md
Result: Git shows conflict in dev.md
Resolution: Manually merge, keeping CCR-AGENT-ID from one or both
```

**Note:** CCR-AGENT-ID uniqueness ensures proper agent identification after merge.

## Security Guarantee

Agent `.md` files are **safe to commit to public repositories** because:

1. **CCR-AGENT-ID** is just a UUID (no secrets)
2. **No API keys** are ever written to agent files
3. **Model configurations** stay in local `projects.json`
4. **API keys** remain in environment variables or `config.json`

## File Format

### Agent File Example (committed to git)

```markdown
# Dev Agent

This agent handles development tasks.

<!-- CCR-AGENT-ID: 550e8400-e29b-41d4-a716-446655440000 -->
```

### projects.json (local, NOT committed)

```json5
// Project configurations for CCR agent system
// Schema version: 1.0.0
// This file is local-only (NOT committed to git)
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
        "550e8400-e29b-41d4-a716-446655440001": {
          id: "550e8400-e29b-41d4-a716-446655440001",
          name: "dev.md",
          relativePath: ".bmad/bmm/agents/dev.md",
          absolutePath: "/home/user/my-bmm-project/.bmad/bmm/agents/dev.md",
          model: "openai,gpt-4o"  // Your model choice
        }
      }
    }
  }
}
```

## .gitattributes Configuration

The repository includes `.gitattributes` to ensure consistent line endings:

```gitattributes
# Agent markdown files use LF line endings
*.md text eol=lf
```

This ensures CCR-AGENT-ID tags work correctly across Windows, Mac, and Linux.

## Troubleshooting

### Agent not detected after git pull

```bash
# Ensure you ran project scan
ccr project scan <project-id>

# Verify agent file has CCR-AGENT-ID
cat .bmad/bmm/agents/new-agent.md
# Should contain: <!-- CCR-AGENT-ID: uuid -->
```

### Model configuration prompt not appearing

```bash
# Re-run project scan with force flag
ccr project scan <project-id>

# Or manually configure specific agent
ccr project configure <project-id>
```

### Same agent shows different models for different team members

This is **expected behavior** - each team member maintains their own `projects.json` with their model preferences. The agent ID (CCR-AGENT-ID) is the same, but model assignments are independent.

## Best Practices

1. **Commit agent files early** - Share agent definitions with team
2. **Document agent purpose** - Include clear descriptions in agent files
3. **Coordinate large changes** - Use team chat for major agent restructuring
4. **Never commit API keys** - Keep secrets in environment variables or local config
5. **Review agent files in PRs** - Ensure CCR-AGENT-ID tags are preserved
