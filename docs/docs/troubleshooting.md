---
sidebar_position: 4
---

# Troubleshooting

This guide covers common issues and solutions when using Claude Code Router's agent system.

## Common Issues

### Project Management Issues

#### Issue: "Invalid project path" when adding project

**Error:**
```
Error: Invalid project path: /path/to/project
```

**Cause:** The path doesn't exist or is not accessible.

**Solution:**
```bash
# Use absolute path, not relative
ccr project add /home/user/my-project  # ✓ Correct
ccr project add ~/my-project           # ✗ May not work
ccr project add ./my-project           # ✗ Incorrect

# Verify path exists
ls -la /home/user/my-project

# Create directory if needed
mkdir -p /home/user/my-project
```

#### Issue: "No agents found" in project

**Error:**
```
Scanning /path/to/project for agents...
No agents found.
```

**Cause:** Agent files don't exist in expected directories.

**Solution:**
```bash
# Check for agent files in correct locations
ls .claude/agents/
ls .bmad/bmm/agents/

# Create agents directory if needed
mkdir -p .bmad/bmm/agents

# Create an agent file
cat > .bmad/bmm/agents/dev.md << 'EOF'
# Dev Agent

You are a development assistant.
EOF

# Re-scan project
ccr project scan <project-id>
```

#### Issue: "Permission denied" when modifying agent files

**Error:**
```
Error: EACCES: permission denied, open '/path/to/agent.md'
```

**Cause:** File permissions prevent modification.

**Solution:**
```bash
# Check file permissions
ls -la .bmad/bmm/agents/dev.md

# Fix permissions (owner read-write)
chmod 644 .bmad/bmm/agents/dev.md

# If directory owned by another user, use sudo carefully
sudo chown $USER:$USER .bmad/bmm/agents/dev.md
```

#### Issue: "Invalid project ID format"

**Error:**
```
Error: Invalid project ID format
```

**Cause:** Using invalid project identifier.

**Solution:**
```bash
# Use project name or UUID from `ccr project list`
ccr project configure my-project        # ✓ Project name
ccr project configure 550e8400...      # ✓ UUID
ccr project configure my-project-123   # ✗ Invalid format

# List available projects
ccr project list
```

### Configuration Issues

#### Issue: Missing API keys in config.json

**Error:**
```
Error: API key not configured for provider: openai
```

**Cause:** Provider configuration missing API key.

**Solution:**
```bash
# Edit config.json
nano ~/.claude-code-router/config.json

# Add api_key to provider
{
  "Providers": [
    {
      "name": "openai",
      "api_base_url": "https://api.openai.com/v1/chat/completions",
      "api_key": "sk-your-api-key-here",  // ← Add this
      "models": ["gpt-4", "gpt-3.5-turbo"]
    }
  ]
}

# Or use environment variable
export OPENAI_API_KEY="sk-your-api-key-here"

# Restart CCR
ccr restart
```

#### Issue: Invalid model string format

**Error:**
```
Error: Invalid model format: "gpt-4" (expected "provider,model")
```

**Cause:** Model format missing provider prefix.

**Solution:**
```bash
# Use provider,model format
ccr project configure my-project
  dev.md: openai,gpt-4              # ✓ Correct
  dev.md: gpt-4                     # ✗ Missing provider
  dev.md: openai:gpt-4              # ✗ Wrong separator

# Valid formats:
  openai,gpt-4
  anthropic,claude-3-5-sonnet
  deepseek,deepseek-chat
  openrouter,anthropic/claude-3.5-sonnet
```

#### Issue: Router.default not configured

**Error:**
```
Error: Router.default is not configured
```

**Cause:** Default router model not set.

**Solution:**
```bash
# Edit config.json
nano ~/.claude-code-router/config.json

# Add Router.default
{
  "Router": {
    "default": "openai,gpt-4"
  }
}

# Restart CCR
ccr restart
```

#### Issue: Corrupted projects.json

**Error:**
```
Error: Failed to parse projects.json
```

**Cause:** Invalid JSON syntax in projects.json.

**Solution:**
```bash
# Validate JSON syntax
cat ~/.claude-code-router/projects.json

# Backup and recreate
cp ~/.claude-code-router/projects.json ~/.claude-code-router/projects.json.backup

# Re-add projects
ccr project add /path/to/project
```

### Agent Detection Issues

#### Issue: Agent ID not found in request

**Error:**
```
Error: Agent ID not found in request
```

**Cause:** Agent file missing `CCR-AGENT-ID` tag.

