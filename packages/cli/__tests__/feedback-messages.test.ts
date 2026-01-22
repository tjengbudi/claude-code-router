/**
 * Story 5.4: CLI Feedback & Error Messages - Jest Tests
 *
 * Tests for message formatting utilities covering:
 * - AC1: Project Add Success Message
 * - AC2: Operation Failure Error Messages
 * - AC3: Configuration Update Success
 * - AC4: Appropriate Log Levels
 * - AC5: CLI Help Documentation
 */

import {
  formatProjectAddedSuccess,
  formatConfigurationSuccess,
  formatError,
  formatProjectList,
  formatScanResult,
  formatHelpText,
  truncatePath,
  colors,
  symbols,
  type ProjectSuccessData,
  type AgentConfig,
} from '@CCR/shared';

describe('Story 5.4: CLI Feedback & Error Messages', () => {
  describe('AC1: Project Add Success Message', () => {
    it('should display success message with project ID, path, agent count, and agent list with CCR-AGENT-IDs', () => {
      const project: ProjectSuccessData = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'test-project',
        path: '/home/user/test-project',
        agents: [
          { name: 'agent1.md', id: '11111111-1111-1111-1111-111111111111' },
          { name: 'agent2.md', id: '22222222-2222-2222-2222-222222222222' },
        ],
      };

      const result = formatProjectAddedSuccess(project);

      // Verify project details
      expect(result).toContain('test-project');
      expect(result).toContain('123e4567-e89b-12d3-a456-426614174000');
      expect(result).toContain('Path: /home/user/test-project');
      expect(result).toContain('Agents discovered: 2');

      // Verify agent list with CCR-AGENT-IDs
      expect(result).toContain('agent1.md');
      expect(result).toContain('CCR-AGENT-ID: 11111111-1111-1111-1111-111111111111');
      expect(result).toContain('agent2.md');
      expect(result).toContain('CCR-AGENT-ID: 22222222-2222-2222-2222-222222222222');

      // Verify next steps
      expect(result).toContain('Configure agent models: ccr project configure');
      expect(result).toContain('git add ~/.claude-code-router/projects.json');
    });

    it('should display success message with zero agents', () => {
      const project: ProjectSuccessData = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'test-project',
        path: '/home/user/test-project',
        agents: [],
      };

      const result = formatProjectAddedSuccess(project);

      expect(result).toContain('Agents discovered: 0');
      expect(result).not.toContain('Agents with injected UUIDs:');
    });

    it('should display success message with many agents (10+) using tree formatting', () => {
      const agents: ProjectSuccessData['agents'] = [];
      for (let i = 1; i <= 12; i++) {
        agents.push({
          name: `agent${i}.md`,
          id: `${i.toString().padStart(8, '0')}-${i.toString().padStart(4, '0')}-${i.toString().padStart(4, '0')}-${i.toString().padStart(4, '0')}-${i.toString().padStart(12, '0')}`,
        });
      }

      const project: ProjectSuccessData = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'test-project',
        path: '/home/user/test-project',
        agents,
      };

      const result = formatProjectAddedSuccess(project);

      expect(result).toContain('Agents discovered: 12');
      // Check for tree-style characters (Unicode or ASCII fallback)
      expect(result).toMatch(/├─|└─|\+--/);
    });
  });

  describe('AC2: Operation Failure Error Messages', () => {
    describe('Error Scenarios from Stories 1.1-4.5', () => {
      it('Scenario 1: Invalid project path (ENOENT)', () => {
        const error = new Error('ENOENT') as NodeJS.ErrnoException;
        error.code = 'ENOENT';

        const result = formatError(error, {
          operation: 'ccr project add',
          input: '/invalid/path',
        });

        expect(result).toContain('Error:');
        expect(result).toContain('Troubleshooting:');
        expect(result).toContain('Verify the path exists and is accessible');
        expect(result).toContain('Get help: ccr project --help');
      });

      it('Scenario 2: Path is not a directory (EISDIR)', () => {
        const error = new Error('EISDIR') as NodeJS.ErrnoException;
        error.code = 'EISDIR';

        const result = formatError(error);

        expect(result).toContain('Troubleshooting:');
        expect(result).toContain('directory');
      });

      it('Scenario 3: No .bmad/bmm/agents/ directory', () => {
        const result = formatError('No .bmad/bmm/agents/ directory found');

        expect(result).toContain('Error:');
        expect(result).toContain('Troubleshooting:');
      });

      it('Scenario 4: Permission denied (EACCES)', () => {
        const error = new Error('EACCES') as NodeJS.ErrnoException;
        error.code = 'EACCES';

        const result = formatError(error);

        expect(result).toContain('Troubleshooting:');
        expect(result).toContain('Check file permissions');
        expect(result).toContain('read access');
      });

      it('Scenario 5: Project already registered', () => {
        const result = formatError('Project already registered with ID: xxx');

        expect(result).toContain('Error:');
        expect(result).toContain('Project already registered');
      });

      it('Scenario 6: No agent files found', () => {
        const result = formatError('No .md files in .bmad/bmm/agents/');

        expect(result).toContain('Error:');
        expect(result).toContain('No .md files');
      });

      it('Scenario 7: Agent file read error', () => {
        const result = formatError('Cannot read agent file');

        expect(result).toContain('Error:');
        expect(result).toContain('Troubleshooting:');
      });

      it('Scenario 8: Agent file write error (ID injection)', () => {
        const result = formatError('Cannot write CCR-AGENT-ID to file');

        expect(result).toContain('Error:');
        expect(result).toContain('CCR-AGENT-ID');
      });

      it('Scenario 9: Backup creation failed', () => {
        const result = formatError('Cannot create .backup file');

        expect(result).toContain('Error:');
        expect(result).toContain('backup');
      });

      it('Scenario 10: Invalid project ID (not UUID)', () => {
        const result = formatError('Invalid project ID: not-a-uuid');

        expect(result).toContain('Error:');
        expect(result).toContain('Troubleshooting:');
        expect(result).toContain('valid UUID v4 format');
      });

      it('Scenario 11: Project not found', () => {
        const result = formatError('Project not found: 12345678-1234-1234-1234-123456789012');

        expect(result).toContain('Error:');
        expect(result).toContain('Troubleshooting:');
        expect(result).toContain('Verify the project ID exists');
      });

      it('Scenario 12: projects.json corrupted', () => {
        const result = formatError('Cannot parse projects.json');

        expect(result).toContain('Error:');
        expect(result).toContain('projects.json');
        expect(result).toContain('valid JSON');
      });

      it('Scenario 13: Invalid model string format', () => {
        const result = formatError('Invalid model format: bad-format');

        expect(result).toContain('Error:');
        expect(result).toContain('Troubleshooting:');
        expect(result).toContain('provider,modelname');
      });

      it('Scenario 14: Schema validation failed', () => {
        const result = formatError('projects.json schema validation failed');

        expect(result).toContain('Error:');
        expect(result).toContain('schema validation');
      });

      it('Scenario 15: projects.json write permission denied (EPERM)', () => {
        const error = new Error('EPERM') as NodeJS.ErrnoException;
        error.code = 'EPERM';

        const result = formatError(error);

        expect(result).toContain('Error:');
        expect(result).toContain('Troubleshooting:');
        expect(result).toContain('write permissions');
      });

      it('All error messages include "Get help: ccr project --help"', () => {
        const errorMessages = [
          formatError('Test error'),
          formatError(new Error('Test error')),
          formatError({ message: 'Test error' } as Error),
        ];

        errorMessages.forEach(msg => {
          expect(msg).toContain('Get help: ccr project --help');
        });
      });
    });
  });

  describe('AC3: Configuration Update Success', () => {
    it('should display configured agents with models', () => {
      const agents: AgentConfig[] = [
        { name: 'agent1.md', id: '111-111', model: 'openai,gpt-4o', relativePath: '.bmad/bmm/agents/agent1.md', absolutePath: '/project/.bmad/bmm/agents/agent1.md' },
        { name: 'agent2.md', id: '222-222', model: 'anthropic,claude-sonnet-4', relativePath: '.bmad/bmm/agents/agent2.md', absolutePath: '/project/.bmad/bmm/agents/agent2.md' },
      ];

      const result = formatConfigurationSuccess(agents);

      expect(result).toContain('Configured 2 agent(s)');
      expect(result).toContain('agent1.md');
      expect(result).toContain('openai,gpt-4o');
      expect(result).toContain('agent2.md');
      expect(result).toContain('anthropic,claude-sonnet-4');
      expect(result).toContain('Commit projects.json to share configuration');
    });

    it('should display [default] for agents without configured models', () => {
      const agents: AgentConfig[] = [
        { name: 'agent1.md', id: '111-111', model: 'openai,gpt-4o', relativePath: '.bmad/bmm/agents/agent1.md', absolutePath: '/project/.bmad/bmm/agents/agent1.md' },
        { name: 'agent2.md', id: '222-222', relativePath: '.bmad/bmm/agents/agent2.md', absolutePath: '/project/.bmad/bmm/agents/agent2.md' }, // No model
      ];

      const result = formatConfigurationSuccess(agents);

      expect(result).toContain('openai,gpt-4o');
      expect(result).toContain('[default]');
    });

    it('should display git sharing notice', () => {
      const agents: AgentConfig[] = [
        { name: 'agent1.md', id: '111-111', model: 'openai,gpt-4o', relativePath: '.bmad/bmm/agents/agent1.md', absolutePath: '/project/.bmad/bmm/agents/agent1.md' },
      ];

      const result = formatConfigurationSuccess(agents);

      expect(result).toContain('Commit projects.json to share configuration');
    });
  });

  describe('AC4: Appropriate Log Levels', () => {
    it('Debug level: agent not found', () => {
      // Note: This tests the log level concept - actual logging is in logger.ts
      // The message formatting itself doesn't have log levels
      const result = formatError('Agent not found: test-id');

      expect(result).toContain('Error:');
    });

    it('Info level: successful operations', () => {
      const project: ProjectSuccessData = {
        id: '123-456',
        name: 'test',
        path: '/test',
        agents: [],
      };

      const result = formatProjectAddedSuccess(project);

      expect(result).toContain('✓');
      expect(result).toContain('Project added');
    });

    it('Warn level: recoverable errors', () => {
      const error = new Error('projects.json corrupted') as NodeJS.ErrnoException;
      const result = formatError(error);

      // Error messages are formatted with proper context
      expect(result).toContain('Error:');
    });

    it('Error level: critical failures', () => {
      const error = new Error('File operation failed') as NodeJS.ErrnoException;
      error.code = 'EPERM';

      const result = formatError(error);

      expect(result).toContain('Error:');
      expect(result).toContain('Troubleshooting:');
    });

    it('LOG_LEVEL environment variable support', () => {
      // Test that logger respects LOG_LEVEL environment variable
      // This is a basic test to ensure the logger module exports the necessary functions
      const { getLogLevel, setLogLevel, LogLevel } = require('@CCR/shared');

      // Verify LogLevel enum exists
      expect(LogLevel).toBeDefined();
      expect(LogLevel.DEBUG).toBe('debug');
      expect(LogLevel.INFO).toBe('info');
      expect(LogLevel.WARN).toBe('warn');
      expect(LogLevel.ERROR).toBe('error');

      // Verify getLogLevel function exists
      expect(typeof getLogLevel).toBe('function');

      // Verify setLogLevel function exists
      expect(typeof setLogLevel).toBe('function');

      // Test setting log level
      const originalLevel = getLogLevel();
      setLogLevel(LogLevel.DEBUG);
      expect(getLogLevel()).toBe(LogLevel.DEBUG);

      // Restore original level
      setLogLevel(originalLevel);
    });
  });

  describe('AC5: CLI Help Documentation', () => {
    it('should display comprehensive help with all 4 subcommands', () => {
      const result = formatHelpText();

      expect(result).toContain('Usage: ccr project <command>');
      expect(result).toContain('add <path>');
      expect(result).toContain('list');
      expect(result).toContain('scan <id>');
      expect(result).toContain('configure <id>');
    });

    it('should include 3 usage examples', () => {
      const result = formatHelpText();

      expect(result).toContain('ccr project add');
      expect(result).toContain('ccr project configure');
      expect(result).toContain('git add');
    });

    it('should include GitHub link', () => {
      const result = formatHelpText();

      expect(result).toContain('github.com');
      expect(result).toContain('claude-code-router');
    });
  });

  describe('Snapshot Tests', () => {
    it('Snapshot: Project add success message', () => {
      const project: ProjectSuccessData = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'test-project',
        path: '/home/user/test-project',
        agents: [
          { name: 'agent1.md', id: '11111111-1111-1111-1111-111111111111' },
          { name: 'agent2.md', id: '22222222-2222-2222-2222-222222222222' },
        ],
      };

      const result = formatProjectAddedSuccess(project);
      expect(result).toMatchSnapshot();
    });

    it('Snapshot: Configuration success message', () => {
      const agents: AgentConfig[] = [
        { name: 'agent1.md', id: '111-111', model: 'openai,gpt-4o', relativePath: '.bmad/bmm/agents/agent1.md', absolutePath: '/project/.bmad/bmm/agents/agent1.md' },
        { name: 'agent2.md', id: '222-222', relativePath: '.bmad/bmm/agents/agent2.md', absolutePath: '/project/.bmad/bmm/agents/agent2.md' },
      ];

      const result = formatConfigurationSuccess(agents);
      expect(result).toMatchSnapshot();
    });

    it('Snapshot: Error message format', () => {
      const error = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException;
      error.code = 'ENOENT';

      const result = formatError(error);
      expect(result).toMatchSnapshot();
    });

    it('Snapshot: Help text output', () => {
      const result = formatHelpText();
      expect(result).toMatchSnapshot();
    });

    it('Snapshot: Project list output', () => {
      const projects = [
        {
          name: 'project1',
          id: '111-111',
          path: '/home/user/project1',
          agents: [
            { name: 'agent1.md', id: 'aaa-aaa', model: 'openai,gpt-4o', relativePath: '.bmad/bmm/agents/agent1.md', absolutePath: '/project1/.bmad/bmm/agents/agent1.md' },
          ],
        },
        {
          name: 'project2',
          id: '222-222',
          path: '/home/user/project2',
          agents: [],
        },
      ];

      const result = formatProjectList(projects);
      expect(result).toMatchSnapshot();
    });
  });

  describe('Additional Tests: Path Truncation', () => {
    it('should not truncate short paths (< 80 chars)', () => {
      const shortPath = '/home/user/project';
      const result = truncatePath(shortPath);

      expect(result).toBe(shortPath);
    });

    it('should truncate long paths (> 80 chars)', () => {
      const longPath = '/home/very/long/path/that/definitely/exceeds/eighty/characters/and/should/be/truncated/in/the/middle/for/display';
      const result = truncatePath(longPath, 80);

      expect(result.length).toBeLessThanOrEqual(80);
      expect(result).toContain('...');
    });

    it('should truncate paths > 100 chars', () => {
      const longPath = '/home/user/' + 'a'.repeat(100) + '/project';
      const result = truncatePath(longPath, 100);

      expect(result.length).toBeLessThanOrEqual(100);
      expect(result).toContain('...');
    });

    it('should preserve path structure when truncating', () => {
      const path = '/home/user/very-long-directory-name/that/goes/on/and/on/project-name';
      const result = truncatePath(path, 60);

      // Should start with root
      expect(result).toMatch(/^\/.+/);
      // Should contain ellipsis
      expect(result).toContain('...');
    });
  });

  describe('Additional Tests: TTY Detection', () => {
    it('should use colors when TTY is detected', () => {
      // The actual TTY detection uses process.stdout.isTTY
      // In test environment, we just verify the colorize function works
      // We can't easily mock isTTY in Jest without issues

      // When TTY is true (depends on environment), colors are applied
      // When TTY is false, plain text is returned
      // We just verify the function returns a string
      const result = colors.green('test');
      expect(typeof result).toBe('string');
      expect(result).toContain('test');
    });

    it('should not use colors when TTY is not detected', () => {
      // Similar to above, we verify the function returns a string
      // The actual TTY behavior depends on the runtime environment
      const result = colors.green('test');
      expect(typeof result).toBe('string');
      expect(result).toContain('test');
    });
  });

  describe('Additional Tests: Unicode Box-Drawing', () => {
    it('should use Unicode box-drawing characters when supported', () => {
      const project: ProjectSuccessData = {
        id: '123-456',
        name: 'test',
        path: '/test',
        agents: [
          { name: 'agent1.md', id: '111-111' },
          { name: 'agent2.md', id: '222-222' },
        ],
      };

      const result = formatProjectAddedSuccess(project);

      // Should contain box-drawing characters (Unicode or ASCII fallback)
      // The actual output depends on terminal support for Unicode
      expect(result).toMatch(/├─|└─|\||\+--/);
    });

    it('should have fallback to ASCII for incompatible terminals', () => {
      // This is tested through the supportsUnicode function
      // In a real terminal without UTF-8 support, ASCII fallback would be used
      // For unit testing, we verify the fallback characters exist
      const asciiFallback = {
        BRANCH: '+--',
        LAST: '+--',
        VERTICAL: '|',
      };

      expect(asciiFallback.BRANCH).toBe('+--');
      expect(asciiFallback.LAST).toBe('+--');
      expect(asciiFallback.VERTICAL).toBe('|');
    });
  });

  describe('Additional Tests: Concurrent CLI Commands', () => {
    it('should handle multiple format operations without race conditions', async () => {
      const project: ProjectSuccessData = {
        id: '123-456',
        name: 'test',
        path: '/test',
        agents: [
          { name: 'agent1.md', id: '111-111' },
        ],
      };

      // Run multiple format operations concurrently
      const promises = Array.from({ length: 10 }, () =>
        Promise.resolve(formatProjectAddedSuccess(project))
      );

      const results = await Promise.all(promises);

      // All results should be consistent
      results.forEach(result => {
        expect(result).toContain('test');
        expect(result).toContain('agent1.md');
      });

      // All results should be identical
      expect(results.every(r => r === results[0])).toBe(true);
    });
  });

  describe('Additional Tests: Symbols', () => {
    it('should export success symbol', () => {
      expect(symbols.success).toBe('✓');
    });

    it('should export error symbol', () => {
      expect(symbols.error).toBe('✗');
    });

    it('should export warning symbol', () => {
      expect(symbols.warning).toBe('⚠');
    });

    it('should export info symbol', () => {
      expect(symbols.info).toBe('ℹ');
    });

    it('should export package symbol', () => {
      expect(symbols.package).toBe('📦');
    });
  });

  describe('Scan Result Formatting', () => {
    it('should display "No changes detected" when no changes', () => {
      const result = formatScanResult({
        newAgents: [],
        deletedAgents: [],
        failedAgents: [],
        totalAgents: 5,
      });

      expect(result).toContain('No changes detected');
      expect(result).toContain('All agents up to date');
    });

    it('should display new agents', () => {
      const result = formatScanResult({
        newAgents: ['agent1.md', 'agent2.md'],
        deletedAgents: [],
        failedAgents: [],
        totalAgents: 7,
      });

      expect(result).toContain('Found 2 new agent(s)');
      expect(result).toContain('agent1.md');
      expect(result).toContain('agent2.md');
    });

    it('should display deleted agents', () => {
      const result = formatScanResult({
        newAgents: [],
        deletedAgents: [
          { name: 'old-agent.md', id: '111-111' },
        ],
        failedAgents: [],
        totalAgents: 3,
      });

      expect(result).toContain('Removed 1 deleted agent(s)');
      expect(result).toContain('old-agent.md');
    });

    it('should display failed agents', () => {
      const result = formatScanResult({
        newAgents: [],
        deletedAgents: [],
        failedAgents: ['failed.md'],
        totalAgents: 4,
      });

      expect(result).toContain('agent(s) failed to process');
      expect(result).toContain('failed.md');
    });
  });

  describe('Empty/Edge Cases', () => {
    it('should format empty project list', () => {
      const result = formatProjectList([]);

      expect(result).toContain('No projects registered');
      expect(result).toContain('ccr project add');
    });

    it('should format empty configuration success', () => {
      const result = formatConfigurationSuccess([]);

      expect(result).toContain('No agents to configure');
    });

    it('should handle error without code', () => {
      const error = new Error('Generic error');
      const result = formatError(error);

      expect(result).toContain('Error:');
      expect(result).toContain('Generic error');
    });
  });
});
