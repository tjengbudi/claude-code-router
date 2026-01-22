/**
 * NFR Test Constants and Thresholds
 *
 * Single source of truth for all NFR performance thresholds and scale limits.
 * These constants map directly to NFR requirements from Epic 1 NFR Assessment.
 *
 * @see _bmad-output/nfr-assessment-epic-1.md
 */

/**
 * Performance thresholds for NFR compliance
 */
export const NFR_THRESHOLDS = {
  /**
   * NFR-P1: Agent ID extraction must complete in < 50ms
   * Critical for request routing performance
   */
  AGENT_EXTRACTION_LATENCY_MS: 50,

  /**
   * NFR-SC2: File I/O operations (projects.json load) must complete in < 100ms
   * Ensures fast startup and configuration reloads
   */
  FILE_IO_LATENCY_MS: 100,

  /**
   * NFR-P3: Agent system overhead must be < 10% vs vanilla CCR
   * Ensures minimal performance impact for BMM users
   */
  SYSTEM_OVERHEAD_PERCENT: 10,

  /**
   * NFR-SC3: Memory usage must stay under 50MB at max capacity
   * Prevents memory bloat with 20 projects and 50 agents
   */
  MEMORY_USAGE_MAX_MB: 50,

  /**
   * Early exit optimization target for non-BMM users
   * String search overhead when no agent ID present
   */
  NON_BMM_OVERHEAD_MS: 1,

  /**
   * Agent lookup performance target (O(1) or O(m) where m=projects)
   * Fast in-memory lookup after projects.json is loaded
   */
  AGENT_LOOKUP_LATENCY_MS: 10,

  /**
   * Concurrent lookup latency target under load
   * Maintains low latency even with 100+ concurrent requests
   */
  CONCURRENT_LOOKUP_LATENCY_MS: 5,

  /**
   * Atomic file write performance target
   * Includes backup creation and validation
   */
  ATOMIC_WRITE_LATENCY_MS: 100,
} as const;

/**
 * Scale limits for NFR compliance
 */
export const NFR_SCALE_LIMITS = {
  /**
   * NFR-SC3: Maximum number of projects supported
   */
  MAX_PROJECTS: 20,

  /**
   * NFR-SC3: Maximum number of agents across all projects
   */
  MAX_AGENTS: 50,

  /**
   * Typical agents per project for realistic testing
   */
  TYPICAL_AGENTS_PER_PROJECT: 4,

  /**
   * Stress test: concurrent operations target
   */
  STRESS_TEST_OPERATIONS: 500,

  /**
   * Load test: concurrent users simulation
   */
  LOAD_TEST_CONCURRENT_USERS: 5,

  /**
   * Performance degradation threshold (max acceptable ratio)
   * Performance should not degrade more than 3x under maximum load
   */
  MAX_PERFORMANCE_DEGRADATION_RATIO: 3,
} as const;

/**
 * Test iteration counts for performance benchmarking
 */
export const BENCHMARK_ITERATIONS = {
  /**
   * Standard iteration count for latency measurements
   * Provides statistically significant sample size
   */
  STANDARD: 100,

  /**
   * Quick iteration count for smoke tests
   */
  QUICK: 30,

  /**
   * Extended iteration count for stability testing
   */
  EXTENDED: 1000,

  /**
   * Load test operations per user
   */
  OPS_PER_USER: 20,
} as const;

/**
 * Test timeouts (in milliseconds)
 */
export const TEST_TIMEOUTS = {
  /**
   * Standard test timeout (Jest default extended)
   */
  STANDARD: 10000,

  /**
   * Performance test timeout (allows for benchmarking overhead)
   */
  PERFORMANCE: 30000,

  /**
   * Load test timeout (handles concurrent operations)
   */
  LOAD_TEST: 60000,

  /**
   * Safety timeout for performance loops
   * Prevents infinite loops in benchmarking code
   */
  BENCHMARK_SAFETY: 30000,
} as const;

/**
 * Test ID prefixes for traceability
 */
export const TEST_ID_PREFIX = {
  SECURITY_API_KEY_ISOLATION: 'NFR-S1',
  SECURITY_FILE_SYSTEM_ACCESS: 'NFR-S2',
  SECURITY_UUID_VALIDATION: 'NFR-S3',
  SECURITY_CONFIG_INTEGRITY: 'NFR-S4',
  RELIABILITY_UPSTREAM_COMPAT: 'NFR-R1',
  RELIABILITY_AUTO_RETRY: 'NFR-R2',
  RELIABILITY_GRACEFUL_DEGRADE: 'NFR-R3',
  PERFORMANCE_EXTRACTION_LATENCY: 'NFR-P1',
  PERFORMANCE_FILE_IO: 'NFR-P2',
  PERFORMANCE_CACHE_IO_REDUCTION: 'NFR-P2-CACHE',
  PERFORMANCE_SYSTEM_OVERHEAD: 'NFR-P3',
  SCALABILITY: 'NFR-SC3',
  INTEGRATION: 'NFR-I',
  MAINTAINABILITY: 'NFR-M',
} as const;
