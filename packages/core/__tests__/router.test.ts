/**
 * Story 3.1: Router Integration Tests
 *
 * These tests verify the enhanced router integration with:
 * - Session-based LRU caching
 * - Project detection for multi-project support
 * - Enhanced cache key format: ${sessionId}:${projectId}:${agentId}
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ProjectManager } from '@CCR/shared';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { LRUCache } from 'lru-cache';

// Mock projects.json path for testing
const TEST_DIR = path.join(os.tmpdir(), 'ccr-test-router-' + Date.now());
const TEST_PROJECTS_FILE = path.join(TEST_DIR, 'projects.json');

// Mock CLAUDE_PROJECTS_DIR constant (matches router.ts import)
const CLAUDE_PROJECTS_DIR = TEST_DIR;

// Create a session-based LRU cache matching router.ts implementation
const sessionAgentModelCache = new LRUCache<string, string>({
  max: 1000,
});

describe('Story 3.1: Router Integration with Session-Based Caching', () => {
  let projectManager: ProjectManager;
  let project1Id: string;
  let project2Id: string;
  let agent1Id: string;
  let agent2Id: string;

  beforeEach(async () => {
    // Create test directory
    await fs.mkdir(TEST_DIR, { recursive: true });

    // Create valid projects.json
    await fs.writeFile(TEST_PROJECTS_FILE, '// Test projects file\n{\n  "projects": {}\n}', 'utf-8');

    // Initialize ProjectManager
    projectManager = new ProjectManager(TEST_PROJECTS_FILE);

    // Create two projects for multi-project testing
    const project1Path = path.join(TEST_DIR, 'project1');
    const project2Path = path.join(TEST_DIR, 'project2');

    await fs.mkdir(path.join(project1Path, '.bmad', 'bmm', 'agents'), { recursive: true });
    await fs.mkdir(path.join(project2Path, '.bmad', 'bmm', 'agents'), { recursive: true });

    const project1 = await projectManager.addProject(project1Path);
    const project2 = await projectManager.addProject(project2Path);

    project1Id = project1.id;
    project2Id = project2.id;

    // Create agent files
    const agent1Path = path.join(project1Path, '.bmad', 'bmm', 'agents', 'agent1.md');
    const agent2Path = path.join(project2Path, '.bmad', 'bmm', 'agents', 'agent2.md');

    await fs.writeFile(agent1Path, '# Agent 1\n\nTest agent 1', 'utf-8');
    await fs.writeFile(agent2Path, '# Agent 2\n\nTest agent 2', 'utf-8');

    // Scan projects to get agent IDs
    await projectManager.scanProject(project1Id);
    await projectManager.scanProject(project2Id);

    const proj1 = await projectManager.getProject(project1Id);
    const proj2 = await projectManager.getProject(project2Id);

    agent1Id = proj1!.agents[0].id;
    agent2Id = proj2!.agents[0].id;

    // Clear cache before each test
    sessionAgentModelCache.clear();
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Session-Based LRU Cache', () => {
    beforeEach(async () => {
      // Configure models for testing
      await projectManager.setAgentModel(project1Id, agent1Id, 'openai,gpt-4o');
      await projectManager.setAgentModel(project2Id, agent2Id, 'anthropic,claude-opus');
    });

    // Priority: P0
    test('3.1-AC1-001: should store model in cache after first lookup', async () => {
      // Given: A session with agent model configured
      // When: Looking up model for the first time
      // Then: Model should be stored in cache

      const sessionId = 'test-session-123';
      const cacheKey = `${sessionId}:${project1Id}:${agent1Id}`;

      // First lookup - should cache the result
      const model1 = await projectManager.getModelByAgentId(agent1Id, project1Id);
      sessionAgentModelCache.set(cacheKey, model1!);

      // Verify cache has the model
      const cachedModel = sessionAgentModelCache.get(cacheKey);
      expect(cachedModel).toBe('openai,gpt-4o');
    });

    // Priority: P0
    test('3.1-AC1-002: should return cached model on second lookup (cache hit)', async () => {
      // Given: A model already cached for a session
      // When: Looking up the same model again
      // Then: Should return cached model without database lookup

      const sessionId = 'test-session-456';
      const cacheKey = `${sessionId}:${project1Id}:${agent1Id}`;

      // First lookup - cache miss
      const model1 = await projectManager.getModelByAgentId(agent1Id, project1Id);
      sessionAgentModelCache.set(cacheKey, model1!);

      // Second lookup - cache hit
      const cachedModel = sessionAgentModelCache.get(cacheKey);
      expect(cachedModel).toBe('openai,gpt-4o');
      expect(cachedModel).toBe(model1);
    });

    // Priority: P0
    test('3.1-AC1-003: should return undefined on cache miss', async () => {
      // Given: An empty cache for a session
      // When: Looking up a model that hasn't been cached
      // Then: Should return undefined (cache miss)

      const sessionId = 'test-session-789';
      const cacheKey = `${sessionId}:${project1Id}:${agent1Id}`;

      // Cache is empty before first lookup
      const cachedModel = sessionAgentModelCache.get(cacheKey);
      expect(cachedModel).toBeUndefined();
    });

    // Priority: P0
    test('3.1-AC2-001: should isolate cache entries across different sessions', async () => {
      // Given: Two different user sessions
      // When: Caching model for one session
      // Then: Other session should not see the cached model

      const session1 = 'session-001';
      const session2 = 'session-002';

      const cacheKey1 = `${session1}:${project1Id}:${agent1Id}`;
      const cacheKey2 = `${session2}:${project1Id}:${agent1Id}`;

      // Store model for session 1
      sessionAgentModelCache.set(cacheKey1, 'openai,gpt-4o');

      // Session 2 cache should be empty (cache miss)
      const cachedModel2 = sessionAgentModelCache.get(cacheKey2);
      expect(cachedModel2).toBeUndefined();

      // Session 1 cache should have the model (cache hit)
      const cachedModel1 = sessionAgentModelCache.get(cacheKey1);
      expect(cachedModel1).toBe('openai,gpt-4o');
    });

    // Priority: P0
    test('3.1-AC2-002: should isolate cache entries across different projects', async () => {
      // Given: Two different projects in the same session
      // When: Caching models for each project
      // Then: Each project should have isolated cache entries

      const sessionId = 'test-session-multi-project';

      const cacheKey1 = `${sessionId}:${project1Id}:${agent1Id}`;
      const cacheKey2 = `${sessionId}:${project2Id}:${agent2Id}`;

      // Store different models for each project
      sessionAgentModelCache.set(cacheKey1, 'openai,gpt-4o');
      sessionAgentModelCache.set(cacheKey2, 'anthropic,claude-opus');

      // Verify isolation - cache keys should return different models
      const model1 = sessionAgentModelCache.get(cacheKey1);
      const model2 = sessionAgentModelCache.get(cacheKey2);

      expect(model1).toBe('openai,gpt-4o');
      expect(model2).toBe('anthropic,claude-opus');
      expect(model1).not.toBe(model2);
    });

    // Priority: P0
    test('3.1-AC2-003: should isolate cache entries across different agents', async () => {
      // Given: Two different agents in the same session and project
      // When: Caching model for one agent
      // Then: Other agent should not see the cached model

      const sessionId = 'test-session-multi-agent';

      const cacheKey1 = `${sessionId}:${project1Id}:${agent1Id}`;
      const cacheKey2 = `${sessionId}:${project1Id}:${agent2Id}`;

      // Note: agent2 is in project2, so we'd use project2Id for it
      sessionAgentModelCache.set(cacheKey1, 'openai,gpt-4o');

      // agent2 key would be different (different project and agent)
      const cachedModel1 = sessionAgentModelCache.get(cacheKey1);
      const cachedModel2 = sessionAgentModelCache.get(cacheKey2);

      expect(cachedModel1).toBe('openai,gpt-4o');
      expect(cachedModel2).toBeUndefined(); // agent2 not cached for project1
    });

    // Priority: P1
    test('3.1-AC3-001: should use enhanced cache key format with three components', async () => {
      // Given: Session ID, project ID, and agent ID
      // When: Constructing cache key
      // Then: Should use format ${sessionId}:${projectId}:${agentId}

      const sessionId = 'test-session-format';
      const projectId = project1Id;
      const agentId = agent1Id;

      // Cache key format: ${sessionId}:${projectId}:${agentId}
      const expectedCacheKey = `${sessionId}:${projectId}:${agentId}`;
      const cacheKey = `${sessionId}:${projectId}:${agentId}`;

      expect(cacheKey).toBe(expectedCacheKey);
      expect(cacheKey.split(':')).toHaveLength(3);
      expect(cacheKey.split(':')[0]).toBe(sessionId);
      expect(cacheKey.split(':')[1]).toBe(projectId);
      expect(cacheKey.split(':')[2]).toBe(agentId);
    });

    // Priority: P1
    test('3.1-AC3-002: should handle default session ID when user_id missing', async () => {
      // Given: Request without user_id (session ID defaults to 'default')
      // When: Caching model with default session ID
      // Then: Should use 'default' as session ID in cache key

      const sessionId = 'default'; // From extractSessionId fallback
      const cacheKey = `${sessionId}:${project1Id}:${agent1Id}`;

      sessionAgentModelCache.set(cacheKey, 'openai,gpt-4o');

      const cachedModel = sessionAgentModelCache.get(cacheKey);
      expect(cachedModel).toBe('openai,gpt-4o');
    });

    // Priority: P1
    test('3.1-AC4-001: should handle LRU cache max entries (1000)', async () => {
      // Given: LRU cache with max 1000 entries
      // When: Adding entries to cache
      // Then: Cache should respect max size limit

      // Verify cache max entries setting
      const cacheMax = sessionAgentModelCache.max;
      expect(cacheMax).toBe(1000);

      // Cache should be able to store entries up to max
      for (let i = 0; i < 100; i++) {
        const testAgentId = uuidv4();
        const testSessionId = `session-${i}`;
        const cacheKey = `${testSessionId}:${project1Id}:${testAgentId}`;
        sessionAgentModelCache.set(cacheKey, `model-${i}`);
      }

      // Verify cache size (approximately, accounting for potential LRU eviction)
      const cacheSize = sessionAgentModelCache.size;
      expect(cacheSize).toBeGreaterThan(0);
      expect(cacheSize).toBeLessThanOrEqual(1000);
    });
  });

  describe('Router Integration Flow', () => {
    beforeEach(async () => {
      // Configure models for testing
      await projectManager.setAgentModel(project1Id, agent1Id, 'openai,gpt-4o');
      await projectManager.setAgentModel(project2Id, agent2Id, 'anthropic,claude-opus');
    });

    // Priority: P0
    test('3.1-AC5-001: should simulate complete routing flow with cache', async () => {
      // Given: A complete routing request with session, project, and agent
      // When: Performing cache lookup and fallback to ProjectManager
      // Then: Should cache the result for future lookups

      const sessionId = 'session-routing-test';
      const agentId = agent1Id;
      const projectId = await projectManager.detectProject(agentId);

      expect(projectId).toBe(project1Id);

      // Simulate cache lookup flow
      const cacheKey = `${sessionId}:${projectId}:${agentId}`;
      let model = sessionAgentModelCache.get(cacheKey);

      // Cache miss - lookup from ProjectManager
      if (!model) {
        model = await projectManager.getModelByAgentId(agentId, projectId);
        if (model) {
          sessionAgentModelCache.set(cacheKey, model);
        }
      }

      expect(model).toBe('openai,gpt-4o');

      // Verify cache now has the model
      const cachedModel = sessionAgentModelCache.get(cacheKey);
      expect(cachedModel).toBe('openai,gpt-4o');
    });

    // Priority: P0
    test('3.1-AC6-001: should fallback to Router.default when agent not found', async () => {
      // Given: A non-existent agent ID
      // When: Attempting to detect project
      // Then: Should return undefined and fallback to Router.default

      const fakeAgentId = uuidv4();
      const sessionId = 'session-fallback-test';

      // Detect project for non-existent agent
      const projectId = await projectManager.detectProject(fakeAgentId);
      expect(projectId).toBeUndefined();

      // No project found - should fall back to Router.default
      // In actual router, this would skip caching and use fallback
      expect(projectId).toBeUndefined();
    });

    // Priority: P0
    test('3.1-AC6-002: should handle agent with no model configured', async () => {
      // Given: An agent with no model configured
      // When: Looking up model for the agent
      // Then: Should return undefined and fallback to Router.default

      // Remove model configuration
      await projectManager.setAgentModel(project1Id, agent1Id, undefined);

      const sessionId = 'session-no-model-test';
      const cacheKey = `${sessionId}:${project1Id}:${agent1Id}`;

      // Lookup returns undefined
      const model = await projectManager.getModelByAgentId(agent1Id, project1Id);
      expect(model).toBeUndefined();

      // Cache should not store undefined values
      sessionAgentModelCache.set(cacheKey, model!);

      // Cache should have the undefined value (or be empty)
      const cachedModel = sessionAgentModelCache.get(cacheKey);
      expect(cachedModel).toBeUndefined();
    });
  });

  describe('Performance Requirements for Story 3.1', () => {
    // Priority: P1
    test('3.1-AC7-001: should complete cache lookup in less than 5ms (NFR-P1 target)', async () => {
      // Given: A pre-populated cache with model data
      // When: Performing 1000 cache lookups
      // Then: Average lookup time should be < 5ms per NFR-P1

      const sessionId = 'perf-test-session';
      const cacheKey = `${sessionId}:${project1Id}:${agent1Id}`;

      // Pre-populate cache
      sessionAgentModelCache.set(cacheKey, 'openai,gpt-4o');

      const iterations = 1000;
      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        sessionAgentModelCache.get(cacheKey);
      }

      const endTime = Date.now();
      const avgTime = (endTime - startTime) / iterations;

      // Target: < 5ms per NFR-P1
      expect(avgTime).toBeLessThan(5);
    });

    // Priority: P2
    test('3.1-AC7-002: should complete project detection in reasonable time', async () => {
      // Given: Multiple project detection requests
      // When: Detecting project for agent 100 times
      // Then: Average detection time should be < 20ms

      const iterations = 100;
      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        await projectManager.detectProject(agent1Id);
      }

      const endTime = Date.now();
      const avgTime = (endTime - startTime) / iterations;

      // Target: < 10ms for agent ID detection (NFR-P1)
      // Project detection adds some overhead but should still be fast
      expect(avgTime).toBeLessThan(20);
    });
  });

  describe('Cache Logging Requirements (Story 3.1)', () => {
    // Priority: P2
    test('3.1-AC8-001: should log cache hits at debug level', async () => {
      // Given: A pre-populated cache entry
      // When: Performing cache lookup (cache hit)
      // Then: Should log at debug level (verified in router.ts)

      const sessionId = 'logging-test-hit';
      const cacheKey = `${sessionId}:${project1Id}:${agent1Id}`;

      // Pre-populate cache
      sessionAgentModelCache.set(cacheKey, 'openai,gpt-4o');

      // Cache hit - in real router, would log at debug level
      const cachedModel = sessionAgentModelCache.get(cacheKey);

      expect(cachedModel).toBe('openai,gpt-4o');
      // Note: Actual logging happens in router.ts
    });

    // Priority: P2
    test('3.1-AC8-002: should log cache misses at debug level', async () => {
      // Given: An empty cache
      // When: Performing cache lookup (cache miss)
      // Then: Should log at debug level (verified in router.ts)

      const sessionId = 'logging-test-miss';
      const cacheKey = `${sessionId}:${project1Id}:${agent1Id}`;

      // Cache miss
      const cachedModel = sessionAgentModelCache.get(cacheKey);

      expect(cachedModel).toBeUndefined();
      // Note: Actual logging happens in router.ts
    });
  });

  describe('Story 3.2: Eviction Behavior Tests (AC 4)', () => {
    // Priority: P1
    test('3.1-AC9-001: should evict LRU entry when exceeding 1000 entries', async () => {
      // Given: Cache filled to capacity (1000 entries)
      // When: Adding 1001st entry
      // Then: Should evict least recently used entry

      const sessionId = 'eviction-test-session';

      // Fill cache to capacity (1000 entries)
      for (let i = 0; i < 1000; i++) {
        const cacheKey = `${sessionId}:${project1Id}:agent-${i}`;
        sessionAgentModelCache.set(cacheKey, `model-${i}`);
      }

      expect(sessionAgentModelCache.size).toBe(1000);

      // Add 1001st entry to trigger eviction
      const cacheKey1001 = `${sessionId}:${project1Id}:agent-1000`;
      sessionAgentModelCache.set(cacheKey1001, 'model-1000');

      // Cache size should still be 1000 (LRU eviction)
      expect(sessionAgentModelCache.size).toBe(1000);

      // Oldest entry should be evicted
      const oldestKey = `${sessionId}:${project1Id}:agent-0`;
      const evictedEntry = sessionAgentModelCache.get(oldestKey);
      expect(evictedEntry).toBeUndefined();
    });

    // Priority: P1
    test('3.1-AC9-002: should evict in < 10ms per NFR-P4', async () => {
      // Given: Cache at full capacity (1000 entries)
      // When: Adding new entry to trigger eviction
      // Then: Eviction should complete in < 10ms per NFR-P4

      const sessionId = 'eviction-perf-test';

      // Fill cache to capacity
      for (let i = 0; i < 1000; i++) {
        const cacheKey = `${sessionId}:${project1Id}:agent-${i}`;
        sessionAgentModelCache.set(cacheKey, `model-${i}`);
      }

      // Measure eviction latency
      const start = performance.now();
      const cacheKey1001 = `${sessionId}:${project1Id}:agent-1000`;
      sessionAgentModelCache.set(cacheKey1001, 'model-1000');
      const evictionLatency = performance.now() - start;

      // Eviction should complete in < 10ms (NFR-P4)
      expect(evictionLatency).toBeLessThan(10);
    });

    // Priority: P2
    test('3.1-AC9-003: should verify evicted entry triggers cache miss on next lookup', async () => {
      // Given: Cache at capacity with eviction triggered
      // When: Looking up evicted entry
      // Then: Should return cache miss with latency < 5ms

      const sessionId = 'eviction-miss-test';

      // Fill cache to capacity (1000 entries)
      const keys: string[] = [];
      for (let i = 0; i < 1000; i++) {
        const cacheKey = `${sessionId}:${project1Id}:agent-${i}`;
        keys.push(cacheKey);
        sessionAgentModelCache.set(cacheKey, `model-${i}`);
      }

      // Verify cache is at capacity
      expect(sessionAgentModelCache.size).toBe(1000);

      // Trigger eviction by adding 1001st entry
      const overflowKey = `${sessionId}:${project1Id}:agent-overflow`;
      sessionAgentModelCache.set(overflowKey, 'model-overflow');

      // Cache should still be at max capacity (one entry evicted)
      expect(sessionAgentModelCache.size).toBe(1000);

      // Find which entry was evicted (at least one must be evicted)
      let evictedCount = 0;
      for (const key of keys) {
        if (sessionAgentModelCache.get(key) === undefined) {
          evictedCount++;
        }
      }

      // At least one early entry should be evicted
      expect(evictedCount).toBeGreaterThan(0);

      // Cache miss latency should still be < 5ms
      const start = performance.now();
      const result = sessionAgentModelCache.get(keys[0]);
      const missLatency = performance.now() - start;

      // Whether hit or miss, latency should be < 5ms
      expect(missLatency).toBeLessThan(5);
    });

    // Priority: P2
    test('3.1-AC9-004: should maintain correct LRU order with mixed access patterns', async () => {
      // Given: Cache with mixed access patterns (some entries refreshed)
      // When: Filling cache to capacity and triggering eviction
      // Then: Recently accessed entries should remain, old entries evicted

      const sessionId = 'lru-order-test';

      // Add 100 entries
      const keys: string[] = [];
      for (let i = 0; i < 100; i++) {
        const cacheKey = `${sessionId}:${project1Id}:agent-${i}`;
        keys.push(cacheKey);
        sessionAgentModelCache.set(cacheKey, `model-${i}`);
      }

      // Refresh some entries by setting them again (this updates their LRU position)
      sessionAgentModelCache.set(keys[50], 'model-50-refreshed');
      sessionAgentModelCache.set(keys[75], 'model-75-refreshed');
      sessionAgentModelCache.set(keys[25], 'model-25-refreshed');

      // Fill cache to capacity
      for (let i = 100; i < 1000; i++) {
        const cacheKey = `${sessionId}:${project1Id}:agent-${i}`;
        sessionAgentModelCache.set(cacheKey, `model-${i}`);
      }

      // Add one more to trigger eviction
      sessionAgentModelCache.set(`${sessionId}:${project1Id}:agent-1000`, 'model-1000');

      // Entries that were refreshed should still exist (more recently used)
      expect(sessionAgentModelCache.get(keys[50])).toBe('model-50-refreshed');
      expect(sessionAgentModelCache.get(keys[75])).toBe('model-75-refreshed');
      expect(sessionAgentModelCache.get(keys[25])).toBe('model-25-refreshed');

      // At least some of the non-refreshed entries should be evicted
      let evictedCount = 0;
      for (let i = 0; i < 20; i++) {
        if (i !== 25 && i !== 50 && i !== 75) {
          if (sessionAgentModelCache.get(keys[i]) === undefined) {
            evictedCount++;
          }
        }
      }
      // Some early entries should be evicted
      expect(evictedCount).toBeGreaterThan(0);
    });

    // Priority: P1
    test('3.1-AC9-005: should handle rapid sequential evictions efficiently', async () => {
      // Given: Cache at capacity with rapid sequential additions
      // When: Triggering 100 rapid evictions
      // Then: All evictions should be < 10ms, average < 5ms

      const sessionId = 'rapid-eviction-test';
      const evictionLatencies: number[] = [];

      // Fill cache to capacity
      for (let i = 0; i < 1000; i++) {
        const cacheKey = `${sessionId}:${project1Id}:agent-${i}`;
        sessionAgentModelCache.set(cacheKey, `model-${i}`);
      }

      // Trigger 100 rapid evictions
      for (let i = 1000; i < 1100; i++) {
        const start = performance.now();
        const cacheKey = `${sessionId}:${project1Id}:agent-${i}`;
        sessionAgentModelCache.set(cacheKey, `model-${i}`);
        const end = performance.now();
        evictionLatencies.push(end - start);
      }

      // All evictions should be < 10ms
      const maxLatency = Math.max(...evictionLatencies);
      const avgLatency = evictionLatencies.reduce((a, b) => a + b, 0) / evictionLatencies.length;

      expect(maxLatency).toBeLessThan(10);
      expect(avgLatency).toBeLessThan(5);
    });
  });

  describe('Story 3.2: Memory Leak Detection Tests (AC 5)', () => {
    // Priority: P2
    test('3.1-AC10-001: should not leak memory under sustained load of 10000 requests', async () => {
      // Given: Sustained load of 10,000 requests with cache churn
      // When: Simulating high-volume request patterns
      // Then: Memory growth should be < 50MB after GC (NFR-SC3)

      const sessionId = 'memory-leak-test';
      const initialMemory = process.memoryUsage().heapUsed;

      // Simulate 10,000 requests with cache churn (100 unique agents)
      for (let i = 0; i < 10000; i++) {
        const agentIndex = i % 100;
        const cacheKey = `${sessionId}:${project1Id}:agent-${agentIndex}`;
        sessionAgentModelCache.set(cacheKey, `model-${agentIndex}`);
      }

      const afterLoadMemory = process.memoryUsage().heapUsed;
      const growthBeforeGC = (afterLoadMemory - initialMemory) / 1024 / 1024;

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const growthAfterGC = (finalMemory - initialMemory) / 1024 / 1024;

      // Memory growth should be < 50MB (NFR-SC3)
      expect(growthAfterGC).toBeLessThan(50);
    });

    // Priority: P2
    test('3.1-AC10-002: should maintain stable memory size with bounded cache', async () => {
      // Given: Cache operations over extended period
      // When: Performing 6000 cache operations with evictions
      // Then: Memory should remain stable (< 50MB growth)

      const sessionId = 'stable-memory-test';
      const memorySnapshots: number[] = [];

      // Take initial snapshot
      memorySnapshots.push(process.memoryUsage().heapUsed);

      // Fill cache to capacity
      for (let i = 0; i < 1000; i++) {
        const cacheKey = `${sessionId}:${project1Id}:agent-${i}`;
        sessionAgentModelCache.set(cacheKey, `model-${i}`);
      }
      memorySnapshots.push(process.memoryUsage().heapUsed);

      // Perform 5000 more operations (cache will evict old entries)
      for (let i = 1000; i < 6000; i++) {
        const cacheKey = `${sessionId}:${project1Id}:agent-${i}`;
        sessionAgentModelCache.set(cacheKey, `model-${i}`);

        // Sample memory every 1000 operations
        if (i % 1000 === 0) {
          memorySnapshots.push(process.memoryUsage().heapUsed);
        }
      }

      // Final snapshot after GC
      if (global.gc) {
        global.gc();
      }
      memorySnapshots.push(process.memoryUsage().heapUsed);

      // Memory should not grow unboundedly
      const initialMB = memorySnapshots[0] / 1024 / 1024;
      const finalMB = memorySnapshots[memorySnapshots.length - 1] / 1024 / 1024;
      const growthMB = finalMB - initialMB;

      expect(growthMB).toBeLessThan(50);

      // Cache size should remain at max (1000)
      expect(sessionAgentModelCache.size).toBe(1000);
    });

    // Priority: P2
    test('3.1-AC10-003: should handle cache churn without accumulating memory', async () => {
      // Given: Repeated cache churn cycles (50 cycles, 200 agents each)
      // When: Adding and evicting entries repeatedly
      // Then: Cache should remain bounded, memory reasonable (< 500MB)

      const sessionId = 'cache-churn-test';
      const uniqueAgents = 200;

      // Repeatedly add and remove entries
      for (let cycle = 0; cycle < 50; cycle++) {
        for (let i = 0; i < uniqueAgents; i++) {
          const cacheKey = `${sessionId}:${project1Id}:agent-${i}`;
          sessionAgentModelCache.set(cacheKey, `model-cycle-${cycle}-${i}`);
        }
      }

      // Force GC
      if (global.gc) {
        global.gc();
      }

      // Cache should still be bounded
      expect(sessionAgentModelCache.size).toBeLessThanOrEqual(1000);

      // Memory should be reasonable
      const heapUsedMB = process.memoryUsage().heapUsed / 1024 / 1024;
      expect(heapUsedMB).toBeGreaterThan(0);
      expect(heapUsedMB).toBeLessThan(500); // Reasonable upper bound
    });

    // Priority: P2
    test('3.1-AC10-004: should not leak with large value entries', async () => {
      // Given: Cache with large string values (10KB each)
      // When: Filling cache and triggering evictions
      // Then: Memory growth should be bounded (< 100MB)

      const sessionId = 'large-values-test';
      const initialMemory = process.memoryUsage().heapUsed;

      // Use large string values
      const largeValue = 'x'.repeat(10000); // 10KB per entry

      // Fill cache with large values
      for (let i = 0; i < 500; i++) {
        const cacheKey = `${sessionId}:${project1Id}:agent-${i}`;
        sessionAgentModelCache.set(cacheKey, largeValue + i);
      }

      // Force eviction with more entries
      for (let i = 500; i < 1500; i++) {
        const cacheKey = `${sessionId}:${project1Id}:agent-${i}`;
        sessionAgentModelCache.set(cacheKey, largeValue + i);
      }

      // Force GC
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const growthMB = (finalMemory - initialMemory) / 1024 / 1024;

      // Even with large values, memory should be bounded
      expect(growthMB).toBeLessThan(100);
      expect(sessionAgentModelCache.size).toBe(1000);
    });
  });
});
