---
sidebar_position: 1
title: Workflow Setup Guide
---

# Workflow Setup Guide

This guide provides step-by-step instructions for setting up workflow routing in CCR Enhanced Edition. Workflows allow you to route specific development tasks (like `correct-course`, `create-story`) to different models based on the task requirements.

## Prerequisites

- CCR Enhanced Edition v2.0+ installed
- A BMad project with workflow definitions
- Basic understanding of CCR project management

## Complete Setup Example

Follow this complete example from project registration to workflow routing.

### Step 1: Add Your Project

Register your BMad project with CCR to discover workflows:

```bash
$ ccr project add /home/user/my-bmm-project

✓ Project added: my-bmm-project (550e8400-e29b-41d4-a716-446655440000)
  Path: /home/user/my-bmm-project
  Agents discovered: 5
  Workflows discovered: 3

  Agents with injected UUIDs:
  ├─ dev.md → CCR-AGENT-ID: 550e8400-e29b-41d4-a716-446655440001
  ├─ sm.md → CCR-AGENT-ID: 550e8400-e29b-41d4-a716-446655440002
  ├─ ux-designer.md → CCR-AGENT-ID: 550e8400-e29b-41d4-a716-446655440003
  ├─ analyst.md → CCR-AGENT-ID: 550e8400-e29b-41d4-a716-446655440004
  └─ tech-writer.md → CCR-AGENT-ID: 550e8400-e29b-41d4-a716-446655440005

  Workflows:
  ├─ correct-course
     Keep project on track and resolve blockers
  ├─ create-story
     Create a story from requirements
  └─ sprint-planning
     Plan the next sprint

Project registered successfully!
```

**What happened:**
1. CCR scanned your project for agents (`.bmad/bmm/agents/*.md`) and workflows (`.bmad/bmm/workflows/*/workflow.yaml`)
2. CCR injected unique IDs (`CCR-AGENT-ID` and `CCR-WORKFLOW-ID`) into each file
3. CCR registered the project in `~/.claude-code-router/projects.json`
4. Configure models with `ccr project configure <project-id>`

### Step 2: Configure Workflow Models

Configure models for each workflow based on task requirements:

```bash
$ ccr project configure my-bmm-project

--- Agents ---
  dev.md: openai,gpt-4o
  sm.md: anthropic,claude-haiku
  ux-designer.md: [Router.default]
  analyst.md: gemini,gemini-1.5-flash
  tech-writer.md: [Router.default]

--- Workflows ---
  correct-course: [Router.default]
  create-story: [Router.default]
  sprint-planning: [Router.default]

? Select entity to configure:
❯ correct-course (workflow)

? Select model for workflow: correct-course
❯ deepseek,deepseek-r1 (reasoning for complex decisions)
  openai,gpt-4o
  anthropic,claude-3.5-sonnet
  gemini,gemini-1.5-flash

✓ correct-course → deepseek,deepseek-r1

? Select entity to configure:
❯ create-story (workflow)

? Select model for workflow: create-story
❯ openrouter,anthropic/claude-3.5-sonnet
  deepseek,deepseek-chat
  gemini,gemini-1.5-flash

✓ create-story → openrouter,anthropic/claude-3.5-sonnet

? Select entity to configure:
❯ sprint-planning (workflow)

? Select model for workflow: sprint-planning
❯ gemini,gemini-1.5-flash (cost-effective for multi-step)
  anthropic,claude-haiku

✓ sprint-planning → gemini,gemini-1.5-flash
```

**What happened:**
1. CCR displayed current configuration for all agents and workflows
2. You selected each workflow to configure
3. You selected a model for each workflow based on task requirements
4. CCR updated `~/.claude-code-router/projects.json` with your choices

### Step 3: Verify Configuration

Verify your workflow configuration:

```bash
$ ccr project list

Registered Projects:

my-bmm-project (550e8400-e29b-41d4-a716-446655440000)
  Path: /home/user/my-bmm-project
  Agents (5):
    ├─ dev.md (openai,gpt-4o)
    ├─ sm.md (anthropic,claude-haiku)
    ├─ ux-designer.md [Router.default]
    ├─ analyst.md (gemini,gemini-1.5-flash)
    └─ tech-writer.md [Router.default]
  Workflows (3):
    ├─ correct-course (deepseek,deepseek-r1)
    ├─ create-story (openrouter,anthropic/claude-3.5-sonnet)
    └─ sprint-planning (gemini,gemini-1.5-flash)
```

### Step 4: Use Workflow Routing

Workflows now route automatically. When you run a workflow, CCR detects the active workflow and routes to the configured model:

```bash
# Run your workflow as usual (via Claude Code/BMad workflow invocation)
# CCR automatically detects:
# - Active workflow: correct-course
# - Workflow ID: 660e8400-e29b-41d4-a716-446655440001
# - Configured model: deepseek,deepseek-r1
# - Routes request to: deepseek,deepseek-r1
```

**Key benefits:**
- **No manual model selection**: CCR detects the workflow and routes automatically
- **Task-optimized routing**: Each workflow uses the best model for its task
- **Session caching**: Subsequent requests in the same session use cached model lookup (<10ms)

### Step 5: Share Workflow Configuration

Share workflow definitions via git while keeping model preferences local:

```bash
# On your machine
cd /home/user/my-bmm-project

# Commit workflow files with CCR-WORKFLOW-ID tags
git add .bmad/bmm/workflows/*/workflow.yaml
git commit -m "feat: add CCR workflow ID tags"
git push origin main

# Optional: share routing configuration
mkdir -p .claude-code-router
cp ~/.claude-code-router/projects.json .claude-code-router/projects.json
git add .claude-code-router/projects.json
git commit -m "feat: share workflow routing config"
git push origin main

# On teammate's machine
git pull origin main

# Scan to detect new workflows
$ ccr project scan my-bmm-project

✓ Project rescan complete:

  Found 1 new workflow(s):
  └─ correct-course

  Total agents: 5
  Total workflows: 3

# Each teammate configures their own model preferences
# while sharing the same workflow definitions
```

## Validation Checklist

Verify your setup is complete:

- [ ] Project added with `ccr project add <path>`
- [ ] Workflows discovered (check output for "Workflows:")
- [ ] CCR-WORKFLOW-ID injected into workflow.yaml files
- [ ] Workflow models configured with `ccr project configure <id>`
- [ ] Configuration verified with `ccr project list`
- [ ] Workflow files committed to git
- [ ] `~/.claude-code-router/projects.json` contains workflow entries

## Next Steps

- [Configure workflow models for specific use cases](./workflow-use-cases)
- [Learn about CLI project commands](/docs/cli/commands/project)
- [Understand workflow vs agent routing](/docs/) - See main README
