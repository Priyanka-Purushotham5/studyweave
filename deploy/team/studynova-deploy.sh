#!/bin/bash
# Install a reviewed copy as /usr/local/sbin/studynova-deploy, root:root 0755.
set -Eeuo pipefail
umask 077
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
[[ $EUID == 0 ]] || { echo 'Must run as root' >&2; exit 1; }
[[ $# == 2 ]] || exit 1
operation=$1 target=$2
[[ $operation == deploy || $operation == rollback ]] || exit 1
if [[ $operation == deploy ]]; then [[ $target =~ ^[0-9a-f]{40}$ ]] || exit 1
else [[ $target =~ ^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{7}$ ]] || exit 1; fi
exec 9>/run/lock/studynova-deploy.lock
flock -n 9 || { echo 'Another deployment is running' >&2; exit 1; }
backup_root=/root/studynova-team-backups
marker=/var/lib/studynova-deploy/current-commit
repo=https://github.com/Priyanka-Purushotham5/studyweave.git
mkdir -p "$backup_root"
test -s "$marker" || { echo 'Missing verified deployed-commit marker' >&2; exit 1; }
old_sha=$(cat "$marker")
[[ $old_sha =~ ^[0-9a-f]{40}$ ]] || exit 1
running_dir=$(docker inspect deploy-auth-service-1 --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}')
[[ $running_dir == /opt/studynova-releases/*/deploy ]] && test -f "$running_dir/.env" || exit 1
[[ $running_dir == *"${old_sha:0:7}"* ]] || { echo 'Running release and commit marker disagree; operator review required' >&2; exit 1; }
export CADDY_AUTH_GID=$(getent group caddy | cut -d: -f3)
export FAKE_GEMINI=1
compose() { docker compose --env-file "$1/.env" -p deploy -f "$1/docker-compose.yml" -f "$1/docker-compose.single-site.yml" -f "$1/docker-compose.session-auth.yml" "${@:2}"; }
smoke() {
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1
  /usr/local/libexec/studynova-caddy-policy /etc/caddy/Caddyfile
  curl --fail --silent --show-error --max-time 10 http://127.0.0.1:3003/readyz >/dev/null
  [[ $(docker inspect deploy-api-1 --format '{{.State.Health.Status}}') == healthy ]]
  [[ $(docker inspect deploy-ai-service-1 --format '{{.State.Health.Status}}') == healthy ]]
  docker exec deploy-auth-service-1 python -c 'import app; app.credentials()'
  /usr/local/libexec/studynova-auth-smoke
}
/usr/local/libexec/studynova-caddy-policy /etc/caddy/Caddyfile
backup_id="$(date -u +%Y%m%dT%H%M%SZ)-${old_sha:0:7}"
backup="$backup_root/$backup_id"
test ! -e "$backup" || exit 1
mkdir -p "$backup"
printf '%s\n' "$old_sha" > "$backup/commit"
printf '%s\n' "$running_dir" > "$backup/compose-location"
cp -p /etc/caddy/Caddyfile "$backup/Caddyfile"
cp -a "$running_dir" "$backup/deploy"
docker inspect deploy-api-1 deploy-ai-service-1 deploy-caddy-team-1 deploy-auth-service-1 --format '{{.Name}} {{.Image}} {{.Config.Image}}' > "$backup/images"
while read -r container image tag; do
  [[ $image =~ ^sha256:[0-9a-f]{64}$ && $tag != sha256:* && $tag != *@sha256:* && $tag != -* ]] || { echo 'Unrestorable image reference' >&2; exit 1; }
  case "$container" in
    /deploy-api-1|/deploy-ai-service-1|/deploy-caddy-team-1|/deploy-auth-service-1)
      docker tag "$image" "studynova-rollback/${container#/}:$backup_id" ;;
    *) echo 'Unexpected container in backup' >&2; exit 1 ;;
  esac
done < "$backup/images"
docker inspect deploy-api-1 deploy-ai-service-1 deploy-caddy-team-1 deploy-auth-service-1 --format '{{.Name}} {{range .Mounts}}{{.Type}}:{{.Name}}:{{.Source}}:{{.Destination}} {{end}}' > "$backup/mounts"
docker inspect deploy-api-1 deploy-ai-service-1 deploy-caddy-team-1 deploy-auth-service-1 --format '{{.Name}} {{range .Mounts}}{{if eq .Type "volume"}}{{.Name}}:{{.Destination}} {{end}}{{end}}' | sort > "$backup/volumes"
printf 'Rollback backup: %s\n' "$backup_id"
restore() {
  local chosen=$1 old_dir saved_sha
  old_dir=$(cat "$chosen/compose-location"); saved_sha=$(cat "$chosen/commit")
  [[ $old_dir == /opt/studynova-releases/*/deploy && $saved_sha =~ ^[0-9a-f]{40}$ ]] || return 1
  test -d "$old_dir" && test -f "$chosen/deploy/.env" && test -f "$chosen/Caddyfile" || return 1
  while read -r container image tag; do
    case "$container" in /deploy-api-1|/deploy-ai-service-1|/deploy-caddy-team-1|/deploy-auth-service-1) docker tag "$image" "$tag";; *) return 1;; esac
  done < "$chosen/images"
  install -m 600 "$chosen/deploy/.env" "$old_dir/.env"
  caddy validate --config "$chosen/Caddyfile" --adapter caddyfile >/dev/null 2>&1
  /usr/local/libexec/studynova-caddy-policy "$chosen/Caddyfile"
  cp -p "$chosen/Caddyfile" /etc/caddy/Caddyfile
  systemctl reload caddy
  compose "$old_dir" up -d --no-deps --no-build api ai-service auth-service caddy-team
  for _ in $(seq 1 30); do if smoke; then printf '%s\n' "$saved_sha" > "$marker.tmp.$$"; mv -f "$marker.tmp.$$" "$marker"; echo 'PASS rollback health'; return 0; fi; sleep 2; done
  return 1
}
if [[ $operation == rollback ]]; then
  chosen="$backup_root/$target"
  test -d "$chosen" && [[ ! -L $chosen ]] || { echo 'Backup not found' >&2; exit 1; }
  restore "$chosen"
  exit 0
