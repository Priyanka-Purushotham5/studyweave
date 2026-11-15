#!/bin/bash
# Install as a root-owned SSH ForceCommand; no shell or arbitrary command access.
set -euo pipefail
command_text=${SSH_ORIGINAL_COMMAND:-}
if [[ "$command_text" =~ ^deploy\ ([0-9a-f]{40})$ ]]; then
  exec sudo -n /usr/local/sbin/studynova-deploy deploy "${BASH_REMATCH[1]}"
elif [[ "$command_text" =~ ^rollback\ ([0-9]{8}T[0-9]{6}Z-[0-9a-f]{7})$ ]]; then
  exec sudo -n /usr/local/sbin/studynova-deploy rollback "${BASH_REMATCH[1]}"
fi
printf 'Unsupported deployment command\n' >&2
exit 1
