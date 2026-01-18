#!/bin/bash
# Upstream Merge Simulation Script
# Validates NFR-R1: Survive git pull from upstream with < 10% merge conflicts
#
# Usage: ./scripts/test-upstream-merge.sh

set -e

echo "🔄 Upstream Merge Simulation Test"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Purpose: Validate Epic 1 changes survive upstream updates"
echo "Target: < 10% merge conflict rate (NFR-R1)"
echo ""

# Configuration
UPSTREAM_REPO="https://github.com/musi-code/claude-code-router.git"
TEST_BRANCH="test-upstream-merge-$(date +%s)"
ORIGINAL_BRANCH=$(git branch --show-current)

# Files modified by Epic 1
MODIFIED_FILES=(
  "packages/shared/src/index.ts"
  "packages/shared/src/constants.ts"
  "packages/cli/src/cli.ts"
  "packages/core/src/utils/router.ts"
)

# New files created by Epic 1
NEW_FILES=(
  "packages/shared/src/projectManager.ts"
  "packages/shared/src/types/agent.ts"
  "packages/shared/src/validation.ts"
)

echo "📋 Epic 1 Integration Summary:"
echo "  Modified Files: ${#MODIFIED_FILES[@]}"
for file in "${MODIFIED_FILES[@]}"; do
  echo "    - $file"
done
echo "  New Files: ${#NEW_FILES[@]}"
for file in "${NEW_FILES[@]}"; do
  echo "    - $file"
done
echo ""

# Step 1: Create test branch
echo "1️⃣  Creating test branch: $TEST_BRANCH"
git checkout -b "$TEST_BRANCH"
echo "✅ Test branch created"
echo ""

# Step 2: Add upstream remote if not exists
echo "2️⃣  Setting up upstream remote"
if ! git remote get-url upstream &>/dev/null; then
  git remote add upstream "$UPSTREAM_REPO"
  echo "✅ Upstream remote added"
else
  echo "ℹ️  Upstream remote already exists"
fi
echo ""

# Step 3: Fetch upstream
echo "3️⃣  Fetching upstream changes"
git fetch upstream
echo "✅ Upstream fetched"
echo ""

# Step 4: Simulate merge
echo "4️⃣  Simulating merge from upstream/main"
echo ""

MERGE_OUTPUT=$(git merge upstream/main --no-commit --no-ff 2>&1 || true)

# Check for conflicts
if echo "$MERGE_OUTPUT" | grep -q "CONFLICT"; then
  echo "⚠️  MERGE CONFLICTS DETECTED"
  echo ""

  # Count conflicts
  CONFLICT_FILES=$(git diff --name-only --diff-filter=U | wc -l)
  TOTAL_MODIFIED=${#MODIFIED_FILES[@]}

  CONFLICT_RATE=$(awk "BEGIN {printf \"%.2f\", ($CONFLICT_FILES / $TOTAL_MODIFIED) * 100}")

  echo "📊 Conflict Analysis:"
  echo "  Total Modified Files: $TOTAL_MODIFIED"
  echo "  Files with Conflicts: $CONFLICT_FILES"
  echo "  Conflict Rate: $CONFLICT_RATE%"
  echo ""

  echo "🔍 Conflicted Files:"
  git diff --name-only --diff-filter=U | sed 's/^/  - /'
  echo ""

  # Validate NFR-R1 target
  if (( $(echo "$CONFLICT_RATE < 10" | bc -l) )); then
    echo "✅ PASS: Conflict rate $CONFLICT_RATE% is below 10% target (NFR-R1)"
  else
    echo "❌ FAIL: Conflict rate $CONFLICT_RATE% exceeds 10% target (NFR-R1)"
  fi

  # Show conflict details
  echo ""
  echo "📝 Conflict Details:"
  for file in $(git diff --name-only --diff-filter=U); do
    echo ""
    echo "File: $file"
    echo "────────────────────────────────────────"
    git diff "$file" | grep -A 5 -B 5 "^<<<<<<<" || true
  done

  # Abort merge
  git merge --abort

else
  echo "✅ SUCCESS: No merge conflicts detected"
  echo ""
  echo "📊 Merge Analysis:"
  echo "  Total Modified Files: ${#MODIFIED_FILES[@]}"
  echo "  Files with Conflicts: 0"
  echo "  Conflict Rate: 0%"
  echo ""
  echo "✅ PASS: Meets NFR-R1 target (< 10% conflict rate)"

  # Show merge stats
  echo ""
  echo "📈 Merge Statistics:"
  git diff --stat upstream/main..HEAD | tail -20

  # Abort merge (we're just testing)
  git merge --abort
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Cleanup
echo ""
echo "🧹 Cleanup"
git checkout "$ORIGINAL_BRANCH"
git branch -D "$TEST_BRANCH"
echo "✅ Test branch deleted, restored to $ORIGINAL_BRANCH"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Upstream Merge Simulation Complete"
echo ""
echo "Next Steps:"
echo "  1. Review conflict details above (if any)"
echo "  2. If conflict rate > 10%, refine integration strategy"
echo "  3. Document actual conflict rate in NFR assessment"
echo "  4. Re-run after each Epic 2/3 integration"
