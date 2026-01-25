---
sidebar_position: 7
---

# ccr project

Manage projects and configure agent and workflow models for automatic routing.

## Usage

```bash
ccr project [command]
```

## Commands

### Add Project

Register a new project and scan for agent files and workflows:

```bash
ccr project add <path>
```

The `<path>` should be the absolute path to your project directory.

**What it does:**
- Scans the project for agent files in `.claude/agents/` or `.bmad/bmm/agents/`
- Scans the project for workflow files in `.bmad/bmm/workflows/*/workflow.yaml`
- Assigns unique IDs to each agent (injected as `CCR-AGENT-ID` comments)
- Assigns unique IDs to each workflow (injected as `CCR-WORKFLOW-ID` comments)
- Registers the project in `~/.claude-code-router/projects.json`
- Use `ccr project configure <id>` to configure models for agents and workflows

**Example with Agents and Workflows:**

```bash
$ ccr project add /home/user/my-project

✓ Project added: my-project (550e8400-e29b-41d4-a716-446655440000)
  Path: /home/user/my-project
  Agents discovered: 3
  Workflows discovered: 2

  Agents with injected UUIDs:
  ├─ dev.md → CCR-AGENT-ID: 550e8400-e29b-41d4-a716-446655440001
  ├─ sm.md → CCR-AGENT-ID: 550e8400-e29b-41d4-a716-446655440002
  └─ ux-designer.md → CCR-AGENT-ID: 550e8400-e29b-41d4-a716-446655440003

  Workflows:
  ├─ correct-course
     Keep project on track and resolve blockers
  └─ create-story
     Create a story from requirements

  Next steps:
  • Configure agent models: ccr project configure 550e8400-e29b-41d4-a716-446655440000
  • Commit and push to share with your team:
      mkdir -p .claude-code-router
      cp ~/.claude-code-router/projects.json .claude-code-router/projects.json
      git add .claude-code-router/projects.json
      git commit -m "Add project: my-project"
```

### List Projects

Display all registered projects with their agents and workflows:

```bash
ccr project list
```

**Example output:**

```bash
$ ccr project list

📦 Registered Projects (2)

1. my-project
   ID: 550e8400-e29b-41d4-a716-446655440000
   Path: /home/user/my-project
   Agents: 3 (2 configured, 1 default)
   Workflows: 2 (1 configured, 1 default)
   Agent Details:
   ├─ dev.md → openai,gpt-4o
      CCR-AGENT-ID: 550e8400-e29b-41d4-a716-446655440001
   ├─ sm.md → anthropic,claude-haiku
      CCR-AGENT-ID: 550e8400-e29b-41d4-a716-446655440002
   └─ ux-designer.md → [default]
      CCR-AGENT-ID: 550e8400-e29b-41d4-a716-446655440003
   Workflow Details:
   ├─ correct-course → deepseek,deepseek-r1
   └─ create-story → [default]

2. another-project
   ID: 660e8400-e29b-41d4-a716-446655440001
   Path: /home/user/another-project
   Agents: 1 (1 configured, 0 default)
   Workflows: 1 (1 configured, 0 default)
   Agent Details:
   └─ analyst.md → deepseek,deepseek-chat
      CCR-AGENT-ID: 660e8400-e29b-41d4-a716-446655440002
   Workflow Details:
   └─ sprint-planning → openrouter,anthropic/claude-3.5-sonnet
```

### Configure Project

Interactively configure models for agents and workflows in a project:

```bash
ccr project configure <project-id>
```

You can use either the project name or the UUID.

**What it does:**
- Displays current agent and workflow configurations
- Prompts you to change model assignments
- Updates `~/.claude-code-router/projects.json`

**Example:**

