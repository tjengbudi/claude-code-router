---
sidebar_position: 7
---

# ccr project

Manage projects and configure agent models for automatic routing.

## Usage

```bash
ccr project [command]
```

## Commands

### Add Project

Register a new project and scan for agent files:

```bash
ccr project add <path>
```

The `<path>` should be the absolute path to your project directory.

**What it does:**
- Scans the project for agent files in `.claude/agents/` or `.bmad/bmm/agents/`
- Assigns unique IDs to each agent (injected as `CCR-AGENT-ID` comments)
- Registers the project in `~/.claude-code-router/projects.json`
- Prompts you to configure models for detected agents

**Example:**

```bash
$ ccr project add /home/user/my-project

Scanning /home/user/my-project for agents...

Found 3 agents:
  .bmad/bmm/agents/dev.md
  .bmad/bmm/agents/sm.md
  .bmad/bmm/agents/ux-designer.md

Registering project...
Project ID: 550e8400-e29b-41d4-a716-446655440000
Project name: my-project

Configure agent models (press Enter to use Router.default):
  dev.md [default]: openai,gpt-4o
  sm.md [default]: anthropic,claude-haiku
  ux-designer.md [default]: [skip]

Project registered successfully!
```

### List Projects

Display all registered projects with their agents:

```bash
ccr project list
```

**Example output:**

```bash
$ ccr project list

Registered Projects:

my-project (550e8400-e29b-41d4-a716-446655440000)
  Path: /home/user/my-project
  Agents (3):
    ├─ dev.md (openai,gpt-4o)
    ├─ sm.md (anthropic,claude-haiku)
    └─ ux-designer.md [Router.default]

another-project (660e8400-e29b-41d4-a716-446655440001)
  Path: /home/user/another-project
  Agents (1):
    └─ analyst.md (deepseek,deepseek-chat)
```

### Configure Project

Interactively configure models for agents in a project:

```bash
ccr project configure <project-id>
```

You can use either the project name or the UUID.

**What it does:**
- Displays current agent configurations
- Prompts you to change model assignments
- Updates `~/.claude-code-router/projects.json`

**Example:**

```bash
$ ccr project configure my-project

Current configuration for my-project:

  dev.md: openai,gpt-4o
  sm.md: anthropic,claude-haiku
  ux-designer.md: [Router.default]

Enter new model (provider,model) or press Enter to keep current:
  dev.md [openai,gpt-4o]: deepseek,deepseek-reasoner
  sm.md [anthropic,claude-haiku]: [skip]
  ux-designer.md [Router.default]: gemini,gemini-1.5-flash

Configuration updated!
```

### Scan Project

Rescan a project for new or modified agents:

```bash
ccr project scan <project-id>
```

**What it does:**
- Detects new agent files without `CCR-AGENT-ID` tags
- Injects unique IDs into new agents
- Prompts for model configuration for new agents only
- Updates `~/.claude-code-router/projects.json`

**When to use:**
- After pulling new agents from git
- After creating new agent files manually
- When agents aren't being detected

**Example:**

```bash
$ ccr project scan my-project

Scanning /home/user/my-project for new agents...

Found new agent:
  .bmad/bmm/agents/architect.md

Injecting agent ID: 770e8400-e29b-41d4-a716-446655440002

Configure model for architect.md:
  Enter model (provider,model): openrouter,anthropic/claude-3.5-sonnet

Agent registered successfully!
```

## Configuration Files

### projects.json Schema

The `projects.json` file stores project and agent configurations:

**Location:** `~/.claude-code-router/projects.json`

**Schema (JSON5 format):**

```json5
{
  schemaVersion: "1.0.0",
  projects: {
    "<project-uuid>": {
      id: "<project-uuid>",
      name: "project-name",
      path: "/absolute/path/to/project",
      createdAt: "2026-01-16T10:00:00.000Z",
      updatedAt: "2026-01-16T11:30:00.000Z",
      agents: {
        "<agent-uuid>": {
          id: "<agent-uuid>",
          name: "agent-filename.md",
          relativePath: ".bmad/bmm/agents/agent-filename.md",
          absolutePath: "/absolute/path/to/agent-filename.md",
          model: "provider,model"  // Optional - uses Router.default if not set
        }
      }
    }
  }
}
```

