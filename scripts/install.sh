#!/usr/bin/env bash
# curl -fsSL https://raw.githubusercontent.com/yoreai/relay/main/scripts/install.sh | bash
set -euo pipefail

REPO="yoreai/relay"
VERSION="${RELAY_VERSION:-latest}"
PREFIX="${RELAY_PREFIX:-$HOME/.local}"
BIN_DIR="${PREFIX}/bin"

os="$(uname -s | tr '[:upper:]' '[:lower:]')"
arch="$(uname -m)"
case "$arch" in
  x86_64|amd64) arch="x64" ;;
  arm64|aarch64) arch="arm64" ;;
  *) echo "unsupported arch: $arch" >&2; exit 1 ;;
esac
case "$os" in
  darwin|linux) ;;
  *) echo "unsupported os: $os" >&2; exit 1 ;;
esac

asset="relay-${os}-${arch}"
if [[ "$VERSION" == "latest" ]]; then
  url="https://github.com/${REPO}/releases/latest/download/${asset}"
else
  url="https://github.com/${REPO}/releases/download/v${VERSION#v}/${asset}"
fi

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
echo "downloading ${url}"
curl -fsSL "$url" -o "${tmpdir}/relay"
chmod +x "${tmpdir}/relay"
mkdir -p "$BIN_DIR"
mv "${tmpdir}/relay" "${BIN_DIR}/relay"
echo "installed ${BIN_DIR}/relay"
if ! command -v relay >/dev/null 2>&1; then
  echo "add to PATH: export PATH=\"${BIN_DIR}:\$PATH\""
fi
relay --version || true
