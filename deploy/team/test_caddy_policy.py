import copy
import importlib.util
import json
from pathlib import Path
import unittest

root = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('caddy_policy', root / 'caddy-policy.py')
policy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(policy)

class CaddyPolicyTests(unittest.TestCase):
    def setUp(self): self.config = json.loads((root / 'testdata/caddy-session.json').read_text())
    def test_reviewed_session_config_is_accepted(self): policy.validate(self.config)
    def test_api_proxy_and_missing_auth_are_rejected(self):
        routes = self.config['apps']['http']['servers']['srv0']['routes']
        bad = copy.deepcopy(self.config)
        bad_routes = bad['apps']['http']['servers']['srv0']['routes']
        api = next(r for r in bad_routes if r['match'][0]['host'] == ['api.studynova.ink'])
        api['handle'][0]['routes'][0]['handle'][0] = {'handler': 'reverse_proxy', 'upstreams': [{'dial': '127.0.0.1:3007'}]}
        with self.assertRaises(ValueError): policy.validate(bad)
        site = next(r for r in routes if r['match'][0]['host'] == ['studynova.ink'])
        protected = site['handle'][0]['routes'][1]['handle'][0]['routes'][0]['handle']
        protected.pop(0)
        with self.assertRaises(ValueError): policy.validate(self.config)
    def test_extra_unprotected_route_is_rejected(self):
        site = next(r for r in self.config['apps']['http']['servers']['srv0']['routes'] if r['match'][0]['host'] == ['studynova.ink'])
        site['handle'][0]['routes'].insert(0, {'match': [{'path': ['/api/*']}], 'handle': []})
        with self.assertRaises(ValueError): policy.validate(self.config)
    def test_proxy_cannot_overwrite_origin(self):
        site = next(r for r in self.config['apps']['http']['servers']['srv0']['routes'] if r['match'][0]['host'] == ['studynova.ink'])
        auth = site['handle'][0]['routes'][1]['handle'][0]['routes'][0]['handle'][0]
        auth['headers']['request']['set']['Origin'] = ['https://studynova.ink']
        with self.assertRaises(ValueError): policy.validate(self.config)

if __name__ == '__main__': unittest.main()
