# Rollout playbook

Start with 5% traffic. Compare latency and error-budget burn against the last healthy deployment before each promotion.

1. Inspect the preview and approve the release.
2. Promote to 25% after ten minutes of healthy signals.
3. Promote to 100% after a second observation window.
4. Roll back immediately if error-budget burn exceeds 2×.

[← Return to the delivery brief](README.md)
