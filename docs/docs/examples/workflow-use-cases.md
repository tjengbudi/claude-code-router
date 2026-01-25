---
sidebar_position: 2
title: Workflow Use Cases
---

# Workflow Use Cases & Model Recommendations

This guide provides real-world workflow configuration examples with recommended models for different use cases. Each use case includes specific configuration examples and trade-off analysis.

## Overview

Workflows are task-specific routing rules that complement agent-based routing. While agents answer "Who should do this?" (role-specific), workflows answer "What task is being performed?" (task-specific).

| Aspect | Agents | Workflows |
|--------|--------|-----------|
| **Question Answered** | Who should do this? | What task is being performed? |
| **Examples** | dev, architect, analyst | correct-course, create-story, sprint-planning |
| **Scope** | Role-based (continuing identity) | Task-based (specific activity) |
| **Configuration** | `.bmad/bmm/agents/*.md` | `.bmad/bmm/workflows/*/workflow.yaml` |

## Use Case 1: Reasoning-Heavy Workflows

**Workflows:** `correct-course`, architectural decision-making, complex problem solving

**Recommended Model:** DeepSeek R1 (`deepseek,deepseek-r1`) or OpenAI o1 (`openai,o1`)

**Rationale:** These workflows require strong reasoning capabilities for complex decisions, trade-off analysis, and multi-step problem solving.

### Configuration Example

```bash
$ ccr project configure my-bmm-project

--- Workflows ---
  correct-course: deepseek,deepseek-r1
  architectural-review: deepseek,deepseek-r1
```

### projects.json Entry

```json5
{
  schemaVersion: "1.0.0",
  projects: {
    "550e8400-e29b-41d4-a716-446655440000": {
      id: "550e8400-e29b-41d4-a716-446655440000",
      name: "my-bmm-project",
      path: "/home/user/my-bmm-project",
      workflows: {
        "660e8400-e29b-41d4-a716-446655440001": {
          id: "660e8400-e29b-41d4-a716-446655440001",
          name: "correct-course",
          relativePath: ".bmad/bmm/workflows/correct-course",
          absolutePath: "/home/user/my-bmm-project/.bmad/bmm/workflows/correct-course",
          model: "deepseek,deepseek-r1"
        },
        "660e8400-e29b-41d4-a716-446655440002": {
          id: "660e8400-e29b-41d4-a716-446655440002",
          name: "architectural-review",
          relativePath: ".bmad/bmm/workflows/architectural-review",
          absolutePath: "/home/user/my-bmm-project/.bmad/bmm/workflows/architectural-review",
          model: "deepseek,deepseek-r1"
        }
      }
    }
  }
}
```

### Trade-offs

| Factor | DeepSeek R1 | OpenAI o1 |
|--------|------------|-----------|
| **Cost** | Lower (~$0.55/1M tokens) | Higher (~$15/1M tokens) |
| **Reasoning Quality** | Excellent | Excellent |
| **Speed** | Moderate | Slower (extensive reasoning) |
| **Availability** | Widely available | Limited access |

## Use Case 2: Cost-Optimized Workflows

**Workflows:** Documentation generation, quick updates, simple transformations

**Recommended Model:** Claude Haiku (`anthropic,claude-haiku`) or GPT-4o Mini (`openai,gpt-4o-mini`)

**Rationale:** These workflows are high-volume, low-complexity tasks where cost efficiency matters more than reasoning capability.

### Configuration Example

```bash
$ ccr project configure my-bmm-project

--- Workflows ---
  generate-docs: anthropic,claude-haiku
  update-changelog: anthropic,claude-haiku
  format-code: openai,gpt-4o-mini
```

### projects.json Entry

```json5
{
  workflows: {
    "770e8400-e29b-41d4-a716-446655440001": {
      id: "770e8400-e29b-41d4-a716-446655440001",
      name: "generate-docs",
      relativePath: ".bmad/bmm/workflows/generate-docs",
      absolutePath: "/home/user/my-bmm-project/.bmad/bmm/workflows/generate-docs",
      model: "anthropic,claude-haiku"
    }
  }
}
```

### Trade-offs

| Factor | Claude Haiku | GPT-4o Mini |
|--------|--------------|-------------|
| **Cost** | ~$0.25/1M tokens | ~$0.15/1M tokens |
| **Speed** | Very fast | Fast |
| **Quality** | Good for simple tasks | Good for simple tasks |
| **Context** | 200K tokens | 128K tokens |

