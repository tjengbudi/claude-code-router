/**
 * Migration command handler for ccr-custom to CCR Enhanced
 * Story 5.6: Migration from ccr-custom
 */

import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import {
  migrateFromCcrCustom,
  isAlreadyMigrated,
  getMigrationPreview,
  formatMigrationPreview,
  validateMigration,
  quickValidate
} from '@CCR/shared';
import { PROJECTS_FILE, HOME_DIR } from '@CCR/shared';

/**
 * Default backup directory
 */
const DEFAULT_BACKUP_DIR = path.join(HOME_DIR, 'backups');

/**
 * Parse command line arguments
 */
interface ParsedArgs {
  dryRun: boolean;
  backupDir: string | null;
  validateOnly: boolean;
  sourcePath: string | null;
  yes: boolean;
}

function parseArgs(args: string[]): ParsedArgs {
  const result: ParsedArgs = {
    dryRun: false,
    backupDir: null,
    validateOnly: false,
    sourcePath: null,
    yes: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--dry-run':
        result.dryRun = true;
        break;
      case '--backup-dir':
        if (i + 1 >= args.length || args[i + 1].startsWith('--')) {
          throw new Error('--backup-dir requires a path argument');
        }
        result.backupDir = args[++i];
        break;
      case '--validate-only':
        result.validateOnly = true;
        break;
      case '--source-path':
        if (i + 1 >= args.length || args[i + 1].startsWith('--')) {
          throw new Error('--source-path requires a path argument');
        }
        result.sourcePath = args[++i];
        break;
      case '-y':
      case '--yes':
        result.yes = true;
        break;
    }
  }

  return result;
}

/**
 * Handle migrate command
 */
export async function handleMigrateCommand(args: string[]): Promise<void> {
  const subcommand = args[0];

  if (subcommand === 'from-ccr-custom') {
    await handleFromCcrCustom(args.slice(1));
  } else if (subcommand === 'validate') {
    await handleValidate(args.slice(1));
  } else {
    showMigrateHelp();
  }
}

/**
 * Show migrate command help
 */
function showMigrateHelp(): void {
  console.log(`
Usage: ccr migrate <subcommand>

Subcommands:
  from-ccr-custom    Migrate ccr-custom projects.json to CCR Enhanced format
  validate           Validate migration integrity

Options for from-ccr-custom:
  --dry-run                    Show preview without making changes
  --backup-dir <path>          Backup directory (default: ~/.claude-code-router/backups/)
  --validate-only              Validate migration without modifying files
  --source-path <path>         Path to ccr-custom projects.json (default: ~/.claude-code-router/projects.json)
  -y, --yes                    Skip confirmation prompt

Options for validate:
  --source-path <path>         Path to original ccr-custom projects.json (for comparison)
  --target-path <path>         Path to migrated projects.json (default: ~/.claude-code-router/projects.json)

Examples:
  ccr migrate from-ccr-custom --dry-run
  ccr migrate from-ccr-custom --backup-dir ~/backups
  ccr migrate from-ccr-custom --validate-only
  ccr migrate from-ccr-custom -y
  ccr migrate validate
  ccr migrate validate --source-path ~/old-projects.json
`);
}

/**
 * Handle from-ccr-custom subcommand
 */
