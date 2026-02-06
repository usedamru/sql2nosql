## Contributing

Thanks for your interest in contributing to `sql2nosql`.

### Maintainer

This project is currently maintained by **@amide-init**.

- For bigger changes, please open an issue first and tag `@amide-init` to discuss the approach.
- Maintainer has final say on scope, architecture, and release timing.

### Ways to contribute

- **Bug reports**: include steps to reproduce, expected vs actual behavior, and logs/output.
- **Feature requests**: explain the problem, proposed UX, and examples.
- **Code contributions**: small, focused PRs are easiest to review.

### Development setup

```bash
yarn install
yarn build
```

### Project principles

- **Keep core deterministic**: `packages/core` should remain pure and deterministic (no IO, no network).
- **Keep CLI thin**: `packages/cli` handles orchestration, IO, and output generation.
- **LLM is optional**: LLM features should be isolated and fail gracefully.
- **No secrets**: never commit `sql2nosql.config.json`, API keys, or credentials.

### Before submitting a PR

- Run:

```bash
yarn build
```

- Ensure new files do not include secrets.
- Keep changes scoped; avoid drive-by refactors.

### Commit messages

Prefer Conventional Commits style, e.g.:

- `feat(cli): add migrate command`
- `fix(core): handle composite primary keys`
- `docs: improve configuration examples`

