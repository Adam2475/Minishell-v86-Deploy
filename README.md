# v86 portfolio demo for minishell

This folder is a static browser demo that embeds a Linux VM with v86 and is intended to be copied into your portfolio site.

## What this demo expects

Put the following assets under `portfolio-v86-demo/assets/`:

- `libv86.js`
- `v86.wasm`
- `bios/seabios.bin`
- `bios/vgabios.bin`
- Either `images/minishell-state.bin` for fast restore
- Or `images/alpine-fs.json` plus `images/alpine-rootfs-flat/` for cold boot

The page checks for a saved state first. If it exists, it restores instantly. If not, it boots from the packaged root filesystem.

## Recommended architecture

For a portfolio page, the best user experience is:

1. Build a lightweight Linux guest with your minishell installed.
2. Boot it once locally.
3. Auto-start into `./minishell` or into a helper script that launches it.
4. Save the VM state.
5. Ship that state file to your portfolio so visitors skip the full boot sequence.

This avoids making users wait through a full kernel and userspace boot every time.

## Practical setup path

### Option A: Fully automated Alpine workflow

This repo now includes the automation to build an Alpine guest, compile your minishell inside it, generate v86 filesystem metadata, and optionally emit a saved state.

#### Prerequisites

- Docker with `linux/386` image support
- Node.js
- Python 3
- A separate checkout of `copy/v86`

If your Docker install does not already support `linux/386`, you may need QEMU binfmt support enabled first.

#### One-command asset build

1. Clone and build v86:

```sh
git clone https://github.com/copy/v86.git
cd v86
make all
```

2. From the minishell repo, build the portfolio assets and a saved state:

```sh
bash portfolio-v86-demo/scripts/build-demo-assets.sh --v86-dir /absolute/path/to/v86 --with-state
```

That script will:

1. Build a 32-bit Alpine image with your minishell compiled inside it.
2. Auto-login root on `tty1` and `ttyS0`.
3. Install `/root/minishell-demo.sh` and an `/etc/profile.d` hook that launches the demo automatically.
4. Export the container as a root filesystem tarball.
5. Run `fs2json.py` and `copy-to-sha256.py` from your v86 checkout.
6. Copy `libv86.js`, `v86.wasm`, and BIOS files into this demo's `assets/` folder.
7. Optionally boot the guest headlessly with Node and save `assets/images/minishell-state.bin`.

#### Output paths

After a successful run, the main outputs are:

- `portfolio-v86-demo/assets/libv86.js`
- `portfolio-v86-demo/assets/v86.wasm`
- `portfolio-v86-demo/assets/bios/seabios.bin`
- `portfolio-v86-demo/assets/bios/vgabios.bin`
- `portfolio-v86-demo/assets/images/alpine-fs.json`
- `portfolio-v86-demo/assets/images/alpine-rootfs-flat/`
- `portfolio-v86-demo/assets/images/minishell-state.bin` if `--with-state` was used

## Guest startup files

The guest auto-launch logic already lives in this repo:

- `portfolio-v86-demo/guest-overlay/root/minishell-demo.sh`
- `portfolio-v86-demo/guest-overlay/etc/profile.d/zz-minishell-demo.sh`

The shell wrapper prints a short banner and then executes `/root/minishell`.

## Saving a fast-boot state

If you want to generate the state separately from the main asset build, run:

```sh
node portfolio-v86-demo/scripts/save-minishell-state.mjs /absolute/path/to/v86 /absolute/path/to/portfolio-v86-demo
```

The script boots the packaged Alpine rootfs, waits until the `Minishell portfolio demo` banner appears on the serial console, then saves:

```text
portfolio-v86-demo/assets/images/minishell-state.bin
```

The browser page prefers that state automatically.

## Asset copy map

If you use the automation scripts, you do not need to copy files manually. They place everything into the right `assets/` paths for you.

Manual copy is still possible if you prefer, but the scripts are less error-prone.

## Portfolio integration notes

- Serve these files over HTTP, not directly from the filesystem.
- If you split images into chunks, ensure your host supports range requests.
- Keep the demo isolated on its own route, for example `/projects/minishell`.
- State images are version-sensitive. If you update v86 or rebuild the guest, regenerate the saved state.
- The VM is x86 Linux in the browser, so page weight matters. Compress and cache static assets aggressively.

## Remaining manual step

This repo still does not vendor the full v86 source tree. You need a separate local v86 checkout because the scripts call its build tools and reuse its BIOS and runtime artifacts.