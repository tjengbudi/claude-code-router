# Team Member Onboarding Guide

This guide helps new team members get started with CCR agent routing in under 15 minutes.

## Prerequisites

Before starting, ensure you have:

- **Node.js** >= 18.0.0 installed
- **Git** access to your team's repository
- **API keys** for the LLM providers your team uses
  - OpenAI API key (if using OpenAI models)
  - Anthropic API key (if using Anthropic models)
  - Other provider keys as configured by your team

## Quick Start (15 Minutes)

### Step 1: Clone Your Team's Repository (2 minutes)

```bash
git clone <your-team-repo-url>
cd <your-team-repo>
```

### Step 2: Install CCR Globally (3 minutes)

```bash
npm install -g @musistudio/claude-code-router
```

Verify installation:

```bash
ccr --version
ccr status
```

### Step 3: Scan Project to Detect Agents (2 minutes)

```bash
# Scan the project to detect agents
ccr project scan <project-id>
```

The system will:
1. Detect all agents in `.bmad/bmm/agents/`
2. Read existing `CCR-AGENT-ID` tags from agent files
3. Prompt you to configure models for each agent

Example prompt:
```
Found 3 agents:

Configure model for dev.md (provider,model): openai,gpt-4o
Configure model for sm.md (provider,model): anthropic,claude-haiku
Configure model for pm.md (provider,model): [enter to skip, uses Router.default]
```

### Step 4: Configure Your API Keys (5 minutes)

#### Option A: Interactive Configuration (Recommended)

```bash
ccr model
```

This launches an interactive prompt to configure your providers and API keys.

#### Option B: Manual Configuration

Edit `~/.claude-code-router/config.json`:

```json5
{
  Providers: {
    openai: {
      HOST: "https://api.openai.com/v1",
      APIKEY: "sk-your-openai-api-key-here"
    },
    anthropic: {
      HOST: "https://api.anthropic.com/v1",
      APIKEY: "sk-ant-your-anthropic-api-key-here"
    }
  }
}
```

**Important:** Never commit your `config.json` file - it contains secrets!

### Step 5: Start Working (4 minutes)

You're ready! CCR agent routing is configured with your chosen models.

```bash
# In your project directory
cd /path/to/your/project

# Use CCR - agent routing works automatically
ccr code "Help me implement user authentication"
```

## What's Different About This Workflow

### Agent Files Come From Git

Unlike other tools that require manual configuration files, CCR discovers agents directly from agent markdown files committed to git:

- **Agent definitions** are shared via version control
- **Each team member** configures their own model preferences
- **No manual setup** required - just `git pull` and `ccr project scan`

### Independent Model Configuration

Each team member maintains their own `projects.json` in `~/.claude-code-router/`:

```
Team member A: dev.md → openai,gpt-4o
Team member B: dev.md → anthropic,claude-sonnet-4
```

Both work correctly with the same agent file!

## Verifying Your Setup

### Check Agent Configuration

```bash
# List all configured projects
ccr project list

# View project details
ccr project info <project-id>
```

### Test Agent Routing

```bash
# Test with a simple request
ccr code "Say hello from CCR"

# Check which model was used in logs
tail -f ~/.claude-code-router/claude-code-router.log
```

## Understanding Your Team's Configuration

### Agent Model Assignments

Each agent in your project is assigned to a model by YOU (not forced by the team):

| Agent File | Your Model | Purpose |
|------------|-----------|---------|
| `dev.md` | Your choice | Development tasks |
| `sm.md` | Your choice | Scrum Master tasks |
| `pm.md` | Your choice | Project Management |

*(Your model choices may differ from teammates)*

### How Routing Works

When you run `ccr code`, the system:
1. Detects which agent file you're working in
2. Looks up the CCR-AGENT-ID from the agent file
3. Finds your model preference from `~/.claude-code-router/projects.json`
4. Routes your request to your chosen model
5. Returns the response

## Common Onboarding Issues

### Issue: "Project not found"