async function handleFromCcrCustom(args: string[]): Promise<void> {
  const options = parseArgs(args);
  const {
    dryRun,
    backupDir = DEFAULT_BACKUP_DIR,
    validateOnly,
    sourcePath = path.join(HOME_DIR, 'projects.json'),
    yes
  } = options;

  console.log('\n=== CCR Custom to CCR Enhanced Migration ===\n');

  // Check if source file exists
  try {
    await fs.access(sourcePath);
  } catch {
    console.error(`✗ Migration failed: ccr-custom projects.json not found\n`);
    console.error(`Expected location: ${sourcePath}\n`);
    console.error('Troubleshooting:');
    console.error('- Verify ccr-custom is installed and configured');
    console.error('- Check if projects.json exists at the expected location');
    console.error('- If using custom location, specify with --source-path option\n');
    console.error(`Documentation: https://docs.claude-code-router.com/migration/from-ccr-custom\n`);
    process.exit(1);
  }

  // Check if already migrated
  const alreadyMigrated = await isAlreadyMigrated(sourcePath);
  if (alreadyMigrated) {
    console.log('✓ Configuration already migrated\n');
    console.log(`Detected schemaVersion: 1.0.0 in projects.json`);
    console.log('This configuration has already been migrated to CCR Enhanced format.\n');
    console.log('Use --validate-only to verify migration integrity.\n');
    process.exit(0);
  }

  // Show preview
  const previewData = await getMigrationPreview(sourcePath);
  console.log(formatMigrationPreview(previewData));

  // Handle validate-only mode
  if (validateOnly) {
    console.log('✓ Validation complete - no errors detected in source format\n');
    console.log('Ready to migrate. Run without --validate-only to perform migration.\n');
    process.exit(0);
  }

  // Confirm before proceeding (unless --yes or --dry-run)
  if (!yes && !dryRun) {
    console.log('This migration will:');
    console.log('  1. Transform agents structure (Record → Array)');
    console.log('  2. Add timestamps and schemaVersion');
    console.log('  3. Migrate model assignments from agent file tags');
    console.log('  4. Remove CCR-AGENT-MODEL tags from agent files');
    console.log('  5. Create backup before modifying files\n');

    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const answer = await new Promise<string>((resolve) => {
      rl.question('Proceed with migration? (y/N): ', (ans: string) => {
        rl.close();
        resolve(ans.toLowerCase());
      });
    });

    if (answer !== 'y' && answer !== 'yes') {
      console.log('\nMigration cancelled.\n');
      process.exit(0);
    }
  }

  // Perform migration
  console.log('Starting migration...\n');

  // Show progress for multi-project migrations (use structured data)
  if (previewData.totalProjects > 1) {
    console.log(`Processing ${previewData.totalProjects} projects...\n`);
  }

  const result = await migrateFromCcrCustom(
    sourcePath,
    PROJECTS_FILE,
    { dryRun, backupDir }
  );

  if (result.success) {
    console.log('\n✓ Migration successful!\n');
    console.log(`Projects migrated: ${result.projectsMigrated}`);
    console.log(`Agents migrated: ${result.agentsMigrated}`);
    console.log(`Models migrated from tags: ${result.modelsMigrated}`);
    console.log(`CCR-AGENT-MODEL tags removed: ${result.tagsRemoved}\n`);

    // Show warnings if any errors occurred but migration still succeeded
    if (result.errors.length > 0) {
      console.log('⚠ Warnings during migration:');
      for (const error of result.errors) {
        console.log(`  - ${error}`);
      }
      console.log('');
    }

    if (dryRun) {
      console.log('(Dry run mode - no files were modified)\n');
    } else {
      console.log(`Backup created in: ${backupDir}`);
      console.log(`\nNext steps:`);
      console.log(`  1. Verify your agent configurations in: ${PROJECTS_FILE}`);
      console.log(`  2. Test routing by running a workflow`);
      console.log(`  3. Run 'ccr migrate validate' to verify migration integrity\n`);
    }
  } else {
    console.log('\n✗ Migration failed!\n');
    if (result.errors.length > 0) {
      console.log('Errors:');
      for (const error of result.errors) {
        console.log(`  - ${error}`);
      }
      console.log('');
    }
    console.log('Troubleshooting:');
    console.log('- Check that projects.json is valid JSON');
    console.log('- Verify file permissions for projects.json and agent files');
    console.log('- Review backup files for manual recovery\n');
    console.log(`Documentation: https://docs.claude-code-router.com/migration/from-ccr-custom\n`);
    process.exit(1);
  }
}

/**
 * Handle validate subcommand
 */
async function handleValidate(args: string[]): Promise<void> {
  const options = parseArgs(args);
  const {
    sourcePath,
    targetPath = PROJECTS_FILE
  } = options;

  console.log('\n=== Migration Validation ===\n');

  // Quick validation of target
  const isValid = await quickValidate(targetPath);
  if (!isValid) {
    console.log('✗ Validation failed\n');
    console.log(`Target file has invalid schema: ${targetPath}\n`);
    process.exit(1);
  }

  console.log(`Target: ${targetPath}\n`);

  // If source provided, do full comparison
  if (sourcePath) {
    try {
      await fs.access(sourcePath);
    } catch {
      console.log(`⚠ Source file not found: ${sourcePath}`);
      console.log('Running schema-only validation...\n');

      if (isValid) {
        console.log('✓ Schema validation passed\n');
      }
      return;
    }

    const report = await validateMigration(sourcePath, targetPath);
    console.log(report.summary);

    if (!report.success) {
      console.log('✗ Validation failed - see details above\n');
      process.exit(1);
    }

    console.log('✓ All validation checks passed!\n');
  } else {
    // Schema-only validation
    if (isValid) {
      console.log('✓ Schema validation passed\n');
      console.log('Projects data structure is valid.\n');
      console.log('To run full comparison with original file:');
      console.log("  ccr migrate validate --source-path <path-to-original>\n");
    }
  }
}