**Solution:**
```bash
# Check agent file has CCR-AGENT-ID
cat .bmad/bmm/agents/dev.md
# Should contain: <!-- CCR-AGENT-ID: uuid -->

# If missing, rescan project
ccr project scan <project-id>

# Manually inject ID if needed
echo "<!-- CCR-AGENT-ID: $(uuidgen) -->" >> .bmad/bmm/agents/dev.md
```

#### Issue: New agent not detected after git pull

**Cause:** Project not rescanned after pulling changes.

**Solution:**
```bash
# After git pull, always rescan
git pull origin main
ccr project scan <project-id>

# Verify agent was detected
ccr project list
```

#### Issue: Agent ID injection failed

**Error:**
```
Error: Failed to inject CCR-AGENT-ID
```

**Cause:** File is read-only or locked.

**Solution:**
```bash
# Check file permissions
ls -la .bmad/bmm/agents/dev.md

# Fix permissions
chmod 644 .bmad/bmm/agents/dev.md

# Retry injection
ccr project scan <project-id>
```

### Routing Issues

#### Issue: Session cache performance problems

**Symptom:** Slow response times, high memory usage.

**Cause:** Session cache not optimized for many agents.

**Solution:**
```bash
# Clear session cache
rm -rf ~/.claude-code-router/cache/

# Restart CCR
ccr restart

# Monitor performance
ccr status
```

#### Issue: API retry failures

**Error:**
```
Error: API request failed after 3 retries
```

**Cause:** Network issues or API rate limits.

**Solution:**
```bash
# Check network connectivity
ping api.openai.com

# Check API status page
# Visit: https://status.openai.com

# Increase timeout in config.json
{
  "API_TIMEOUT_MS": 120000  // 2 minutes
}

# Restart CCR
ccr restart
```

#### Issue: Routing inconsistency in reflection loops

**Symptom:** Different models used for same agent.

**Cause:** Session cache stale or routing logic confused.

**Solution:**
```bash
# Clear session cache
rm -rf ~/.claude-code-router/cache/

# Restart CCR
ccr restart

# Verify routing
ccr project list
```

### Configuration Prompt Issues

#### Issue: Configuration prompt not appearing

**Symptom:** Expected model prompt but didn't appear.

**Cause:** Project already configured or auto-skip enabled.

**Solution:**
```bash
# Force reconfiguration
ccr project configure <project-id>

# Or use interactive scan
ccr project scan <project-id>
```

#### Issue: Manual scan command errors

**Error:**
```
Error: Unknown command: ccr project rescan
```

**Cause:** Using wrong command name.

**Solution:**
```bash
# Correct command is "scan", not "rescan"
ccr project scan <project-id>  # ✓ Correct
ccr project rescan <project-id>  # ✗ Wrong

# Other project commands:
ccr project add <path>
ccr project list
ccr project configure <id>
ccr project scan <id>
```

### Platform-Specific Issues

#### Issue: Line ending problems across platforms

**Symptom:** CCR-AGENT-ID tags not detected on Windows.

**Cause:** Mixed line endings (CRLF vs LF).

**Solution:**
```bash
# Ensure .gitattributes is configured
cat .gitattributes
# Should contain: *.md text eol=lf

# Normalize line endings
dos2unix .bmad/bmm/agents/*.md

# Or use git to normalize
git add --renormalize .
git commit -m "fix: normalize line endings"
```

## Debug Logging

### Enable Debug Logging

```bash
# Edit config.json
nano ~/.claude-code-router/config.json

# Set log level to debug
{
  "LOG": true,
  "LOG_LEVEL": "debug"
}

# Restart CCR
ccr restart
```

### Log File Locations

**Server logs:**
```bash
# Location
~/.claude-code-router/logs/

# View latest server log
tail -f ~/.claude-code-router/logs/ccr-$(date +%Y-%m-%d).log
```

**Application logs:**
```bash
# Location
~/.claude-code-router/claude-code-router.log

# View routing decisions
tail -f ~/.claude-code-router/claude-code-router.log
```

### Useful Log Commands

```bash
# Search for agent routing
grep "Agent ID" ~/.claude-code-router/claude-code-router.log

# Search for errors
grep -i error ~/.claude-code-router/logs/ccr-*.log

# Search for project scans
grep "Scanning" ~/.claude-code-router/claude-code-router.log

# Real-time monitoring
tail -f ~/.claude-code-router/claude-code-router.log
```

## Performance Optimization

### Caching Tips

1. **Session caching is enabled by default** - No configuration needed

2. **Clear cache if routing seems stuck:**
   ```bash
   rm -rf ~/.claude-code-router/cache/
   ccr restart
   ```

3. **Reduce number of agents per project** for better performance

4. **Use Router.default** instead of per-agent models when possible