## Use Case 3: Multi-Step Complex Workflows

**Workflows:** `create-story`, `sprint-planning`, `testarch` (test architecture)

**Recommended Model:** GPT-4o (`openai,gpt-4o`) or Claude 3.5 Sonnet (`anthropic,claude-3.5-sonnet`)

**Rationale:** These workflows require a balance of quality, speed, and cost for multi-step processes.

### Configuration Example

```bash
$ ccr project configure my-bmm-project

--- Workflows ---
  create-story: openrouter,anthropic/claude-3.5-sonnet
  sprint-planning: openrouter,anthropic/claude-3.5-sonnet
  testarch: openai,gpt-4o
```

### projects.json Entry

```json5
{
  workflows: {
    "880e8400-e29b-41d4-a716-446655440001": {
      id: "880e8400-e29b-41d4-a716-446655440001",
      name: "create-story",
      relativePath: ".bmad/bmm/workflows/create-story",
      absolutePath: "/home/user/my-bmm-project/.bmad/bmm/workflows/create-story",
      model: "openrouter,anthropic/claude-3.5-sonnet"
    }
  }
}
```

### Trade-offs

| Factor | GPT-4o | Claude 3.5 Sonnet |
|--------|--------|-------------------|
| **Cost** | ~$2.50/1M tokens | ~$3/1M tokens |
| **Speed** | Fast | Fast |
| **Quality** | Excellent | Excellent |
| **Code** | Strong | Stronger |
| **Tool Use** | Excellent | Excellent |

## Use Case 4: Code-Focused Workflows

**Workflows:** Implementation, refactoring, code review, test generation

**Recommended Model:** Claude 3.5 Sonnet (`anthropic,claude-3.5-sonnet`) or Qwen Coder (`qwen,qwen-coder-plus`)

**Rationale:** These models have excellent code understanding and generation capabilities.

### Configuration Example

```bash
$ ccr project configure my-bmm-project

--- Workflows ---
  dev-story: anthropic,claude-3.5-sonnet
  code-review: anthropic,claude-3.5-sonnet
  refactor: qwen,qwen-coder-plus
```

### projects.json Entry

```json5
{
  workflows: {
    "990e8400-e29b-41d4-a716-446655440001": {
      id: "990e8400-e29b-41d4-a716-446655440001",
      name: "dev-story",
      relativePath: ".bmad/bmm/workflows/dev-story",
      absolutePath: "/home/user/my-bmm-project/.bmad/bmm/workflows/dev-story",
      model: "anthropic,claude-3.5-sonnet"
    }
  }
}
```

### Trade-offs

| Factor | Claude 3.5 Sonnet | Qwen Coder |
|--------|-------------------|------------|
| **Cost** | ~$3/1M tokens | Lower |
| **Code Quality** | Excellent | Excellent |
| **Languages** | All major languages | Strong on popular languages |
| **Speed** | Fast | Fast |

## Use Case 5: Multi-Agent Workflow with Workflow Routing

**Scenario:** Complex BMad workflows that use multiple agents and workflows together

**Configuration:** Different models for agents and workflows

### Configuration Example

```bash
$ ccr project configure my-bmm-project

--- Agents ---
  dev.md: openai,gpt-4o
  architect.md: openrouter,anthropic/claude-3.5-sonnet
  analyst.md: gemini,gemini-1.5-flash

--- Workflows ---
  create-story: openrouter,anthropic/claude-3.5-sonnet
  sprint-planning: gemini,gemini-1.5-flash
  correct-course: deepseek,deepseek-r1
```

### projects.json Entry

