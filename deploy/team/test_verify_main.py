import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('verify_main', Path(__file__).with_name('verify-main.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class VerifyMain(unittest.TestCase):
    def setUp(self):
        self.sha = 'a' * 40
        self.branch = {'protected': True, 'commit': {'sha': self.sha}, 'protection': {'required_status_checks': {'contexts': sorted(m.REQUIRED), 'checks': [{'context': n, 'app_id': m.GITHUB_ACTIONS_APP_ID} for n in sorted(m.REQUIRED)]}}}
        self.runs = [{'status': 'completed', 'conclusion': 'success'}]
        self.checks = [{'name': n, 'id': i, 'status': 'completed', 'conclusion': 'success', 'app': {'id': m.GITHUB_ACTIONS_APP_ID}} for i, n in enumerate(sorted(m.REQUIRED), 1)]
    def test_accepts_protected_passing_main(self):
        m.verify(self.sha, self.branch, self.runs, self.checks)
    def test_rejects_unprotected_stale_missing_and_failed(self):
        bad = [
            (self.sha, {**self.branch, 'protected': False}, self.runs, self.checks),
            ('b' * 40, self.branch, self.runs, self.checks),
            (self.sha, self.branch, [], self.checks),
            (self.sha, self.branch, self.runs, self.checks[:-1]),
            (self.sha, self.branch, self.runs, self.checks + [{'name': 'web', 'id': 99, 'status': 'completed', 'conclusion': 'failure'}]),
            (self.sha, self.branch, self.runs, self.checks + [{'name': 'web', 'id': 99, 'status': 'completed', 'conclusion': 'success', 'app': {'id': 999}}]),
            (self.sha, {**self.branch, 'protection': {'required_status_checks': {'contexts': ['api']}}}, self.runs, self.checks),
        ]
        for args in bad:
            with self.subTest(args=args), self.assertRaises(ValueError): m.verify(*args)
    def test_rejects_injected_or_short_ref(self):
        for ref in ['a'*39, 'main', 'a'*40 + ';id']:
            with self.assertRaises(ValueError): m.verify(ref, self.branch, self.runs, self.checks)
    def test_rollback_remains_available_when_main_ci_is_failing(self):
        m.verify(self.sha, self.branch, [], [], rollback=True)

if __name__ == '__main__': unittest.main()