```bash
$ ccr project configure my-project

--- Agents ---
  dev.md → openai,gpt-4o
  sm.md → anthropic,claude-haiku
  ux-designer.md → [default]

--- Workflows ---
  correct-course → deepseek,deepseek-r1
  create-story → [default]

? Select entity to configure:
❯ correct-course (workflow)

? Select model for workflow: correct-course
❯ deepseek,deepseek-r1 (reasoning for complex decisions)

✓ correct-course → deepseek,deepseek-r1
```

### Scan Project

Rescan a project for new or modified agents and workflows:

```bash
ccr project scan <project-id>
```

**What it does:**
- Detects new agent files without `CCR-AGENT-ID` tags
- Detects new workflow files without `CCR-WORKFLOW-ID` tags
- Injects unique IDs into new agents and workflows
- Prompts for model configuration for new agents only
- Configure workflows later with `ccr project configure <id>`
- Updates `~/.claude-code-router/projects.json`

**When to use:**
- After pulling new agents or workflows from git
- After creating new agent or workflow files manually
- When agents or workflows aren't being detected

**Example:**

```bash
$ ccr project scan my-project

✓ Project rescan complete:

  Found 1 new agent(s):
  ├─ architect.md

  Found 1 new workflow(s):
  └─ sprint-planning

  Total agents: 4
  Total workflows: 2
```

## Configuration Files

### projects.json Schema

The `projects.json` file stores project, agent, and workflow configurations:

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
      },
      workflows: {
        "<workflow-uuid>": {
          id: "<workflow-uuid>",
          name: "workflow-name",
          relativePath: ".bmad/bmm/workflows/workflow-name",
          absolutePath: "/absolute/path/to/workflow-name",
          model: "provider,model"  // Optional - uses Router.default if not set
        }
      }
    }
  }
}
```

**Notes:**
- File format is JSON5 (supports comments and trailing commas)
- The `model` field is optional - if omitted, the agent/workflow uses `Router.default`
- Local by default; copy into your repo (e.g., `.claude-code-router/projects.json`) to share
- Each team member can override with their own model preferences
- No API keys or secrets are stored in this file (safe for local storage)

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

### Workflow File Format

Workflow files use YAML comments to store metadata in workflow.yaml:

```yaml
name: my-workflow
description: "My workflow description"
# CCR-WORKFLOW-ID: 660e8400-e29b-41d4-a716-446655440000

# Workflow configuration continues...
```

**Important:**
- `CCR-WORKFLOW-ID` is injected automatically by CCR
- Do not edit this tag manually
- Workflow files are committed to git (shared across team)
- Model assignments are NOT stored in workflow files (only in `projects.json`)

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

# 5. Configure models
ccr project configure <project-id>

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

### Workflow not detected during scan

**Solution:**
1. Verify workflow.yaml exists in `.bmad/bmm/workflows/*/workflow.yaml`
2. Run `ccr project scan <id>` to rescan
3. Check that workflow.yaml has valid YAML syntax

**Example:**
```bash
# Verify workflow file exists
ls -la .bmad/bmm/workflows/correct-course/workflow.yaml

# Rescan project
ccr project scan my-project
```

### Workflow routing not working

**Solution:**
1. Check CCR-WORKFLOW-ID is injected in workflow.yaml
2. Verify workflow model is configured in projects.json
3. Check logs for routing decisions

**Example:**
```bash
# Check workflow file has ID
cat .bmad/bmm/workflows/correct-course/workflow.yaml
# Should contain: # CCR-WORKFLOW-ID: uuid

# Verify configuration
cat ~/.claude-code-router/projects.json | grep workflows

# Check logs
tail -f ~/.claude-code-router/claude-code-router.log
```

### Model not applied to workflow

**Solution:**
1. Run `ccr project list` to see current configuration
2. Use `ccr project configure <id>` to set workflow model
3. Verify model string format is `provider,model`

**Example:**
```bash
# View current configuration
ccr project list my-project

# Reconfigure workflow model
ccr project configure my-project
# Select workflow and set model (e.g., deepseek,deepseek-r1)
```
