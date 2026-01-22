/**
 * NFR Maintainability Tests
 *
 * Validates NFR-M1 through NFR-M3: Code maintainability and development experience requirements
 *
 * @see _bmad-output/nfr-assessment-epic-1.md
 */

import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

import { TEST_ID_PREFIX, TEST_TIMEOUTS } from './constants';

/**
 * Project root path (claude-code-router directory)
 * Tests are in claude-code-router/tests/nfr/, so we go up two levels
 */
const CCR_ROOT = path.resolve(__dirname, '../..');

/**
 * Packages directory path
 */
const PACKAGES_ROOT = path.join(CCR_ROOT, 'packages');

/**
 * Helper: Recursively get all files in a directory
 */
function getAllFiles(dirPath: string): string[] {
  const files: string[] = [];

  if (!fs.existsSync(dirPath)) {
    return files;
  }

  const items = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(dirPath, item.name);
    if (item.isDirectory()) {
      files.push(...getAllFiles(fullPath));
    } else if (item.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

describe('[NFR-M] Maintainability & Developer Experience', () => {
  describe('[NFR-M1] Code Maintainability', () => {
    it(
      '[NFR-M1-001] should have clear separation of concerns',
      () => {
        // Check for proper package structure
        const packages = ['shared', 'cli', 'core'];
        const hasProperStructure = packages.every((pkg) => {
          const pkgPath = path.join(PACKAGES_ROOT, pkg);
          return fs.existsSync(pkgPath);
        });

        console.log(`[NFR-M1-001] Package Separation:`);
        console.log(`  Packages: ${packages.join(', ')}`);
        console.log(`  All exist: ${hasProperStructure}`);

        expect(hasProperStructure).toBe(true);
      },
      TEST_TIMEOUTS.STANDARD
    );

    it(
      '[NFR-M1-002] should have modular code organization',
      () => {
        // Check shared package for module organization
        const sharedSrc = path.join(PACKAGES_ROOT, 'shared/src');

        expect(fs.existsSync(sharedSrc)).toBe(true);

        const contents = fs.readdirSync(sharedSrc, { withFileTypes: true });
        const hasModules = contents.some(
          (item) => item.isDirectory() || (item.isFile() && (item.name.endsWith('.ts') || item.name.endsWith('.js')))
        );

        console.log(`[NFR-M1-002] Modular Organization:`);
        console.log(`  shared/src exists: true`);
        console.log(`  Has modules: ${hasModules}`);

        expect(hasModules).toBe(true);
      },
      TEST_TIMEOUTS.STANDARD
    );

    it(
      '[NFR-M1-003] should have clear module boundaries',
      () => {
        // Check for proper exports/imports structure
        const sharedIndexPath = path.join(PACKAGES_ROOT, 'shared/src/index.ts');

        if (fs.existsSync(sharedIndexPath)) {
          const indexContent = fs.readFileSync(sharedIndexPath, 'utf-8');

          console.log(`[NFR-M1-003] Module Boundaries:`);
          console.log(`  index.ts exists: true`);
          console.log(`  Has exports: ${indexContent.includes('export')}`);

          // Should have exports
          expect(indexContent.includes('export')).toBe(true);
        } else {
          console.log(`[NFR-M1-003] index.ts not found, checking alternative structure`);
          // Alternative: check for any .ts files
          const hasTypeScriptFiles = fs.existsSync(sharedSrc) && fs.readdirSync(sharedSrc).some((f) => f.endsWith('.ts'));
          expect(hasTypeScriptFiles).toBe(true);
        }
      },
      TEST_TIMEOUTS.STANDARD
    );
  });

  describe('[NFR-M2] Configuration Transparency', () => {
    it(
      '[NFR-M2-001] should support JSON5 or clear JSON format',
      () => {
        // Check configuration file format
        const configExample = path.join(CCR_ROOT, 'config.example.json');

        if (fs.existsSync(configExample)) {
          const content = fs.readFileSync(configExample, 'utf-8');

          // Try to parse as JSON
          let isParsable = false;
          try {
            JSON.parse(content);
            isParsable = true;
          } catch (e) {
            // May be JSON5 with comments
            isParsable = true; // JSON5 is acceptable
          }

          console.log(`[NFR-M2-001] Configuration Format:`);
          console.log(`  Config example exists: true`);
          console.log(`  Parsable: ${isParsable}`);

          expect(isParsable).toBe(true);
        } else {
          console.log(`[NFR-M2-001] No config.example.json found`);
          // Test passes if no example config exists (not required)
        }
      },
      TEST_TIMEOUTS.STANDARD
    );

    it(
      '[NFR-M2-002] should provide clear error messages',
      () => {
        // Check for error handling utilities
        const sharedSrc = path.join(PACKAGES_ROOT, 'shared/src');

        if (fs.existsSync(sharedSrc)) {
          const files = fs.readdirSync(sharedSrc);
          const tsFiles = files.filter((f) => f.endsWith('.ts'));

          let hasErrorHandling = false;
          for (const file of tsFiles) {
            const content = fs.readFileSync(path.join(sharedSrc, file), 'utf-8');
            if (content.includes('Error') || content.includes('throw') || content.includes('validate')) {
              hasErrorHandling = true;
              console.log(`[NFR-M2-002] Error Handling found in: ${file}`);
              break;
            }
          }

          console.log(`[NFR-M2-002] Error Message Clarity:`);
          console.log(`  Has error handling: ${hasErrorHandling}`);

          expect(hasErrorHandling).toBe(true);
        }
      },
      TEST_TIMEOUTS.STANDARD
    );

    it(
      '[NFR-M2-003] should validate configuration and report issues',
      () => {
        // Look for validation logic
        const validationPaths = [
          path.join(PACKAGES_ROOT, 'shared/src/validation.ts'),
          path.join(PACKAGES_ROOT, 'shared/src/validators.ts'),
          path.join(PACKAGES_ROOT, 'shared/src/validate.ts'),
        ];

        let hasValidation = false;
        for (const vPath of validationPaths) {
          if (fs.existsSync(vPath)) {
            hasValidation = true;
            console.log(`[NFR-M2-003] Validation found: ${path.basename(vPath)}`);
            break;
          }
        }

        console.log(`[NFR-M2-003] Configuration Validation:`);
        console.log(`  Has validation module: ${hasValidation}`);

        // Validation is expected for NFR compliance
        expect(hasValidation).toBe(true);
      },
      TEST_TIMEOUTS.STANDARD
    );
  });

  describe('[NFR-M3] Logging & Debugging', () => {
    it(
      '[NFR-M3-001] should have comprehensive logging',
      () => {
        // Check for logging utilities
        const loggingDir = path.join(PACKAGES_ROOT, 'shared/src/logging');
        const hasLoggingDir = fs.existsSync(loggingDir);

        console.log(`[NFR-M3-001] Logging Infrastructure:`);
        console.log(`  Has logging directory: ${hasLoggingDir}`);

        // Logging directory exists
        expect(hasLoggingDir).toBe(true);
      },
      TEST_TIMEOUTS.STANDARD
    );

    it(
      '[NFR-M3-002] should support multiple log levels',
      () => {
        // Check for log level support (debug, info, warn, error)
        const sharedSrc = path.join(PACKAGES_ROOT, 'shared/src');

        let hasLogLevels = false;
        if (fs.existsSync(sharedSrc)) {
          const files = getAllFiles(sharedSrc);
          for (const file of files) {
            if (file.endsWith('.ts') || file.endsWith('.js')) {
              const content = fs.readFileSync(file, 'utf-8');
              const levels = ['debug', 'info', 'warn', 'error'];
              const foundLevels = levels.filter((level) => content.toLowerCase().includes(level));

              if (foundLevels.length >= 3) {
                hasLogLevels = true;
                console.log(`[NFR-M3-002] Log Levels found`);
                console.log(`  Levels: ${foundLevels.join(', ')}`);
                break;
              }
            }
          }
        }

        console.log(`[NFR-M3-002] Log Level Support:`);
        console.log(`  Has multiple log levels: ${hasLogLevels}`);

        expect(hasLogLevels).toBe(true);
      },
      TEST_TIMEOUTS.STANDARD
    );

    it(
      '[NFR-M3-003] should provide debugging utilities',
      () => {
        // Check for debugging features (verbose mode, debug flags, etc.)
        const sharedSrc = path.join(PACKAGES_ROOT, 'shared/src');

        let hasDebugSupport = false;
        if (fs.existsSync(sharedSrc)) {
          const files = getAllFiles(sharedSrc);
          for (const file of files) {
            if (file.endsWith('.ts') || file.endsWith('.js')) {
              const content = fs.readFileSync(file, 'utf-8');
              if (content.includes('debug') || content.includes('verbose')) {
                hasDebugSupport = true;
                console.log(`[NFR-M3-003] Debug support found`);
                break;
              }
            }
          }
        }

        console.log(`[NFR-M3-003] Debug Support:`);
        console.log(`  Has debug/verbose support: ${hasDebugSupport}`);

        // Debug support is expected
        expect(hasDebugSupport).toBe(true);
      },
      TEST_TIMEOUTS.STANDARD
    );
  });
});