```json5
{
  projects: {
    "550e8400-e29b-41d4-a716-446655440000": {
      id: "550e8400-e29b-41d4-a716-446655440000",
      name: "my-bmm-project",
      path: "/home/user/my-bmm-project",
      agents: {
        "550e8400-e29b-41d4-a716-446655440001": {
          id: "550e8400-e29b-41d4-a716-446655440001",
          name: "dev.md",
          relativePath: ".bmad/bmm/agents/dev.md",
          absolutePath: "/home/user/my-bmm-project/.bmad/bmm/agents/dev.md",
          model: "openai,gpt-4o"
        },
        "550e8400-e29b-41d4-a716-446655440002": {
          id: "550e8400-e29b-41d4-a716-446655440002",
          name: "architect.md",
          relativePath: ".bmad/bmm/agents/architect.md",
          absolutePath: "/home/user/my-bmm-project/.bmad/bmm/agents/architect.md",
          model: "openrouter,anthropic/claude-3.5-sonnet"
        }
      },
      workflows: {
        "660e8400-e29b-41d4-a716-446655440001": {
          id: "660e8400-e29b-41d4-a716-446655440001",
          name: "create-story",
          relativePath: ".bmad/bmm/workflows/create-story",
          absolutePath: "/home/user/my-bmm-project/.bmad/bmm/workflows/create-story",
          model: "openrouter,anthropic/claude-3.5-sonnet"
        },
        "660e8400-e29b-41d4-a716-446655440002": {
          id: "660e8400-e29b-41d4-a716-446655440002",
          name: "correct-course",
          relativePath: ".bmad/bmm/workflows/correct-course",
          absolutePath: "/home/user/my-bmm-project/.bmad/bmm/workflows/correct-course",
          model: "deepseek,deepseek-r1"
        }
      }
    }
  }
}
```

### How Routing Works

1. **Agent-only context**: Routes to agent's configured model
   - Example: Active agent is `dev.md` → Routes to `openai,gpt-4o`

2. **Workflow-only context**: Routes to workflow's configured model
   - Example: Active workflow is `correct-course` → Routes to `deepseek,deepseek-r1`

3. **Both agent and workflow**: Workflow takes priority
   - Example: Agent `dev.md` + Workflow `create-story` → Routes to workflow's model

## Recommendations Summary

| Workflow Type | Recommended Model | Cost Priority | Quality Priority |
|---------------|-------------------|---------------|------------------|
| **Reasoning-heavy** | DeepSeek R1, OpenAI o1 | Low | High |
| **Simple tasks** | Claude Haiku, GPT-4o Mini | High | Low |
| **Multi-step** | GPT-4o, Claude 3.5 Sonnet | Medium | High |
| **Code-focused** | Claude 3.5 Sonnet, Qwen Coder | Medium | High |

## Cost Optimization Strategies

### Strategy 1: Tiered Workflow Routing

Assign different models based on workflow complexity:

```bash
# High-value workflows (reasoning, decisions)
correct-course: deepseek,deepseek-r1
architectural-review: openai,o1

# Medium-value workflows (story creation, planning)
create-story: openrouter,anthropic/claude-3.5-sonnet
sprint-planning: gemini,gemini-1.5-flash

# Low-value workflows (documentation, formatting)
generate-docs: anthropic,claude-haiku
format-code: openai,gpt-4o-mini
```

### Strategy 2: Development vs Production

Use different models for development and production:

```bash
# Development: Fast, cost-effective
dev-correct-course: gemini,gemini-1.5-flash
dev-create-story: openai,gpt-4o-mini

# Production: High-quality results
prod-correct-course: deepseek,deepseek-r1
prod-create-story: openrouter,anthropic/claude-3.5-sonnet
```

### Strategy 3: Time-of-Day Routing

Use cost-effective models during high-volume periods:

```bash
# Business hours (9am-5pm): Premium models
correct-course: deepseek,deepseek-r1

# After hours (5pm-9am): Cost-optimized
correct-course: gemini,gemini-1.5-flash
```

## Troubleshooting

### Workflow routing not working

1. Check CCR-WORKFLOW-ID is in workflow.yaml:
   ```bash
   cat .bmad/bmm/workflows/correct-course/workflow.yaml
   # Should contain: # CCR-WORKFLOW-ID: uuid
   ```

2. Verify workflow model is configured:
   ```bash
   ccr project list | grep -A 10 "Workflows"
   ```

3. Check logs for routing decisions:
   ```bash
   tail -f ~/.claude-code-router/claude-code-router.log
   ```

### Model not applied to workflow

1. Reconfigure workflow model:
   ```bash
   ccr project configure <project-id>
   # Select workflow and set model
   ```

2. Verify model string format:
   ```bash
   # Correct: provider,model
   # Example: deepseek,deepseek-r1
   # Wrong: deepseek-r1 (missing provider)
   ```

### Workflow not detected

1. Verify workflow file location:
   ```bash
   # Must be at: .bmad/bmm/workflows/*/workflow.yaml
   ls -la .bmad/bmm/workflows/*/workflow.yaml
   ```

2. Rescan project:
   ```bash
   ccr project scan <project-id>
   ```

## Next Steps

- [Set up your first workflow](./workflow-setup)
- [CLI project command reference](/docs/cli/commands/project)
- [Main README - Workflow Support](/)
