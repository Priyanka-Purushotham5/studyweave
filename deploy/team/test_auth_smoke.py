import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('auth_smoke', Path(__file__).with_name('auth-smoke.py'))
auth = importlib.util.module_from_spec(spec)
spec.loader.exec_module(auth)

class SmokeTests(unittest.TestCase):
    def scenario(self, malicious=False):
        active = False
        def send(method, path, data=None, headers=None, host='studynova.ink'):
            nonlocal active
            headers = headers or {}
            if host == 'api.studynova.ink': return (404, '')
            if path == '/login': return (200, '')
            if path == '/auth/login':
                active = True
                return (303, '__Host-test=token; Secure; HttpOnly; SameSite=Strict; Path=/')
            if path == '/auth/logout': active = False; return (303, '')
            if path == '/api/tree': return ((200 if active and headers.get('Cookie') else (200 if malicious else 401)), '')
            if path == '/api/resources': return (403, '')
            raise AssertionError(path)
        return send
    def test_valid_flow(self): auth.smoke({'username': 'test', 'password': 'test'}, self.scenario())
    def test_anonymous_data_leak_fails(self):
        with self.assertRaises(ValueError): auth.smoke({'username': 'test', 'password': 'test'}, self.scenario(True))

if __name__ == '__main__': unittest.main()