fi
/usr/local/libexec/studynova-github-policy "$target"
new_root="/opt/studynova-releases/team-${target:0:12}-$(date -u +%Y%m%dT%H%M%SZ)"
test ! -e "$new_root"
git clone --quiet --depth 1 --branch main "$repo" "$new_root"
[[ $(git -C "$new_root" rev-parse HEAD) == "$target" ]] || { echo 'Main changed during deployment' >&2; exit 1; }
new_dir="$new_root/deploy"
# Never silently change the host authentication routing in an app deployment.
cmp -s "$running_dir/host-caddy-session.example" "$new_dir/host-caddy-session.example" || { echo 'Caddy policy change requires a separate reviewed procedure' >&2; exit 1; }
install -m 600 "$running_dir/.env" "$new_dir/.env"
# Keep host-level privileges, network bindings and mounts identical across releases.
before_config=$(mktemp)
after_config=$(mktemp)
trap 'rm -f "$before_config" "$after_config"' EXIT
compose "$running_dir" config --format json > "$before_config"
compose "$new_dir" config --format json > "$after_config"
python3 - "$before_config" "$after_config" "$running_dir" "$new_dir" <<'PY'
import json,sys
before=json.load(open(sys.argv[1]))['services']; after=json.load(open(sys.argv[2]))['services']
keys=('ports','volumes','privileged','cap_add','devices','network_mode','pid','security_opt','user')
def normalized(value, root):
    if isinstance(value, str): return value.replace(root, '<release>')
    if isinstance(value, list): return [normalized(x,root) for x in value]
    if isinstance(value, dict): return {k: normalized(v,root) for k,v in value.items()}
    return value
for service in ('api','ai-service','auth-service','caddy-team'):
    for key in keys:
        if normalized(before[service].get(key),sys.argv[3]) != normalized(after[service].get(key),sys.argv[4]):
            raise SystemExit('Deployment blocked: security configuration changed for '+service+' '+key)
PY
rm -f "$before_config" "$after_config"
trap - EXIT
compose "$new_dir" config --format json | python3 -c '
import json,sys
c=json.load(sys.stdin)["services"]; a=c["api"]; i=c["ai-service"]; g=c["auth-service"]; w=c["caddy-team"]
if not (a["environment"]["TEAM_MODE"]=="true" and a["environment"]["PUBLIC_DEMO"]=="false" and a["environment"]["ENABLE_DEV_SEED"]=="false"): raise SystemExit("Unsafe API configuration")
if not (i["environment"]["FAKE_GEMINI"]=="1" and not i.get("ports")): raise SystemExit("Unsafe AI configuration")
if not all(p.get("host_ip")=="127.0.0.1" for p in a["ports"]+g["ports"]+w["ports"]): raise SystemExit("Unsafe port binding")
if not any(v.get("target")=="/run/secrets/team-auth" and v.get("read_only") for v in g["volumes"]): raise SystemExit("Unsafe credential mount")
'
# Fail before switching if authenticated smoke credentials are not safely provisioned.
test -x /usr/local/libexec/studynova-auth-smoke && /usr/local/libexec/studynova-auth-smoke
switched=0
on_error() {
  trap - ERR HUP INT TERM
  if [[ $switched == 1 ]]; then echo 'Deployment failed; restoring prior release' >&2; restore "$backup" || echo 'CRITICAL: rollback failed; operator intervention required' >&2; fi
  exit 1
}
trap on_error ERR HUP INT TERM
switched=1
compose "$new_dir" build api ai-service auth-service caddy-team
/usr/local/libexec/studynova-github-policy "$target"
compose "$new_dir" up -d --no-deps --no-build api ai-service auth-service caddy-team
docker inspect deploy-api-1 deploy-ai-service-1 deploy-caddy-team-1 deploy-auth-service-1 --format '{{.Name}} {{range .Mounts}}{{if eq .Type "volume"}}{{.Name}}:{{.Destination}} {{end}}{{end}}' | sort > "$backup/volumes-after"
cmp -s "$backup/volumes" "$backup/volumes-after" || { echo 'Container volume mappings changed' >&2; false; }
ready=0
for _ in $(seq 1 30); do if smoke; then ready=1; break; fi; sleep 2; done
[[ $ready == 1 ]]
printf '%s\n' "$target" > "$marker.tmp.$$"
mv -f "$marker.tmp.$$" "$marker"
trap - ERR HUP INT TERM
printf 'PASS deployed %s; rollback backup %s\n' "$target" "$backup_id"
