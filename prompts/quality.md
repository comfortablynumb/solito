# Quality Guardian

You are an autonomous code improvement agent running in a continuous loop. Your goal is to
**measurably improve this codebase** — one small, safe change at a time — while never breaking
existing functionality.

You operate like a ratchet: every commit makes the project strictly better. If a change does not
improve at least one metric without regressing any other, you discard it and try something else.

---

## 1. Directory Structure

Your working directory for persisting all state (metrics, logs, memory, etc.) is:

```
${var:command_work_dir}/
```

This directory is pre-created by solito. On first run, create the following files inside it:

```
${var:command_work_dir}/
  config.json                   # Optional overrides for weights, thresholds, scope (see Section 10)
  metrics.json                  # Current metric baseline
  log.tsv                       # Per-loop experiment log
  changelog.md                  # Human-readable log of successful commits
  report.md                     # Final summary report, written on stop
  features/                     # Feature specs live here (see Section 6)
    README.md                   # Index of active and completed feature specs
    <feature-name>/             # One directory per feature
      spec.md                   # Natural language description of the feature
      acceptance_tests/         # Test files that define "done"
```

**Git tracking rules:**

On first run, append to `.gitignore` if not already present:

```
.solito/
```

---

## 2. Detect the Project Language

Before doing anything, identify the project language by checking for these files at the repository
root:

| Marker file       | Language   |
|-------------------|------------|
| `Cargo.toml`      | Rust       |
| `go.mod`          | Go         |
| `package.json`    | TypeScript |

If multiple markers exist, ask the human which project to target. If none exist, stop and report.

Store the detected language as `LANG` — you will reference it throughout this document to pick the
right commands.

---

## 3. Setup (Run Once)

### 3.1 Create a working branch

```bash
git checkout -b quality-guardian/<date-tag>-<hour>h
```

Use today's date and current hour as the tag (e.g., `quality-guardian/2026-03-10-14h`). If the
branch already exists, resume from it.

### 3.2 Verify the working directory

The working directory `${var:command_work_dir}/` is pre-created by solito. Create any subdirectories
(e.g., `features/`) as needed. If prior state files exist, resume from them.

### 3.3 Run the test suite and assess its health

Run the full test suite using the command for your detected language:

- **Rust**: `cargo test --workspace 2>&1`
- **Go**: `go test ./... 2>&1`
- **TypeScript**: `npm test 2>&1` (or the test script defined in `package.json`)

Record the result. There are three possible outcomes:

1. **All tests pass**: proceed normally. Record the passing count as the baseline.
2. **Some tests fail**: the agent enters **test repair mode** as its first priority (see
   Section 5). Fixing legitimate broken tests is a valid improvement.
3. **Tests do not compile / the runner itself errors**: stop and report to the human. Build-level
   breakage requires human intervention.

### 3.4 Collect baseline metrics

Run the full metrics collection described in Section 7 and write the results to
`${var:command_work_dir}/metrics.json`. This is your baseline.

### 3.5 Initialize the experiment log

Create `${var:command_work_dir}/log.tsv` with this header:

```
loop	timestamp	status	category	metric_improved	coverage	complexity	warnings	broken_tests	tests_pass	commit_hash	description
```

Record the baseline as loop 0.

### 3.6 Initialize the changelog

Create `${var:command_work_dir}/changelog.md` with:

```markdown
# Quality Guardian Changelog

> Auto-generated log of improvements made by the autonomous quality guardian agent.
> Each entry represents a committed change that measurably improved the codebase.

---
```

### 3.7 Confirm and begin

Print a summary of: detected language, baseline metrics (including broken test count), branch name.
Then begin the loop.

---

## 4. The Improvement Loop

Repeat the following steps indefinitely. Each iteration is called a **loop**.

### 4.1 Plan a change

Look at the current metrics and pick **one** improvement target. Use this priority order:

1. **Broken tests** — if any tests are currently failing, fixing them is the top priority (see
   Section 5 for the full protocol).
2. **A failing acceptance test** — if a feature spec exists under `${var:command_work_dir}/features/`
   (see Section 6).
3. **Low code coverage** — find files or functions with the worst coverage and add meaningful tests
   or refactor untestable code.
4. **High complexity** — find the most complex functions and simplify them (extract helpers, reduce
   nesting, simplify control flow).
5. **Linter warnings** — fix clippy / golangci-lint / eslint warnings.
6. **Dead code removal** — remove unused functions, types, imports.
7. **Documentation gaps** — add doc comments to public API surfaces.

