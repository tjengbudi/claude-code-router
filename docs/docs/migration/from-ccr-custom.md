---
sidebar_position: 1
---

# Migrating from ccr-custom

This guide helps you migrate from the custom version of Claude Code Router (`ccr-custom`) to the CCR Enhanced Edition.

## Overview

The CCR Enhanced Edition introduces significant architectural changes for better team collaboration and model management:

**Key Changes:**
- Git-based agent sharing instead of UI-based project management
- Independent model configuration per team member
- CLI commands instead of web UI for project management
- `projects.json` is local by default (optionally shared via `.claude-code-router/projects.json`)

## ccr-custom vs CCR Enhanced

| Feature | ccr-custom | CCR Enhanced |
|---------|-----------|--------------|
| **Project Management** | Web UI | CLI commands (`ccr project`) |
| **Agent Sharing** | Manual configuration | Git-based workflow |
| **projects.json** | In repository | Local by default (`~/.claude-code-router/`), optional repo copy |
| **Model Assignment** | Via UI | Via CLI (`ccr project configure`) |
| **Agent Tags** | `CCR-AGENT-MODEL` in files | `CCR-AGENT-ID` in files only |
| **Team Collaboration** | Shared config | Independent config per member |
| **Merge Conflicts** | In `projects.json` | In agent `.md` files (rare) |

## Architecture Differences

### ccr-custom Architecture

```
Repository (committed to git):
├── projects.json              # Shared configuration
└── .bmad/bmm/agents/
    ├── dev.md                 # With CCR-AGENT-MODEL tag
    └── sm.md                  # With CCR-AGENT-MODEL tag

Local Only:
└── ~/.claude-code-router/
    └── config.json            # Provider configuration
```

### CCR Enhanced Architecture

```
Repository (committed to git):
└── .bmad/bmm/agents/
    ├── dev.md                 # With CCR-AGENT-ID tag only
    └── sm.md                  # With CCR-AGENT-ID tag only

Local Only (~/.claude-code-router/):
├── projects.json              # Each member has their own
└── config.json                # Provider configuration
```

**Why the Change?**

1. **Independent model preferences**: Each developer uses their preferred models
2. **Zero merge conflicts**: No more fighting over `projects.json`
3. **Git-native workflow**: Standard pull/commit/push for agent sharing
4. **Better security**: Model preferences aren't exposed in repositories

## Migration Steps

### Automated Migration (Recommended)

The easiest way to migrate is using the automated migration tool:

```bash
# Preview migration without making changes
ccr migrate from-ccr-custom --dry-run

# Run the migration
ccr migrate from-ccr-custom

# Run with custom backup location
ccr migrate from-ccr-custom --backup-dir ~/my-backups

# Skip confirmation prompt
ccr migrate from-ccr-custom -y
```

**What the automated migration does:**

1. **Transforms schema**: Converts agents from Record to Array format
2. **Adds timestamps**: Includes `createdAt` and `updatedAt` for each project
3. **Adds schema version**: Sets `schemaVersion: "1.0.0"` for forward compatibility
4. **Migrates model tags**: Moves `CCR-AGENT-MODEL` tags from agent files to `projects.json`
5. **Removes old tags**: Cleans up `CCR-AGENT-MODEL` tags from agent files
6. **Creates backup**: Automatically backs up your original `projects.json`

**Validate migration integrity:**

```bash
# Validate after migration
ccr migrate validate

# Compare with original file
ccr migrate validate --source-path ~/old-projects.json.backup
```

### Manual Migration

If you prefer manual migration or need more control:

### Step 1: Uninstall ccr-custom

```bash
# Uninstall the custom version
npm uninstall -g @visioncraft3r/claude-code-router-custom

# Verify removal
which ccr
# Should show: "ccr not found" or similar
```

### Step 2: Install CCR Enhanced

```bash
# Install the official version
npm install -g @musistudio/claude-code-router

# Verify installation
ccr --version
```

### Step 3: Backup Existing Configuration

```bash
# Backup your config.json
cp ~/.claude-code-router/config.json ~/.claude-code-router/config.json.backup

# If you had projects.json in your repository, back it up
cp ~/my-repo/projects.json ~/my-repo/projects.json.backup
```

### Step 4: Clean Up Old Tags from Agent Files