**Notes:**
- File format is JSON5 (supports comments and trailing commas)
- The `model` field is optional - if omitted, the agent uses `Router.default`
- This file is local-only (NOT committed to git)
- Each team member has their own copy with their model preferences

### Agent File Format

Agent files use HTML comments to store metadata:

```markdown
# Agent Name

Agent description and instructions...

<!-- CCR-AGENT-ID: 550e8400-e29b-41d4-a716-446655440000 -->
```

**Important:**
- `CCR-AGENT-ID` is injected automatically by CCR
- Do not edit this tag manually
- Agent files are committed to git (shared across team)
- Model assignments are NOT stored in agent files (only in `projects.json`)

## Use Case Examples

### Use Case 1: Setup New Project with Agents

```bash
# 1. Create your project directory
mkdir ~/my-project
cd ~/my-project

# 2. Create agent files directory
mkdir -p .bmad/bmm/agents

# 3. Create your agent files
cat > .bmad/bmm/agents/dev.md << 'EOF'
# Dev Agent

You are a development assistant. Help with coding tasks.
EOF

# 4. Register the project with CCR
ccr project add ~/my-project

# 5. Configure models when prompted
dev.md [default]: openai,gpt-4o

# 6. Start using Claude Code with agent routing
ccr code "Help me implement a new feature"
```

### Use Case 2: Share Agents via Git

```bash
# Developer A: Add new agent
cd ~/my-project/.bmad/bmm/agents
cat > architect.md << 'EOF'
# Architect Agent

You are a software architect. Design system architectures.
EOF

# Scan project to inject CCR-AGENT-ID
ccr project scan my-project

# Commit and push
git add .bmad/bmm/agents/architect.md
git commit -m "feat(agents): add architect agent"
git push origin main

# Developer B: Receive agent from git
git pull origin main

# Scan to detect new agent
ccr project scan my-project

# Configure model for new agent
architect.md: openrouter,anthropic/claude-3.5-sonnet

# Start using the new agent
ccr code "Design a microservices architecture"
```

### Use Case 3: Change Agent Models

```bash
# View current configuration
ccr project list

# Reconfigure specific project
ccr project configure my-project

# Update models interactively
dev.md [openai,gpt-4o]: deepseek,deepseek-reasoner
sm.md [anthropic,claude-haiku]: [keep]
ux-designer.md [Router.default]: gemini,gemini-1.5-flash
```

### Use Case 4: Debug Agent Detection

```bash
# Agent not being detected? Try rescan
ccr project scan my-project

# Check agent file has CCR-AGENT-ID
cat .bmad/bmm/agents/dev.md
# Should contain: <!-- CCR-AGENT-ID: uuid -->

# Verify projects.json
cat ~/.claude-code-router/projects.json

# Check agent routing in action
ccr code "Which agent are you using?"
# Should show: [CCR: Active Agent: <uuid> (provider,model)]
```

### Use Case 5: Use Router Defaults

```bash
# Add project without configuring specific models
ccr project add ~/my-project

# Skip all model prompts (press Enter)
dev.md [default]: [Enter]
sm.md [default]: [Enter]
ux-designer.md [default]: [Enter]

# All agents will use Router.default from config.json
# Configure default models in config.json:
# {
#   "Router": {
#     "default": "openai,gpt-4o"
#   }
# }
```

## Related Commands

- [ccr model](/docs/cli/commands/model) - Configure router models
- [ccr start](/docs/cli/commands/start) - Start the router server
- [ccr status](/docs/cli/commands/status) - Check router status
- [Team: Git Workflow](/docs/team/git-workflow) - Learn about sharing agents via git
- [Team: Onboarding](/docs/team/onboarding) - New team member setup guide

## Troubleshooting

### Agent not detected after adding project

**Solution:** Run `ccr project scan <project-id>` to rescan for agents.

### Model configuration prompt not appearing

**Solution:** Use `ccr project configure <project-id>` to manually configure models.

### Agent ID not found error

**Solution:** Ensure agent file has `CCR-AGENT-ID` comment. If missing, run `ccr project scan <project-id>`.

### Project path invalid

**Solution:** Use absolute path, not relative. Example: `/home/user/project` not `~/project` or `./project`.