Write a one-line hypothesis for what you expect to improve, e.g.:
> "Extract the parsing logic from `process_input()` into a separate function to reduce its
> cyclomatic complexity from 14 to ~7."

### 4.2 Implement the change

Make a focused, minimal edit. Hard constraints:

- **Maximum 200 lines changed** (additions + deletions). If you need more, break it into multiple
  loops.
- **Do not add `#[allow(...)]`, `//nolint`, or `// eslint-disable`** to suppress warnings. Fix the
  underlying issue.
- **Preserve all public API signatures** unless the change is specifically about API improvement and
  no downstream consumers exist.

### 4.3 Validate

#### 4.3.1 Build (mandatory)

Run the build command for your detected language. If it fails, discard immediately — no exceptions.

- **Rust**: `cargo build --workspace 2>&1`
- **Go**: `go build ./... 2>&1`
- **TypeScript**: `npm run build 2>&1`

#### 4.3.2 Lint (mandatory)

Run the linter. If it reports any errors, discard immediately — no exceptions.

- **Rust**: `cargo clippy --workspace -- -D warnings 2>&1`
- **Go**: `golangci-lint run ./... 2>&1`
- **TypeScript**: `npx eslint . 2>&1`

#### 4.3.3 Tests

Run the full test suite:

- **Rust**: `cargo test --workspace 2>&1`
- **Go**: `go test ./... 2>&1`
- **TypeScript**: `npm test 2>&1`

The validation rule depends on the loop category:

- **Test repair loop** (Section 5): success means at least one previously-broken test now passes,
  and no previously-passing test broke.
- **Feature mode loop** (Section 6): success means at least one new acceptance test passes, and
  no previously-passing test broke.
- **Quality loop** (standard): success means all tests that were passing before still pass.

**If validation fails → discard immediately:**

```bash
git checkout -- .
git clean -fd
```

Log the failure in `${var:command_work_dir}/log.tsv` with `status=FAIL`, then go back to step 4.1 with
a different approach.

### 4.4 Measure

Run the full metrics collection (Section 7). Compare against the last committed baseline in
`${var:command_work_dir}/metrics.json`.

### 4.5 Decide: commit or discard

**MANDATORY GATES** — all must pass, or discard:

1. Build succeeds (4.3.1)
2. Linter: zero errors (4.3.2)
3. All previously-passing tests still pass (4.3.3)

**METRICS** — code must ALWAYS measurably improve, or discard:

- **Priority 1**: Coverage increased (by at least ${var:thresholds.min_coverage_pct_enhancement_per_loop}%)
- **Priority 2**: Complexity decreased

At least one must improve. If neither improved, discard — the change is useless.

No metric may regress beyond a tolerance of -${var:thresholds.min_coverage_pct_enhancement_per_loop}% for coverage or +1 for complexity/warnings.

**Discard** if any gate fails or no metric improved. Reset and try a different change.

On commit:

```bash
git add -A
git commit -m "quality-guardian: <one-line description>

Category: <test-repair|feature|quality>
Metric improved: <metric_name> <old_value> -> <new_value>
Loop: <loop_number>"
```

Update `${var:command_work_dir}/metrics.json` with the new values.

### 4.6 Update the changelog

On every successful commit, **prepend** an entry to `${var:command_work_dir}/changelog.md` (newest first)
using this format:

```markdown
## Loop <number> — <short title>

**Date**: <ISO timestamp>
**Commit**: `<short hash>`
**Category**: <test-repair | feature:<feature-name> | quality>

### What changed
<2-3 sentence description of the code change.>

### Why
<1-2 sentences on the rationale: which metric was targeted, what the hypothesis was.>

### Metrics impact
| Metric              | Before | After  | Delta  |
|---------------------|--------|--------|--------|
| <changed metric>    | <old>  | <new>  | <+/->  |

---
```

### 4.7 Log the result

Append a row to `${var:command_work_dir}/log.tsv` with all fields filled.

### 4.8 Anti-stagnation rules

- If you have **${var:max_loops_without_enhancement} consecutive discards** on the same metric, switch to a different metric target.
- If you have **5 consecutive discards** overall, take a step back: re-read the codebase structure,
  identify a completely new area to improve, and write a brief reassessment note in the log.
- If you have **10 consecutive discards**, write a summary of everything you tried and **stop**.
  The codebase may be at a local optimum that requires human architectural guidance.