**If your agent files have `CCR-AGENT-MODEL` tags, remove them:**

```bash
# Navigate to your project
cd ~/my-project

# Remove CCR-AGENT-MODEL tags from agent files
find .bmad/bmm/agents -name "*.md" -exec sed -i '/<!-- CCR-AGENT-MODEL:/d' {} \;

# Verify the changes
grep -r "CCR-AGENT-MODEL" .bmad/bmm/agents/
# Should show no results
```

**Why remove `CCR-AGENT-MODEL` tags?**

CCR Enhanced stores model assignments in `projects.json` (local by default), not in agent files. Teams can optionally share a repo copy under `.claude-code-router/projects.json`.

### Step 5: Remove projects.json from Git Tracking (optional)

**If `projects.json` was committed to your repository and you do not plan to share a repo copy:**

```bash
# Remove from git tracking (keep local file)
git rm --cached projects.json

# Add to .gitignore
echo "projects.json" >> .gitignore

# Commit the changes
git add .gitignore
git commit -m "chore: remove projects.json from version control"
```

### Step 6: Re-register Projects with CCR Enhanced

```bash
# Add your project to CCR Enhanced
ccr project add ~/my-project

# CCR will scan for agents and inject CCR-AGENT-ID tags
# Configure models with: ccr project configure <project-id>
```

**Example output:**

```bash
$ ccr project add ~/my-project

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

### Step 7: Verify Migration

```bash
# Check that projects.json is in the correct location
ls ~/.claude-code-router/projects.json

# List your projects
ccr project list

# Verify agent files have CCR-AGENT-ID tags
cat .bmad/bmm/agents/dev.md
# Should contain: <!-- CCR-AGENT-ID: uuid -->

# Test agent routing
ccr code "Which agent are you using?"
# Should show: [CCR: Active Agent: <uuid> (provider,model)]
```

## Configuration Transfer

### Transferring Model Assignments

If you had specific model assignments in ccr-custom's `projects.json`, you can transfer them:

**Old format (ccr-custom):**

```json
{
  "projects": {
    "my-project": {
      "agents": {
        "dev.md": {
          "model": "openai,gpt-4o"
        }
      }
    }
  }
}
```

**New format (CCR Enhanced):**

The new format uses UUIDs and stores data in `~/.claude-code-router/projects.json`:

```json5
{
  schemaVersion: "1.0.0",
  projects: {
    "550e8400-e29b-41d4-a716-446655440000": {
      id: "550e8400-e29b-41d4-a716-446655440000",
      name: "my-project",
      path: "/home/user/my-project",
      createdAt: "2026-01-16T10:00:00.000Z",
      updatedAt: "2026-01-16T10:00:00.000Z",
      agents: [
        {
          id: "550e8400-e29b-41d4-a716-446655440001",
          name: "dev.md",
          relativePath: ".bmad/bmm/agents/dev.md",
          absolutePath: "/home/user/my-project/.bmad/bmm/agents/dev.md",
          model: "openai,gpt-4o"
        }
      ]
    }
  }
}
```

**To transfer model assignments:**

Option 1: Re-configure via CLI (recommended)
```bash
ccr project configure my-project
```

Option 2: Manual edit (advanced)
```bash
# Edit the new projects.json
nano ~/.claude-code-router/projects.json
# Add model assignments based on your old configuration
```

## Breaking Changes

### 1. Web UI Removed

**ccr-custom:** Project management via web UI (`ccr ui`)

**CCR Enhanced:** CLI commands only (`ccr project add/list/configure/scan`)

**Migration:** Use CLI commands instead of UI
- `ccr project add <path>` instead of "Add Project" button
- `ccr project list` instead of viewing projects list
- `ccr project configure <id>` instead of editing models in UI

### 2. projects.json Location Changed

**ccr-custom:** `projects.json` in repository root

**CCR Enhanced:** `projects.json` in `~/.claude-code-router/` (optional repo copy at `.claude-code-router/projects.json`)

**Migration:** Remove from git root, let CCR create new one (optionally share repo copy)

### 3. Agent Tag Format Changed

**ccr-custom:** `<!-- CCR-AGENT-MODEL: provider,model -->`

**CCR Enhanced:** `<!-- CCR-AGENT-ID: uuid -->`

**Migration:** Remove old tags, CCR injects new ones automatically

### 4. Model Configuration Location

**ccr-custom:** In agent files (`CCR-AGENT-MODEL` tag)

**CCR Enhanced:** In `projects.json` (local by default)

**Migration:** Configure via `ccr project configure <id>`

## Compatibility Notes

### Provider Configuration

Provider configuration (`config.json`) remains the same:

```json
{
  "Providers": [
    {
      "name": "openai",
      "api_base_url": "https://api.openai.com/v1/chat/completions",
      "api_key": "your-api-key",
      "models": ["gpt-4", "gpt-3.5-turbo"]
    }
  ],
  "Router": {
    "default": "openai,gpt-4"
  }
}
```

No changes needed for `config.json`.

### CLI Commands

Most CLI commands remain the same:

| Command | ccr-custom | CCR Enhanced | Status |
|---------|-----------|--------------|--------|
| `ccr start` | ✓ | ✓ | Same |
| `ccr stop` | ✓ | ✓ | Same |
| `ccr restart` | ✓ | ✓ | Same |
| `ccr status` | ✓ | ✓ | Same |
| `ccr code` | ✓ | ✓ | Same |
| `ccr model` | ✓ | ✓ | Same |
| `ccr preset` | ✓ | ✓ | Same |
| `ccr ui` | ✓ | ✓ | Limited (no project management) |
| `ccr project add` | ✓ | ✓ | New command |
| `ccr project list` | ✓ | ✓ | New command |
| `ccr project configure` | ✓ | ✓ | New command |
| `ccr project scan` | ✓ | ✓ | New command |
| `ccr migrate from-ccr-custom` | ✗ | ✓ | New command |
| `ccr migrate validate` | ✗ | ✓ | New command |

## Troubleshooting Migration Issues

### Issue: Agent files still have CCR-AGENT-MODEL tags

**Solution:**

```bash
# Remove all CCR-AGENT-MODEL tags
find .bmad/bmm/agents -name "*.md" -exec sed -i '/<!-- CCR-AGENT-MODEL:/d' {} \;

