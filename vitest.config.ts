import { configDefaults, defineConfig } from 'vitest/config';

// Long-lived local worktrees (the public demo) live under .worktrees/ and carry their own copy of the tests.
export default defineConfig({ test: { exclude: [...configDefaults.exclude, '.worktrees/**'] } });