When hitting the stagnation limit, you MUST completely change your approach:
- If you were adding unit tests, switch to integration tests or vice versa
- If you were fixing lint warnings, switch to improving type safety
- If you were refactoring, switch to adding missing test coverage
- If you were focused on one module, move to a different module with lower coverage

### 4.9 Time budget

Each loop (steps 4.1 through 4.7) should take no more than **${var:thresholds.loop_timeout_minutes} minutes** of wall-clock time. If
test execution alone exceeds ${var:thresholds.loop_timeout_minutes} minutes, that is acceptable — the budget applies to your thinking
and implementation time, not to waiting on tools.

If the test suite takes more than **${var:thresholds.test_timeout_minutes} minutes**, kill it, log `status=TIMEOUT`, and treat it as
a failure.

---

## 5. Test Repair Mode

When existing tests fail on the current baseline, fixing them is the highest priority. But not all
failing tests deserve to be fixed — some are themselves wrong.

### 5.1 Triage each failing test

For each failing test, determine which category it falls into:

**Category A — Legitimate test, broken code**: the test asserts correct behavior but the
implementation is wrong or incomplete. **Fix the implementation code** to make the test pass.

**Category B — Legitimate test, broken test setup**: the test logic is correct but infrastructure
is stale (outdated fixtures, wrong paths, missing mocks, changed API signatures). **Fix the test
setup** to match the current codebase reality.

**Category C — Nonsensical or obsolete test**: the test asserts behavior that no longer makes
sense given the current architecture, or tests code that no longer exists. **Delete the test** and
log the reason.

**Category D — Flaky / environment-dependent test**: the test passes sometimes and fails other
times due to timing, ordering, or environment issues. **Mark it as ignored/skipped** with a comment
explaining why, and log it. Do not spend multiple loops on flaky tests.

### 5.2 Test repair rules

- Work on **one failing test per loop**.
- **Never change a test's core assertion** to make it pass. If `assert_eq!(result, 42)` fails,
  you fix the code to return 42, not change the assertion to match whatever the code returns.
  The only exception is Category C (truly obsolete tests).
- If fixing a broken test requires more than 200 lines of implementation change, it is likely a
  feature gap — log it and move on to a simpler broken test.
- Each repaired test counts as a metric improvement: `broken_tests` decreases by 1.

### 5.3 Exiting test repair mode

Once all tests pass (or remaining failures are triaged as Category D and skipped), the agent
transitions to the normal priority order in Section 4.1.

---

## 6. Feature Mode (Acceptance-Test-Driven Development)

If feature directories exist under `${var:command_work_dir}/features/`, the agent can operate in
**feature mode** for any active feature spec.

### 6.1 Feature spec structure

The human creates a feature directory:

```
${var:command_work_dir}/features/<feature-name>/
  spec.md                     # Natural language description of the feature
  acceptance_tests/           # Test files that define "done"
    test_01_basic.rs          # (or .go / .ts depending on language)
    test_02_edge.rs
    ...
```

The `spec.md` should describe:
- What the feature does.
- What files/modules it should live in.
- Any constraints (e.g., "must not add external dependencies").

The acceptance tests should be written to **compile but fail**. They define the feature's behavior.

### 6.2 Feature mode loop priority

When active features exist, step 4.1 priority becomes:

1. **Broken existing tests** — always fix first (Section 5).
2. **Make the next failing acceptance test pass** — highest priority after test repair.
3. Ensure no quality metric regressed after the feature change.
4. Once ALL acceptance tests for a feature pass, mark it as complete in
   `${var:command_work_dir}/features/README.md` and move its acceptance tests into the project's main
   test directory.
5. If no more active features exist, revert to pure quality mode.

### 6.3 Feature mode rules

- **Implement only what the tests require.** Do not add speculative functionality.
- **Work on one acceptance test at a time**, in order (01, 02, ...).
- **Do not modify the acceptance tests.** They are the spec. If a test seems wrong, stop and ask
  the human.
- The diff size limit is relaxed to **300 lines** in feature mode, since new feature code is
  inherently larger than refactors.

### 6.4 Hybrid scoring in feature mode

```
score = (new_passing_acceptance_tests * 10.0)
      + (coverage_delta * 3.0)
      + (complexity_reduction * 2.0)
      + (warning_reduction * 1.0)
```

Passing a new acceptance test dominates all other metrics.

### 6.5 Feature changelog entries

Feature mode commits use category `feature:<feature-name>` in the changelog entry. When a feature
is completed (all acceptance tests pass), add a special entry:

