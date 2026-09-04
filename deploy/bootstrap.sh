#!/usr/bin/env bash
#
# One-time provisioning for the api.jetsetterss.com host (Ubuntu 24.04).
#
#   curl -fsSL https://raw.githubusercontent.com/Sahi0045/JETSET13/main/deploy/bootstrap.sh | sudo bash
#
# or, having copied it across:
#
#   sudo bash bootstrap.sh
#
# Idempotent: safe to re-run. It installs Docker, creates the deploy user and
# /opt/jetsetters, and turns on the firewall and automatic security updates.
#
# It deliberately does NOT touch the `ubuntu` user's SSH access. Locking
# yourself out of a box is a far worse outcome than a slightly less hardened
# one, and every step below is written to fail closed on that.

set -euo pipefail

log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m    warning: %s\033[0m\n' "$*"; }

if [[ $EUID -ne 0 ]]; then
  echo "Run with sudo." >&2
  exit 1
fi

APP_DIR=/opt/jetsetters
DEPLOY_USER=deploy

# ─────────────────────────────────────────────────────────────────────────────
log "System packages"
# ─────────────────────────────────────────────────────────────────────────────
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
  ca-certificates curl gnupg lsb-release \
  ufw fail2ban unattended-upgrades logrotate

# ─────────────────────────────────────────────────────────────────────────────
log "Docker engine and compose plugin"
# ─────────────────────────────────────────────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg

  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list

  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io \
    docker-buildx-plugin docker-compose-plugin
else
  echo "    already installed: $(docker --version)"
fi

systemctl enable --now docker

# ─────────────────────────────────────────────────────────────────────────────
log "Deploy user"
# ─────────────────────────────────────────────────────────────────────────────
# CI logs in as this user. It can drive Docker but is not a sudoer: a leaked
# deploy key should be able to ship a release, not own the machine.
if ! id -u "$DEPLOY_USER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
fi
usermod -aG docker "$DEPLOY_USER"

install -d -m 0700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
# Seed it with whatever can already reach this box, so provisioning never
# produces a user nobody can log in as. Add the CI-only key separately.
if [[ -f /home/ubuntu/.ssh/authorized_keys ]]; then
  install -m 0600 -o "$DEPLOY_USER" -g "$DEPLOY_USER" \
    /home/ubuntu/.ssh/authorized_keys "/home/$DEPLOY_USER/.ssh/authorized_keys"
else
  warn "/home/ubuntu/.ssh/authorized_keys not found; add a key for $DEPLOY_USER by hand"
  install -m 0600 -o "$DEPLOY_USER" -g "$DEPLOY_USER" /dev/null "/home/$DEPLOY_USER/.ssh/authorized_keys"
fi

# ─────────────────────────────────────────────────────────────────────────────
log "Application directory"
# ─────────────────────────────────────────────────────────────────────────────
install -d -m 0755 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_DIR"
install -d -m 0755 root:root /var/log/caddy 2>/dev/null || mkdir -p /var/log/caddy

# The env file holds every credential this deployment has.
#
# root:deploy 640, not root:root 600. The deploy user runs `docker compose`
# and compose reads env_file itself, as that user - and deploy has no sudo, by
# design. Locking this to root alone makes the documented deploy flow fail with
# "open /opt/jetsetters/.env: permission denied", which reads like a Docker
# problem and is not. 640 keeps it unreadable to every other account on the box.
if [[ ! -f "$APP_DIR/.env" ]]; then
  install -m 0640 -o root -g "$DEPLOY_USER" /dev/null "$APP_DIR/.env"
  warn "$APP_DIR/.env is empty - the app will not start until it is filled in"
fi
chown root:"$DEPLOY_USER" "$APP_DIR/.env"
chmod 640 "$APP_DIR/.env"

# ─────────────────────────────────────────────────────────────────────────────
log "Firewall"
# ─────────────────────────────────────────────────────────────────────────────
# Order matters: allow SSH BEFORE enabling, or `ufw enable` drops the very
# connection running this script and the box needs a console to recover.
ufw allow 22/tcp   comment 'ssh'    >/dev/null
ufw allow 80/tcp   comment 'http'   >/dev/null
ufw allow 443/tcp  comment 'https'  >/dev/null
ufw allow 443/udp  comment 'http3'  >/dev/null
ufw default deny incoming  >/dev/null
ufw default allow outgoing >/dev/null
ufw --force enable >/dev/null
ufw status verbose | sed 's/^/    /'

# ─────────────────────────────────────────────────────────────────────────────
log "fail2ban"
# ─────────────────────────────────────────────────────────────────────────────
cat > /etc/fail2ban/jail.local <<'JAIL'
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5
backend  = systemd

[sshd]
enabled = true
JAIL
systemctl enable --now fail2ban
systemctl restart fail2ban

# ─────────────────────────────────────────────────────────────────────────────
log "Unattended security upgrades"
# ─────────────────────────────────────────────────────────────────────────────
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'AUTO'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
AUTO
# Security updates only, and no automatic reboots: a box that reboots itself
# mid-booking is worse than one that waits for a human.
sed -i 's|^//\s*"\${distro_id}:\${distro_codename}-security";|        "${distro_id}:${distro_codename}-security";|' \
  /etc/apt/apt.conf.d/50unattended-upgrades 2>/dev/null || true
systemctl enable --now unattended-upgrades 2>/dev/null || true

# ─────────────────────────────────────────────────────────────────────────────
log "Log rotation and image pruning"
# ─────────────────────────────────────────────────────────────────────────────
cat > /etc/logrotate.d/caddy <<'ROT'
/var/log/caddy/*.log {
  weekly
  rotate 4
  compress
  missingok
  notifempty
  copytruncate
}
ROT

# Old images accumulate one per deploy and will fill 80 GB eventually.
cat > /etc/cron.weekly/docker-prune <<'PRUNE'
#!/bin/sh
# Untagged/dangling images and stopped containers only. Never volumes: that is
# where Caddy keeps its certificates.
docker system prune -af --filter "until=168h" >/dev/null 2>&1
PRUNE
chmod +x /etc/cron.weekly/docker-prune

# ─────────────────────────────────────────────────────────────────────────────
log "SSH hardening"
# ─────────────────────────────────────────────────────────────────────────────
# Keys only. Lightsail's Ubuntu image already ships this way; setting it
# explicitly means it survives an image change. Root login and the existing
# `ubuntu` key are left exactly as they are.
cat > /etc/ssh/sshd_config.d/99-jetsetters.conf <<'SSHD'
PasswordAuthentication no
KbdInteractiveAuthentication no
SSHD
# Validate before reloading: a bad config plus a reload is a locked door.
if sshd -t; then
  systemctl reload ssh 2>/dev/null || systemctl reload sshd
else
  warn "sshd config failed validation; leaving SSH untouched"
  rm -f /etc/ssh/sshd_config.d/99-jetsetters.conf
fi

# ─────────────────────────────────────────────────────────────────────────────
log "Done"
# ─────────────────────────────────────────────────────────────────────────────
cat <<SUMMARY

    docker      $(docker --version 2>/dev/null || echo 'not installed')
    compose     $(docker compose version --short 2>/dev/null || echo 'not installed')
    deploy user $DEPLOY_USER (in the docker group, no sudo)
    app dir     $APP_DIR
    egress IPv4 $(curl -4 -s --max-time 8 https://ifconfig.me || echo 'unavailable')

    Still to do:
      1. Put the real environment into $APP_DIR/.env  (chmod 600)
      2. Copy docker-compose.yml and Caddyfile into $APP_DIR
      3. Point api.jetsetterss.com at this host's static IP
      4. cd $APP_DIR && docker compose up -d

SUMMARY
