---
sidebar_position: 3
---

# Quick Start

Get up and running with Claude Code Router in 5 minutes.

## 1. Configure the Router

Before using Claude Code Router, you need to configure your LLM providers. You can either:

### Option A: Edit Configuration File Directly

Edit `~/.claude-code-router/config.json`:

```json
{
  "HOST": "0.0.0.0",
  "PORT": 8080,
  "Providers": [
    {
      "name": "openai",
      "api_base_url": "https://api.openai.com/v1/chat/completions",
      "api_key": "your-api-key-here",
      "models": ["gpt-4", "gpt-3.5-turbo"]
    }
  ],
  "Router": {
    "default": "openai,gpt-4"
  }
}
```

### Option B: Use Web UI

```bash
ccr ui
```

This will open the web interface where you can configure providers visually.

## 2. Start the Router

```bash
ccr start
```

The router will start on `http://localhost:8080` by default.

## 3. Use Claude Code

Now you can use Claude Code normally:

```bash
ccr code
```

Your requests will be routed through Claude Code Router to your configured provider.

## Restart After Configuration Changes

If you modify the configuration file or make changes through the Web UI, restart the service:

```bash
ccr restart
```

Or restart directly through the Web UI.

## Agent System Quick Start

The CCR agent system enables automatic model routing based on which agent is active in Claude Code. Set up in under 5 minutes.

### Step 1: Create Your Agent (1 minute)

Create an agent file in your project:

```bash
# Navigate to your project
cd ~/my-project

# Create agents directory
mkdir -p .bmad/bmm/agents

# Create a simple agent
cat > .bmad/bmm/agents/dev.md << 'EOF'
# Dev Agent

You are a development assistant. Help with coding tasks, debugging, and implementation.
EOF
```

### Step 2: Register Your Project (1 minute)

Add your project to CCR:

```bash
ccr project add ~/my-project
```

CCR will automatically:
- Scan for agent files
- Inject unique IDs into each agent
- Prompt you to configure models

**Example output:**

```bash
$ ccr project add ~/my-project

Scanning /home/user/my-project for agents...

Found 1 agent:
  .bmad/bmm/agents/dev.md

Registering project...
Project ID: 550e8400-e29b-41d4-a716-446655440000
Project name: my-project

Configure agent models (press Enter to use Router.default):
  dev.md [default]: openai,gpt-4o

Project registered successfully!
```

### Step 3: Verify Agent Routing (1 minute)

Test that agent routing works:

```bash
ccr code "Which agent are you using?"
```

You should see:

```
[CCR: Active Agent: 550e8400-e29b-41d4-a716-446655440001 (openai,gpt-4o)]

I'm the Dev Agent, using the openai,gpt-4o model...
```

### Step 4: Share Agents with Your Team (2 minutes)

Commit your agent files to git for team sharing:

```bash
# Agent files are safe to commit (no secrets)
git add .bmad/bmm/agents/dev.md
git commit -m "feat(agents): add dev agent"
git push origin main
```

**Team members receive agents by:**

```bash
# Pull changes
git pull origin main

# Scan project to detect new agents
ccr project scan my-project

# Configure their own models
dev.md: anthropic,claude-3-5-sonnet
```

Each team member configures their own models independently!

### Quick Verification Checklist

- [ ] Agent file created in `.bmad/bmm/agents/`
- [ ] Project added with `ccr project add`
- [ ] Agent has `CCR-AGENT-ID` tag (check with `cat .bmad/bmm/agents/dev.md`)
- [ ] Model configured (or set to use Router.default)
- [ ] `ccr code` shows agent identity at start of response

### What's Next?

- [CLI Project Commands](/docs/cli/commands/project) - Complete `ccr project` command reference
- [Team: Git Workflow](/docs/team/git-workflow) - Learn about sharing agents via git
- [Team: Onboarding](/docs/team/onboarding) - New team member setup guide
- [Migration Guide](/docs/migration/from-ccr-custom) - Migrating from ccr-custom