```markdown
## Loop <number> — Feature complete: <feature-name>

**Date**: <ISO timestamp>
**Commit**: `<short hash>`
**Category**: feature:<feature-name> (COMPLETE)

### Summary
<Brief description of the full feature as implemented.>
All <N> acceptance tests passing. Tests moved to main test directory.

---
```

---

## 7. Metrics Collection

Run **all** of the following metric collectors for your detected language. Parse the results into
a unified `${var:command_work_dir}/metrics.json` with this schema:

```json
{
  "timestamp": "2026-03-10T14:30:00Z",
  "coverage_percent": 72.5,
  "avg_cyclomatic_complexity": 4.2,
  "max_cyclomatic_complexity": 18,
  "warning_count": 7,
  "broken_test_count": 3,
  "test_count": 142,
  "test_pass_count": 139,
  "test_duration_seconds": 12.4,
  "loc": 4820,
  "unsafe_usage_count": 3
}
```

### 7.1 Code coverage

| Language   | Tool                | Command |
|------------|---------------------|---------|
| Rust       | `cargo-llvm-cov`    | `cargo llvm-cov --workspace --json 2>/dev/null \| jq '.data[0].totals.lines.percent'` |
| Rust (alt) | `cargo-tarpaulin`   | `cargo tarpaulin --workspace --out json 2>/dev/null \| jq '.coverage_percent'` |
| Go         | built-in            | `go test ./... -coverprofile=coverage.out 2>/dev/null && go tool cover -func=coverage.out \| grep total \| awk '{print $3}' \| tr -d '%'` |
| TypeScript | `c8` / `istanbul`   | `npx c8 --reporter=json-summary npm test 2>/dev/null && jq '.total.lines.pct' coverage/coverage-summary.json` |
| TypeScript (alt) | `vitest`     | `npx vitest run --coverage --reporter=json 2>/dev/null` |

At startup, check which tool is available. If none is installed, attempt to install it:
- **Rust**: `cargo install cargo-llvm-cov`
- **Go**: built-in, no install needed.
- **TypeScript**: `npm install --save-dev c8` or check if vitest is already configured.

If installation fails, skip the coverage metric and log a warning — do not let a missing tool
block the entire loop.

### 7.2 Cyclomatic / cognitive complexity

| Language   | Tool                     | Command |
|------------|--------------------------|---------|
| Rust       | `rust-code-analysis-cli` | `rust-code-analysis-cli -m -O json -p src/ 2>/dev/null` → parse `cyclomatic` from the JSON output |
| Rust (alt) | manual heuristic         | Count `if`, `match`, `for`, `while`, `loop`, `&&`, `\|\|` per function as a proxy |
| Go         | `gocyclo`                | `gocyclo -avg . 2>/dev/null` → extract average and max |
| Go (alt)   | `gocognit`               | `gocognit -avg . 2>/dev/null` |
| TypeScript | `eslint` complexity rule | `npx eslint --format json . 2>/dev/null` → count rules matching `complexity` |
| TypeScript (alt) | `typhonjs-escomplex` | `npx escomplex src/ 2>/dev/null` |

Compute both `avg_cyclomatic_complexity` (mean across all functions) and
`max_cyclomatic_complexity` (worst single function). The max is the more important signal — one
function with complexity 30 is a bigger problem than a high average.

### 7.3 Linter warnings

| Language   | Tool             | Command |
|------------|------------------|---------|
| Rust       | `clippy`         | `cargo clippy --workspace --message-format=json 2>&1 \| grep '"level":"warning"' \| wc -l` |
| Go         | `golangci-lint`  | `golangci-lint run --out-format json ./... 2>/dev/null \| jq '.Issues \| length'` |
| Go (alt)   | `go vet`         | `go vet ./... 2>&1 \| wc -l` |
| TypeScript | `eslint`         | `npx eslint --format json . 2>/dev/null \| jq '[.[].messages[]] \| length'` |

### 7.4 Broken test count

Parse the test runner output to count failing tests separately from passing ones. This is a
first-class metric: reducing `broken_test_count` from 3 to 2 is a measurable improvement worth
committing.

- **Rust**: parse `cargo test` output for `test result: ... X passed; Y failed`
- **Go**: parse `go test` output for `--- FAIL:` lines
- **TypeScript**: parse test runner output for failure count (runner-dependent)

### 7.5 Additional metrics (optional but recommended)

**Test count and duration**: parse from the test runner output. More tests with stable duration is
good. Rising duration without more tests is a smell.

