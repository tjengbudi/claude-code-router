# NFR Test Suite - Epic 1 Validation

## Overview

This directory contains comprehensive Non-Functional Requirements (NFR) test suites that validate Epic 1 implementation against all NFR criteria identified in the NFR Assessment.

**Purpose:** Provide automated evidence for all NFR categories (Security, Reliability, Performance, Maintainability) to replace manual validation and eliminate evidence gaps.

## Test Structure

```
tests/nfr/
├── security.spec.ts         # NFR-S1, NFR-S2, NFR-S3, NFR-S4 validation
├── reliability.spec.ts      # NFR-R1, NFR-R3 validation
├── performance.spec.ts      # NFR-P1, NFR-P2, NFR-P3, NFR-SC2, NFR-SC3 validation
├── load-testing.spec.ts     # Concurrent operations, stress testing
└── fixtures/                # Test fixtures and mock data
```

## Test Coverage Summary

### Security Tests (security.spec.ts)
**Validates:** NFR-S1, NFR-S2, NFR-S3, NFR-S4

- ✅ **NFR-S1:** API Key Isolation
  - `projects.json` NEVER contains API keys
  - Only `provider,model` format allowed
  - `config.json` is gitignored

- ✅ **NFR-S2:** File System Access Control
  - Write permission checks before file modification
  - Path traversal prevention
  - Atomic file write with backup/rollback

- ✅ **NFR-S3:** UUID Validation
  - Valid UUID v4 format accepted
  - SQL injection rejected
  - XSS injection rejected
  - Path traversal rejected
  - Command injection rejected

- ✅ **NFR-S4:** Configuration File Integrity
  - Valid schema accepted
  - Corrupted JSON gracefully degraded
  - Invalid schema gracefully degraded
  - Missing file gracefully degraded
  - Malicious content rejected

**Total Security Tests:** 15 tests

---

### Reliability Tests (reliability.spec.ts)
**Validates:** NFR-R1, NFR-R3

- ✅ **NFR-R3:** Graceful Degradation
  - System works when `projects.json` missing
  - System works when `projects.json` corrupted
  - System works when agent not configured
  - System works when agent ID invalid
  - Fallback to default when agent system fails

- ✅ **Error Handling & Recovery**
  - File write failure rolls back to original state
  - Concurrent file modifications are safe (idempotent)
  - Parallel agent discovery is safe

- ✅ **Atomic File Operations**
  - Atomic write creates backup before modification
  - Atomic write preserves content on success
  - No data loss on write failure

- ✅ **NFR-R1:** Upstream Compatibility
  - Minimal surface area for merge conflicts (validated)
  - Graceful degradation for non-BMM users

**Total Reliability Tests:** 12 tests

---

### Performance Tests (performance.spec.ts)
**Validates:** NFR-P1, NFR-P2, NFR-P3, NFR-SC2, NFR-SC3

- ✅ **NFR-P1:** Agent ID Extraction Latency
  - Extraction completes in < 50ms (100 iterations avg)
  - Non-BMM overhead < 1ms (early exit optimization)

- ✅ **NFR-SC2:** File I/O Operations
  - `projects.json` load < 100ms (5 projects, 20 agents)
  - Atomic file write < 100ms

- ✅ **NFR-P3:** System Overhead
  - Agent system overhead < 10% vs baseline
  - Comparison: vanilla CCR vs agent system routing

- ✅ **NFR-SC3:** Scalability
  - Supports 20 projects with 50 agents (load < 100ms)
  - Agent lookup performance at scale (< 10ms avg)
  - Memory usage < 50MB at max capacity

**Total Performance Tests:** 8 tests

---

### Load Testing (load-testing.spec.ts)
**Validates:** Concurrent operations, stress testing, performance degradation

- ✅ **Concurrent Operations**
  - 10 concurrent project additions without race conditions
  - 100 concurrent agent lookups without degradation
  - Concurrent agent injection (idempotent)
  - 5 concurrent users (multi-user scenario)

- ✅ **Stress Testing**
  - Maximum capacity (20 projects, 50 agents, 500 lookups)
  - Performance degradation threshold detection
  - Throughput measurement (ops/sec)

**Total Load Tests:** 6 tests

---

## Running Tests

### Run All NFR Tests
```bash
npm run test:nfr
```

### Run Specific Test Suite
```bash
# Security tests only
npm test tests/nfr/security.spec.ts

# Reliability tests only
npm test tests/nfr/reliability.spec.ts

# Performance tests only
npm test tests/nfr/performance.spec.ts

# Load testing only
npm test tests/nfr/load-testing.spec.ts
```

### Run with Coverage
```bash
npm run test:nfr:coverage
```

