import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

root = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('policy', root / 'github-policy.py')
policy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(policy)

class ServerPolicyTests(unittest.TestCase):
    def test_server_independently_requires_protected_passing_main(self):
        sha = 'a' * 40
        checks = [{'name': n, 'id': i, 'status': 'completed', 'conclusion': 'success', 'app': {'id': policy.GITHUB_ACTIONS_APP_ID}} for i, n in enumerate(sorted(policy.REQUIRED), 1)]
        def responses(path):
            if path == '/branches/main': return {'protected': True, 'commit': {'sha': sha}, 'protection': {'required_status_checks': {'contexts': list(policy.REQUIRED), 'checks': [{'context': n, 'app_id': policy.GITHUB_ACTIONS_APP_ID} for n in policy.REQUIRED]}}}
            if '/actions/' in path: return {'workflow_runs': [{'status': 'completed', 'conclusion': 'success'}]}
            return {'total_count': len(checks), 'check_runs': checks}
        with patch.object(policy, 'get', side_effect=responses): policy.check(sha)
        checks[0]['conclusion'] = 'failure'
        with patch.object(policy, 'get', side_effect=responses), self.assertRaises(ValueError): policy.check(sha)
    def test_force_command_rejects_shell_injection(self):
        with tempfile.TemporaryDirectory() as directory:
            fake = Path(directory, 'sudo')
            fake.write_text('#!/bin/sh\nprintf "%s\\n" "$@"\n')
            fake.chmod(0o755)
            env = {**os.environ, 'PATH': directory + ':/usr/bin:/bin'}
            for bad in ['deploy ' + 'a'*40 + ';id', 'rollback ../../etc/passwd', 'deploy main', '']:
                result = subprocess.run(['bash', str(root / 'authorized-command.sh')], env={**env, 'SSH_ORIGINAL_COMMAND': bad}, capture_output=True, text=True)
                self.assertNotEqual(result.returncode, 0)
            good = subprocess.run(['bash', str(root / 'authorized-command.sh')], env={**env, 'SSH_ORIGINAL_COMMAND': 'deploy ' + 'a'*40}, capture_output=True, text=True)
            self.assertEqual(good.returncode, 0)
            self.assertIn('/usr/local/sbin/studynova-deploy', good.stdout)
            self.assertIn('a'*40, good.stdout)

if __name__ == '__main__': unittest.main()