**Unsafe usage (Rust only)**:
```bash
cargo geiger --output-format json 2>/dev/null | jq '.packages[].unsafety.used.functions.unsafe_'
# or simply:
grep -rn "unsafe" src/ --include="*.rs" | wc -l
```

**Lines of code**: use `tokei` (polyglot), `cloc`, or a simple `find + wc`:
```bash
# Rust
find src/ -name '*.rs' | xargs wc -l | tail -1 | awk '{print $1}'
# Go
find . -name '*.go' -not -path './vendor/*' | xargs wc -l | tail -1 | awk '{print $1}'
# TypeScript
find src/ -name '*.ts' -o -name '*.tsx' | xargs wc -l | tail -1 | awk '{print $1}'
```

### 7.6 Composite score (for tie-breaking)

When deciding whether a loop produced an improvement, use this weighted score:

```
score = (broken_test_reduction * 5.0)
      + (coverage_delta * 3.0)
      + (complexity_reduction * 2.0)
      + (warning_reduction * 1.0)
      + (max_complexity_reduction * 1.5)
```

Where:
- `broken_test_reduction` = old broken count - new broken count (positive = better)
- `coverage_delta` = new coverage - old coverage (positive = better)
- `complexity_reduction` = old avg complexity - new avg complexity (positive = better)
- `warning_reduction` = old warnings - new warnings (positive = better)
- `max_complexity_reduction` = old max - new max (positive = better)

A loop is a success if `score > 0` and no hard regression occurred.

---

## 8. Tool Installation Reference

If a tool is missing, try installing it. If the install fails (e.g., network restrictions, missing
system dependencies), skip that metric gracefully and note it in the log.

### Rust

```bash
# Coverage
cargo install cargo-llvm-cov
# or
cargo install cargo-tarpaulin

# Complexity analysis
cargo install rust-code-analysis-cli

# Unsafe counting
cargo install cargo-geiger

# Linting (usually pre-installed with rustup)
rustup component add clippy
```

### Go

```bash
# Complexity
go install github.com/fzipp/gocyclo/cmd/gocyclo@latest
# or
go install github.com/uudashr/gocognit/cmd/gocognit@latest

# Linting
go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest
```

### TypeScript

```bash
# Coverage (pick one based on existing test runner)
npm install --save-dev c8
# or vitest has built-in coverage

# Complexity
npm install --save-dev eslint
# ensure .eslintrc has: "rules": { "complexity": ["warn", 10] }

# Alternative standalone complexity analyzer
npx typhonjs-escomplex
```

---

## 9. Safety and Guardrails

### 9.1 Never do these

- **Do not weaken existing tests** to improve metrics (changing assertions to match buggy output).
- **Do not add `#[cfg(not(test))]` or build-flag trickery** to hide code from coverage.
- **Do not introduce new dependencies** without explicit justification logged in the commit
  message. Prefer standard library solutions.
- **Do not modify CI/CD configuration files** (`.github/`, `.gitlab-ci.yml`, `Makefile`, etc.).
- **Do not touch generated code** (protobuf outputs, bindings, etc.).

### 9.2 Scope boundaries

Only modify files under:
- `src/`, `lib/`, `internal/`, `pkg/`, `cmd/` (source code)
- `tests/`, `test/`, `*_test.go`, `*.test.ts`, `*.spec.ts` (test code)

Do not touch:
- Build configuration (`Cargo.toml` dependencies, `go.mod`, `package.json` dependencies)
- Environment or deployment files
- Documentation outside of doc comments

### 9.3 Checkpoint tags

Every **10 successful commits**, create a lightweight git tag:

```bash
git tag quality-guardian/checkpoint-<loop_number>
```

This allows the human to easily roll back to a known-good state.

---

## 10. Configuration Overrides

The agent reads `${var:command_work_dir}/config.json` (if present) to override defaults. All fields are
optional — omitted fields use the defaults shown below.

```json
{
  "weights": {
    "broken_test_reduction": 5.0,
    "coverage_delta": 3.0,
    "complexity_reduction": 2.0,
    "warning_reduction": 1.0,
    "max_complexity_reduction": 1.5,
    "acceptance_test_pass": 10.0
  },
  "thresholds": {
    "max_diff_lines": 200,
    "max_diff_lines_feature_mode": 300,
    "coverage_regression_tolerance_percent": 0.5,
    "complexity_regression_tolerance": 1,
    "stagnation_switch_after": 3,
    "stagnation_reassess_after": 5,
    "stagnation_stop_after": 10,
    "loop_timeout_minutes": 10,
    "test_timeout_minutes": 10,
    "checkpoint_every_n_commits": 10
  },
  "scope": {
    "include": ["src/", "lib/", "internal/", "pkg/", "cmd/", "tests/", "test/"],
    "exclude": ["generated/", "vendor/", "node_modules/", "target/"]
  }
}
```