**Cause:** The project hasn't been registered yet.

**Solution:** Run `ccr project scan <project-id>` to register and detect agents.

### Issue: "API key not configured"

**Cause:** Your `config.json` is missing or incomplete.

**Solution:** Configure your API keys:
```bash
ccr model
```

### Issue: "Agent has no model configured"

**Cause:** The agent uses Router.default (fallback to your default model).

**Solution:** Either:
- Configure the agent: `ccr project configure <project-id>`
- Ensure your Router.default is set in `config.json`

### Issue: "Agent not detected after git pull"

**Cause:** You need to run `ccr project scan` to detect new agents from git.

**Solution:**
```bash
ccr project scan <project-id>
```

## Workflow Summary

### Adding New Agents (For Later)

When you want to add a new agent type:

1. Create agent file in `.bmad/bmm/agents/new-agent.md`
2. Run `ccr project scan <project-id>` to inject CCR-AGENT-ID
3. Configure your preferred model
4. Commit agent file: `git add .bmad/bmm/agents/new-agent.md`
5. Team members pull and run `ccr project scan` to detect it

### Receiving New Agents from Teammates

When a teammate adds a new agent:

1. `git pull` to receive the agent file
2. Run `ccr project scan <project-id>` to detect it
3. Configure your preferred model for the agent
4. Start working with the new agent

## Next Steps

### Learn More About CCR

- [CLI Commands Reference](/cli/commands/other)
- [Git-Based Agent Sharing](/team/git-workflow)
- [Configuration Guide](/cli/config/basic)

### Customize Your Setup

Once you're comfortable with the basics, you can:

1. **Reconfigure agent models:**
   ```bash
   ccr project configure <project-id>
   ```

2. **Set your default model:**
   ```bash
   ccr model
   # Set Router.default to your preferred model
   ```

3. **Create custom presets:**
   ```bash
   ccr preset export my-config
   ```

### Join Your Team's Workflow

1. **Join team chat** where agent definitions are discussed
2. **Subscribe to pull requests** affecting `.bmad/bmm/agents/`
3. **Coordinate changes** - agent files are shared via git
4. **Document your choices** in commit messages

## Getting Help

### Check Logs

If something isn't working:

```bash
# Application logs
tail -f ~/.claude-code-router/claude-code-router.log

# Server logs (if running)
tail -f ~/.claude-code-router/logs/ccr-server.log
```

### Verify Configuration

```bash
# Check CCR status
ccr status

# List configured projects
ccr project list

# View model configuration
ccr model
```

### Contact Your Team

- Ask in team chat about agent configuration conventions
- Check pull requests for recent agent additions
- Review `.bmad/bmm/agents/` for examples

### External Resources

- [CCR Documentation](/cli/intro)
- [GitHub Issues](https://github.com/musistudio/claude-code-router/issues)

## Security Reminders

### Do's ✅

- ✅ Pull agent `.md` files from git
- ✅ Run `ccr project scan` to detect agents
- ✅ Keep API keys in `config.json` (not in git)
- ✅ Use environment variables for CI/CD

### Don'ts ❌

- ❌ Commit your `config.json` file
- ❌ Share API keys in chat or email
- ❌ Put API keys in environment-specific config files that get committed
- ❌ Hard-code API keys in scripts
- ❌ Commit `projects.json` (it's local-only in `~/.claude-code-router/`)

## Checklist

Use this checklist to verify your onboarding is complete:

- [ ] Repository cloned
- [ ] CCR installed globally (`npm install -g @musistudio/claude-code-router`)
- [ ] Project scanned with `ccr project scan <project-id>`
- [ ] API keys configured in `~/.claude-code-router/config.json`
- [ ] Can run `ccr code` successfully
- [ ] Agent routing works for team's agents
- [ ] Joined team chat for coordination
- [ ] Reviewed team's agent files in `.bmad/bmm/agents/`

**Welcome to the team! 🎉**

You're now ready to use CCR with your team's shared agent definitions and your own model preferences.