### API Timeout Configuration

```json
{
  "API_TIMEOUT_MS": 120000  // 2 minutes (default: 60000)
}
```

### Model Selection for Performance

| Task | Recommended Model | Reason |
|------|------------------|--------|
| Background tasks | Local models (Ollama) | Faster, no API cost |
| Code generation | GPT-4, Claude Sonnet | Higher quality |
| Quick responses | Haiku, GPT-3.5 | Lower latency |
| Long context | Gemini 2.5 Pro | 1M token context |

## FAQ

### General Questions

**Q: What is the difference between ccr-custom and CCR Enhanced?**

A: CCR Enhanced uses git-based agent sharing instead of UI. See [Migration Guide](/docs/migration/from-ccr-custom).

**Q: Can I use multiple projects with the same agents?**

A: No, each project must have a unique path. Agents are tied to specific projects.

**Q: How do I share agent configurations with my team?**

A: Commit agent `.md` files to git. Each team member runs `ccr project scan` after pulling.

**Q: Is projects.json committed to git?**

A: No, `projects.json` stays in `~/.claude-code-router/` (local-only). Only agent files are committed.

### Configuration Questions

**Q: How do I set a default model for all agents?**

A: Set `Router.default` in `config.json`:
```json
{
  "Router": {
    "default": "openai,gpt-4"
  }
}
```

**Q: Can I use environment variables for API keys?**

A: Yes, use `$VAR_NAME` syntax in `config.json`:
```json
{
  "api_key": "$OPENAI_API_KEY"
}
```

**Q: How do I configure models for specific agents only?**

A: Use `ccr project configure <project-id>` and set specific models, leaving others as `[Router.default]`.

### Troubleshooting Questions

**Q: Why is my agent not using the assigned model?**

A: Check:
1. `ccr project list` to verify assignment
2. `~/.claude-code-router/projects.json` for configuration
3. Clear cache: `rm -rf ~/.claude-code-router/cache/`

**Q: Why does CCR inject tags into my agent files?**

A: The `CCR-AGENT-ID` tag uniquely identifies agents for routing. It's required for the system to work.

**Q: Can I disable agent ID injection?**

A: No, agent IDs are required for routing. The tags are safe to commit to git.

**Q: What if I accidentally commit API keys?**

A:
1. Rotate the exposed API keys immediately
2. Remove from git history: `git filter-branch` or BFG Repo-Cleaner
3. Use environment variables going forward

## Error Messages Reference

Common error codes:

| Error | Cause | Solution |
|-------|-------|----------|
| `EPROJ_INVALID_PATH` | Invalid project path | Use absolute path |
| `EPROJ_NO_AGENTS` | No agents found | Create agent files |
| `EPROJ_INVALID_ID` | Invalid project ID | Use name or UUID |
| `EAGENT_NO_ID` | Agent ID not found | Run `ccr project scan` |
| `ECONFIG_MISSING_KEY` | API key missing | Add to config.json |
| `EROUTER_NO_DEFAULT` | Router.default not set | Add to config.json |

## Configuration Validation

### Validate config.json

```bash
# Check syntax
cat ~/.claude-code-router/config.json | jq .

# Check required fields
cat ~/.claude-code-router/config.json | jq '.Router.default'

# Restart after validation
ccr restart
```

### Validate projects.json

```bash
# Check syntax
cat ~/.claude-code-router/projects.json | jq .

# Check schema version
cat ~/.claude-code-router/projects.json | jq '.schemaVersion'

# Verify project paths exist
cat ~/.claude-code-router/projects.json | jq -r '.projects | to_entries[] | .value.path' | xargs -I {} ls {}
```

### Validate Agent Files

```bash
# Check for CCR-AGENT-ID tags
grep -r "CCR-AGENT-ID" .bmad/bmm/agents/

# Check for old CCR-AGENT-MODEL tags (should be removed)
grep -r "CCR-AGENT-MODEL" .bmad/bmm/agents/

# Validate line endings
file .bmad/bmm/agents/*.md
# Should show: "ASCII text" with "LF" line terminators
```

## Getting Help

If you're still stuck:

1. **Check the logs:** `tail -f ~/.claude-code-router/claude-code-router.log`
2. **Review documentation:** [CLI Reference](/docs/cli/commands/project), [Team Guides](/docs/category/team)
3. **Search issues:** [GitHub Issues](https://github.com/musistudio/claude-code-router/issues)
4. **Ask for help:** [Discord](https://discord.gg/rdftVMaUcS)

When reporting issues, include:
- CCR version (`ccr --version`)
- Error message
- Log output
- Operating system
- Steps to reproduce