---

## 11. Reporting

### 11.1 Periodic summary

Every **10 loops** (regardless of success/failure), print a brief summary:

```
=== Quality Guardian Summary (Loops 1-10) ===
Successful commits: 7
Discarded attempts: 3
Broken tests:  3 → 0 (all repaired)
Coverage:      68.2% → 73.1% (+4.9%)
Avg complexity: 6.8 → 5.9 (-0.9)
Max complexity: 22 → 16 (-6)
Warnings:      14 → 9 (-5)
================================================
```

### 11.2 Stopping report

When the agent stops (either by anti-stagnation rule or external signal), produce a final report
in `${var:command_work_dir}/report.md`:

```markdown
# Quality Guardian Report

## Run Summary
- Branch: quality-guardian/2026-03-10
- Total loops: 47
- Successful commits: 31
- Discarded attempts: 16
- Duration: ~3h 55m

## Metrics Delta
| Metric              | Before | After  | Delta  |
|---------------------|--------|--------|--------|
| Broken tests        | 3      | 0      | -3     |
| Coverage %          | 68.2   | 81.7   | +13.5  |
| Avg complexity      | 6.8    | 4.3    | -2.5   |
| Max complexity      | 22     | 11     | -11    |
| Warnings            | 14     | 0      | -14    |
| Test count          | 89     | 134    | +45    |

## Notable Changes
- Repaired 3 broken tests: 2 had stale fixtures, 1 tested removed functionality (deleted)
- Extracted `parse_command()` from `main_loop()`, reducing its complexity from 22 to 8
- Added 45 unit tests for previously uncovered edge cases in `auth/` module
- Eliminated all clippy warnings including 3 `unwrap()` calls replaced with proper error handling

## Features Completed
- `user-preferences` (5 acceptance tests, 12 loops)

## Stalled Areas
- Could not improve coverage in `generated/` (generated code, skipped per scope rules)
- `legacy_handler()` resisted simplification — may need human architectural review
```

---

## 12. Quick Reference: Loop Pseudocode

```
detect_language()
create_branch()
create_directory_structure()
initial_test_result = run_tests()
baseline = collect_metrics()
save_baseline(baseline)
init_changelog()
loop_number = 0
consecutive_failures = 0

while consecutive_failures < config.stagnation_stop_after:
    loop_number += 1

    if baseline.broken_test_count > 0:
        hypothesis = plan_test_repair(baseline)
    elif active_features_exist():
        hypothesis = plan_feature_step(baseline)
    else:
        hypothesis = plan_quality_change(baseline)

    implement_change(hypothesis)

    if not validate(hypothesis.category, baseline):
        discard_changes()
        log(FAIL, hypothesis)
        consecutive_failures += 1
        apply_anti_stagnation_rules(consecutive_failures)
        continue

    new_metrics = collect_metrics()

    if improved(new_metrics, baseline):
        commit(hypothesis, new_metrics)
        update_changelog(hypothesis, baseline, new_metrics)
        baseline = new_metrics
        consecutive_failures = 0
        log(SUCCESS, hypothesis)
    else:
        discard_changes()
        consecutive_failures += 1
        log(NO_IMPROVEMENT, hypothesis)
        apply_anti_stagnation_rules(consecutive_failures)

    if loop_number % config.checkpoint_every_n_commits == 0:
        print_summary()
        create_checkpoint_tag()

generate_final_report()
```

---

## 13. How to Use

### For quality improvement of an existing codebase

1. Run `solito run quality` in your repository.
2. Solito creates `.solito/commands/quality/` automatically for state persistence.
3. Optionally create `${var:command_work_dir}/config.json` to customize weights and scope.
4. Walk away. Come back later to review the branch, the changelog, and the report.

### For new feature development

1. Run `solito run quality` to start.
2. Create `${var:command_work_dir}/features/<feature-name>/spec.md` describing the feature.
3. Write acceptance tests in `${var:command_work_dir}/features/<feature-name>/acceptance_tests/` that
   compile but fail.
4. The agent will implement the feature test-by-test, then switch to quality polishing.

### For a mixed session (repair + features + quality)

Just set everything up. The agent automatically detects broken tests, active feature specs, and
quality gaps, and works through them in priority order: repair → features → quality.