# Rescan project
ccr project scan my-project
```

### Issue: projects.json not found

**Solution:**

```bash
# Ensure projects.json is NOT in your repository
git rm --cached projects.json
echo "projects.json" >> .gitignore

# Re-add project to create new projects.json
ccr project add ~/my-project
```

### Issue: Agents not detected after migration

**Solution:**

```bash
# Verify agent files exist
ls .bmad/bmm/agents/

# Rescan project
ccr project scan my-project

# Check agent files have CCR-AGENT-ID
cat .bmad/bmm/agents/dev.md
```

### Issue: Model configuration not working

**Solution:**

```bash
# Reconfigure project
ccr project configure my-project

# Verify projects.json
cat ~/.claude-code-router/projects.json

# Check Router.default is set
cat ~/.claude-code-router/config.json | grep -A 5 "Router"
```

### Issue: Web UI doesn't show project management

**Explanation:** This is expected behavior. CCR Enhanced uses CLI commands instead of UI for project management.

**Solution:** Use `ccr project` commands instead.

## Rollback

If you need to rollback to ccr-custom:

```bash
# Uninstall CCR Enhanced
npm uninstall -g @musistudio/claude-code-router

# Reinstall ccr-custom
npm install -g @visioncraft3r/claude-code-router-custom@1.0.0

# Restore backup configurations
cp ~/.claude-code-router/config.json.backup ~/.claude-code-router/config.json
cp ~/my-repo/projects.json.backup ~/my-repo/projects.json

# Restore CCR-AGENT-MODEL tags (if you have backup)
git checkout HEAD~1 -- .bmad/bmm/agents/
```

## What's Next?

After migration:

1. **Learn the new workflow:** [Git-Based Agent Sharing](/docs/team/git-workflow)
2. **Configure your team:** [Team Onboarding](/docs/team/onboarding)
3. **Explore CLI commands:** [ccr project reference](/docs/cli/commands/project)

## Need Help?

If you encounter issues not covered here:

1. Check the [troubleshooting guide](/docs/troubleshooting)
2. Review [CLI command reference](/docs/cli/commands/project)
3. Open an issue on [GitHub](https://github.com/musistudio/claude-code-router/issues)
