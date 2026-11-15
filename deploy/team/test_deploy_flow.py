"""Exercise the real deployment shell with temporary paths and fake system commands."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SOURCE = Path(__file__).with_name('studynova-deploy.sh')

class DeployFlow(unittest.TestCase):
    def run_flow(self, fail_switch, manual_rollback=False):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            bindir = root / 'bin'; bindir.mkdir()
            old = root / 'releases/old-aaaaaaa/deploy'; old.mkdir(parents=True)
            for name in ['.env', 'docker-compose.yml', 'docker-compose.single-site.yml', 'docker-compose.session-auth.yml', 'host-caddy-session.example']:
                (old / name).write_text('test\n')
            (root / 'caddy').write_text('secure\n')
            (root / 'marker').write_text('a'*40+'\n')
            if manual_rollback:
                prior = root / 'backups/20200101T000000Z-aaaaaaa'
                prior.mkdir(parents=True)
                (prior/'commit').write_text('a'*40+'\n')
                (prior/'compose-location').write_text(str(old)+'\n')
                (prior/'Caddyfile').write_text('secure\n')
                (prior/'deploy').mkdir()
                (prior/'deploy/.env').write_text('test\n')
                (prior/'images').write_text('/deploy-api-1 sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa deploy-api:latest\n/deploy-ai-service-1 sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb ai:latest\n/deploy-caddy-team-1 sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc ui:latest\n/deploy-auth-service-1 sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd auth:latest\n')
            (root / 'lock').touch()
            (root / 'policy').write_text('#!/bin/sh\nexit 0\n'); (root / 'policy').chmod(0o755)
            (root / 'smoke').write_text('#!/bin/sh\nexit 0\n'); (root / 'smoke').chmod(0o755)
            marker = root / 'events'
            docker = f'''#!/bin/bash
printf '%s\\n' "$*" >> '{marker}'
if [[ $1 == inspect ]]; then
  if [[ "$*" == *project.working_dir* ]]; then echo '{old}';
  elif [[ "$*" == *State.Health.Status* ]]; then echo healthy;
  elif [[ "$*" == *Config.Image* ]]; then
    printf '/deploy-api-1 sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa deploy-api:latest\\n/deploy-ai-service-1 sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb ai:latest\\n/deploy-caddy-team-1 sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc ui:latest\\n/deploy-auth-service-1 sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd auth:latest\\n';
  else printf '/deploy-api-1 \\n/deploy-ai-service-1 \\n/deploy-caddy-team-1 \\n/deploy-auth-service-1 \\n'; fi
elif [[ $1 == compose && "$*" == *'config --format json'* ]]; then
 echo '{{"services":{{"api":{{"environment":{{"TEAM_MODE":"true","PUBLIC_DEMO":"false","ENABLE_DEV_SEED":"false"}},"ports":[{{"host_ip":"127.0.0.1"}}]}},"ai-service":{{"environment":{{"FAKE_GEMINI":"1"}}}},"auth-service":{{"ports":[{{"host_ip":"127.0.0.1"}}],"volumes":[{{"target":"/run/secrets/team-auth","read_only":true}}]}},"caddy-team":{{"ports":[{{"host_ip":"127.0.0.1"}}]}}}}}}'
elif [[ $1 == compose && "$*" == *'up -d'* && "{int(fail_switch)}" == 1 && ! -f '{root}/failed' ]]; then touch '{root}/failed'; exit 1
fi
'''
            (bindir/'docker').write_text(docker); (bindir/'docker').chmod(0o755)
            git = f'''#!/bin/bash
if [[ $1 == clone ]]; then dest="${{@: -1}}"; mkdir -p "$dest/deploy"; cp -a '{old}/.' "$dest/deploy/";
else echo '{'b'*40}'; fi
'''
            (bindir/'git').write_text(git); (bindir/'git').chmod(0o755)
            for name, body in {'getent':'echo caddy:x:999:', 'caddy':'exit 0', 'systemctl':'exit 0', 'curl':'exit 0', 'flock':'exit 0'}.items():
                (bindir/name).write_text('#!/bin/sh\n'+body+'\n'); (bindir/name).chmod(0o755)
            script = SOURCE.read_text().replace('export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', f'export PATH={bindir}:/usr/bin:/bin')
            script = script.replace('[[ $EUID == 0 ]]', '[[ 1 == 1 ]]')
            script = script.replace('/run/lock/studynova-deploy.lock', str(root/'lock')).replace('/root/studynova-team-backups', str(root/'backups')).replace('/var/lib/studynova-deploy/current-commit', str(root/'marker')).replace('/etc/caddy/Caddyfile', str(root/'caddy')).replace('/opt/studynova-releases', str(root/'releases')).replace('/usr/local/libexec/studynova-github-policy', str(root/'policy')).replace('/usr/local/libexec/studynova-caddy-policy', str(root/'policy')).replace('/usr/local/libexec/studynova-auth-smoke', str(root/'smoke'))
            test_script=root/'test.sh'; test_script.write_text(script)
            args = ['rollback', '20200101T000000Z-aaaaaaa'] if manual_rollback else ['deploy', 'b'*40]
            result=subprocess.run(['bash', str(test_script), *args], capture_output=True, text=True, timeout=20)
            events=marker.read_text()
            if manual_rollback:
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn('PASS rollback health', result.stdout)
                self.assertIn('tag sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa deploy-api:latest', events)
                self.assertEqual((root/'marker').read_text().strip(), 'a'*40)
            elif fail_switch:
                self.assertNotEqual(result.returncode, 0, result.stderr)
                self.assertIn('restoring prior release', result.stderr)
                self.assertIn('tag sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa deploy-api:latest', events)
                self.assertEqual((root/'marker').read_text().strip(), 'a'*40)
            else:
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual((root/'marker').read_text().strip(), 'b'*40)
                self.assertIn('PASS deployed', result.stdout)
            self.assertNotIn('down -v', events)
    def test_successful_deploy(self): self.run_flow(False)
    def test_failed_switch_restores_previous_images(self): self.run_flow(True)
    def test_manual_rollback_restores_recorded_snapshot(self): self.run_flow(False, True)

if __name__ == '__main__': unittest.main()
