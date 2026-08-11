Test Plan: Patch 11-12-15 (End-to-end depletion, exports, tests)

- Patch 11: Real needs generation integration
  - Verify that needs are generated from actual recipe ingredients and depletion flows correctly for week and month windows
- Patch 12: Consolidated export format
  - Verify the all-in-one Shopping_All.csv contains both week and month data, with a Period column distinguishing week and month
- Patch 13: Tests
  - Unit tests for depletion engine and needs generation (progressively stronger coverage as data gets real)
  - Integration tests for plan → depletion → shopping lists
- Patch 14: UX polish
  - Incremental polish for modals, error states, and accessibility hooks
- Patch 15: Documentation
  - Update patch plan and privacy docs; onboarding notes

This file outlines the test plan so you can review before running tests in CI or locally.
