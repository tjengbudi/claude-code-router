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

### Step 3: Copy Team Configurations (1 minute)

```bash
# Create CCR directory if it doesn't exist
mkdir -p ~/.claude-code-router

# Copy team's projects.json
cp .claude-code-router/projects.json ~/.claude-code-router/
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

You're ready! CCR agent routing is pre-configured with your team's model assignments.

```bash
# In your project directory
cd /path/to/your/project

# Use CCR - agent routing works automatically
ccr code "Help me implement user authentication"
```

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

After copying `projects.json`, your team's agent routing is configured. Here's what you have:

### Agent Model Assignments

Each agent in your project is assigned to a specific model:

| Agent File | Model | Purpose |
|------------|-------|---------|
| `dev.md` | `openai,gpt-4o` | Development tasks |
| `SM.md` | `anthropic,claude-haiku` | Scrum Master tasks |
| `pm.md` | Router default | Project Management |

*(Example - your team's configuration may vary)*

### How Routing Works

When you run `ccr code`, the system:
1. Detects which agent file you're working in
2. Looks up the configured model for that agent
3. Routes your request to the assigned model
4. Returns the response

## Common Onboarding Issues

### Issue: "Project not found"

**Cause:** The project path in `projects.json` doesn't match your local path.

**Solution:** Re-add your project with the correct path:

```bash
ccr project add /path/to/your/project
```

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

### Issue: "Schema version mismatch"

**Cause:** Your CCR version differs from the version that created `projects.json`.

**Solution:** This is informational - CCR will attempt compatibility mode. To update:

```bash
ccr project list  # Re-saves with current schema
```

## Next Steps

### Learn More About CCR

- [CLI Commands Reference](/cli/commands/other)
- [Git-Based Configuration Sharing](/team/git-workflow)
- [Configuration Guide](/cli/config/basic)

### Customize Your Setup

Once you're comfortable with the basics, you can:

1. **Configure additional agents:**
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

1. **Join team chat** where agent configurations are discussed
2. **Subscribe to pull requests** affecting `projects.json`
3. **Coordinate changes** with your team before configuring agents
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
- Check pull requests for recent configuration changes
- Review the team's `projects.json` for examples

### External Resources

- [CCR Documentation](/cli/intro)
- [GitHub Issues](https://github.com/musistudio/claude-code-router/issues)

## Security Reminders

### Do's ✅

- ✅ Copy `projects.json` from your team's repo
- ✅ Commit `projects.json` to share configurations
- ✅ Keep API keys in `config.json` (not in git)
- ✅ Use environment variables for CI/CD

### Don'ts ❌

- ❌ Commit your `config.json` file
- ❌ Share API keys in chat or email
- ❌ Put API keys in environment-specific config files that get committed
- ❌ Hard-code API keys in scripts

## Checklist

Use this checklist to verify your onboarding is complete:

- [ ] Repository cloned
- [ ] CCR installed globally (`npm install -g @musistudio/claude-code-router`)
- [ ] `projects.json` copied to `~/.claude-code-router/`
- [ ] API keys configured in `~/.claude-code-router/config.json`
- [ ] Can run `ccr code` successfully
- [ ] Agent routing works for team's configured agents
- [ ] Joined team chat for coordination
- [ ] Reviewed team's `projects.json` configuration

**Welcome to the team! 🎉**

You're now ready to use CCR with your team's pre-configured agent routing.
