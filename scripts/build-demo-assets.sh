#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
DEMO_DIR=$(cd "$SCRIPT_DIR/.." && pwd)
REPO_ROOT=$(cd "$DEMO_DIR/.." && pwd)

V86_DIR=""
WITH_STATE=0

while (($#)); do
    case "$1" in
        --v86-dir)
            V86_DIR=${2:-}
            shift 2
            ;;
        --with-state)
            WITH_STATE=1
            shift
            ;;
        *)
            if [[ -z "$V86_DIR" ]]; then
                V86_DIR=$1
                shift
            else
                echo "Unknown argument: $1" >&2
                exit 1
            fi
            ;;
    esac
done

if [[ -z "$V86_DIR" ]]; then
    echo "Usage: bash $0 --v86-dir /absolute/path/to/v86 [--with-state]" >&2
    exit 1
fi

V86_DIR=$(cd "$V86_DIR" && pwd)

for required_command in docker python3 node tar; do
    if ! command -v "$required_command" >/dev/null 2>&1; then
        echo "Missing required command: $required_command" >&2
        exit 1
    fi
done

if [[ ! -d "$V86_DIR/tools" ]] || [[ ! -f "$V86_DIR/tools/fs2json.py" ]]; then
    echo "The provided v86 directory does not look valid: $V86_DIR" >&2
    exit 1
fi

if [[ ! -f "$V86_DIR/build/libv86.js" ]] || [[ ! -f "$V86_DIR/build/v86.wasm" ]]; then
    echo "Building v86 runtime assets in $V86_DIR"
    make -C "$V86_DIR" all
fi

BUILD_DIR="$DEMO_DIR/build"
ASSETS_DIR="$DEMO_DIR/assets"
ASSET_IMAGES_DIR="$ASSETS_DIR/images"
ASSET_BIOS_DIR="$ASSETS_DIR/bios"
ROOTFS_TAR="$BUILD_DIR/alpine-rootfs.tar"
ROOTFS_FLAT="$BUILD_DIR/alpine-rootfs-flat"
FS_JSON="$BUILD_DIR/alpine-fs.json"
IMAGE_NAME="${IMAGE_NAME:-minishell-v86-alpine}"
CONTAINER_NAME="${CONTAINER_NAME:-minishell-v86-alpine-export}"

mkdir -p "$BUILD_DIR" "$ASSET_IMAGES_DIR" "$ASSET_BIOS_DIR"

echo "Building Alpine guest image with minishell embedded"
docker build --platform linux/386 --rm --tag "$IMAGE_NAME" -f "$DEMO_DIR/docker/alpine-minishell/Dockerfile" "$REPO_ROOT"

cleanup() {
    docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
docker create --platform linux/386 -t -i --name "$CONTAINER_NAME" "$IMAGE_NAME" >/dev/null
docker export "$CONTAINER_NAME" -o "$ROOTFS_TAR"
tar -f "$ROOTFS_TAR" --delete .dockerenv >/dev/null 2>&1 || true

rm -rf "$ROOTFS_FLAT"
mkdir -p "$ROOTFS_FLAT"

echo "Generating v86 filesystem metadata"
"$V86_DIR/tools/fs2json.py" --zstd --out "$FS_JSON" "$ROOTFS_TAR"
"$V86_DIR/tools/copy-to-sha256.py" --zstd "$ROOTFS_TAR" "$ROOTFS_FLAT"

echo "Copying v86 browser runtime into portfolio assets"
cp "$V86_DIR/build/libv86.js" "$ASSETS_DIR/libv86.js"
cp "$V86_DIR/build/v86.wasm" "$ASSETS_DIR/v86.wasm"
cp "$V86_DIR/bios/seabios.bin" "$ASSET_BIOS_DIR/seabios.bin"
cp "$V86_DIR/bios/vgabios.bin" "$ASSET_BIOS_DIR/vgabios.bin"

rm -rf "$ASSET_IMAGES_DIR/alpine-rootfs-flat"
cp "$FS_JSON" "$ASSET_IMAGES_DIR/alpine-fs.json"
cp -r "$ROOTFS_FLAT" "$ASSET_IMAGES_DIR/alpine-rootfs-flat"

echo "Portfolio assets prepared in $ASSETS_DIR"

if [[ "$WITH_STATE" -eq 1 ]]; then
    echo "Generating saved VM state"
    node "$SCRIPT_DIR/save-minishell-state.mjs" "$V86_DIR" "$DEMO_DIR"
fi

echo "Done. You can now serve $DEMO_DIR over HTTP."