### Run in Watch Mode (Development)
```bash
npm run test:nfr:watch
```

---

## NFR Validation Results

### Expected Baseline (Epic 1 Target)

| NFR ID | Category | Threshold | Expected Result |
|--------|----------|-----------|-----------------|
| **NFR-S1** | Security | API keys NEVER in git files | ✅ PASS |
| **NFR-S2** | Security | Write permission validation | ✅ PASS |
| **NFR-S3** | Security | UUID injection prevention | ✅ PASS |
| **NFR-S4** | Security | Config integrity validation | ✅ PASS |
| **NFR-R1** | Reliability | < 10% merge conflict rate | ✅ PASS (0% expected) |
| **NFR-R3** | Reliability | Graceful degradation | ✅ PASS |
| **NFR-P1** | Performance | < 50ms agent ID extraction | ✅ PASS (~1.1ms) |
| **NFR-P3** | Performance | < 10% system overhead | ✅ PASS |
| **NFR-SC2** | Scalability | < 100ms file load | ✅ PASS |
| **NFR-SC3** | Scalability | 20 projects, 50 agents | ✅ PASS |

**Overall Status:** ✅ **ALL PASS** (41 tests total)

---

## Upstream Merge Simulation

### Running Merge Simulation
```bash
# Test upstream compatibility (NFR-R1)
./scripts/test-upstream-merge.sh
```

This script:
1. Creates test branch
2. Adds upstream remote (claude-code-router)
3. Fetches upstream changes
4. Simulates merge from upstream/main
5. Detects conflicts and calculates conflict rate
6. Validates < 10% target (NFR-R1)
7. Cleans up test branch

**Expected Result:** 0% conflict rate (4 modified files, 2 new files)

---

## Integration with Development Workflow

### Before Committing
```bash
# Run NFR tests to validate changes
npm run test:nfr

# If all pass, proceed with commit
git add .
git commit -m "Your commit message"
```

### Before Epic 2 Start
```bash
# Validate Epic 1 NFR baseline
npm run test:nfr
./scripts/test-upstream-merge.sh

# All should PASS before proceeding
```

### Continuous Validation
```bash
# Re-run NFR tests after each story completion
npm run test:nfr

# Re-run upstream merge simulation quarterly
./scripts/test-upstream-merge.sh
```

---

## Test Fixtures

Test fixtures are located in `tests/nfr/fixtures/` and include:

- **test-project/**: Mock BMM project structure
- **test-projects.json**: Sample projects configuration
- **test-*.md**: Mock agent files for injection testing

Fixtures are automatically created/cleaned up by test lifecycle hooks (`beforeEach`, `afterEach`).

---

## Troubleshooting

### Test Failures

**"Permission denied" errors:**
```bash
# Ensure test directories are writable
chmod -R 755 tests/nfr/fixtures/
```

**"Module not found" errors:**
```bash
# Install dependencies
npm install

# Rebuild project
npm run build
```

**Performance test flakiness:**
```bash
# Run tests with increased timeout
npm test tests/nfr/performance.spec.ts -- --testTimeout=30000
```

### Upstream Merge Simulation Failures

**"Upstream remote not found":**
```bash
# Manually add upstream remote
git remote add upstream https://github.com/musi-code/claude-code-router.git
git fetch upstream
```

**Conflict rate > 10%:**
1. Review conflict details in script output
2. Identify conflicted files
3. Refine integration strategy (less invasive patterns)
4. Re-run simulation after fixes

---

## Contributing

When adding new NFR tests:

1. **Follow existing patterns:**
   - Use descriptive test names
   - Include NFR ID in test description
   - Document expected thresholds
   - Log performance metrics to console

2. **Ensure isolation:**
   - Tests must be runnable in any order
   - Use unique fixtures per test
   - Clean up in `afterEach` hooks

3. **Validate coverage:**
   - Each NFR must have at least 1 automated test
   - Critical paths need multiple test cases
   - Edge cases must be covered

4. **Update documentation:**
   - Add test to this README
   - Update NFR assessment evidence
   - Document any new thresholds

---

## References

- **NFR Assessment Report:** `_bmad-output/nfr-assessment.md`
- **Epic 1 Retrospective:** `_bmad-output/implementation-artifacts/epic-1-retro-2026-01-18.md`
- **Architecture Document:** `_bmad-output/planning-artifacts/architecture.md`
- **NFR Criteria Knowledge Base:** `_bmad/bmm/testarch/knowledge/nfr-criteria.md`

---

**Last Updated:** 2026-01-18
**Test Suite Version:** 1.0.0
**Epic:** Epic 1 - Project & Agent Discovery Foundation
