#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

process.on("unhandledRejection", exn => {
    throw exn;
});

const v86DirArg = process.argv[2];
const demoDirArg = process.argv[3];

if(!v86DirArg || !demoDirArg)
{
    console.error("Usage: node save-minishell-state.mjs /absolute/path/to/v86 /absolute/path/to/portfolio-v86-demo");
    process.exit(1);
}

const v86Dir = path.resolve(v86DirArg);
const demoDir = path.resolve(demoDirArg);
const outputFile = path.join(demoDir, "assets/images/minishell-state.bin");
const assetImagesDir = path.join(demoDir, "assets/images");
const assetRootfsDir = path.join(assetImagesDir, "alpine-rootfs-flat");
const assetFsJson = path.join(assetImagesDir, "alpine-fs.json");

for(const requiredPath of [
    path.join(v86Dir, "build/libv86.mjs"),
    path.join(v86Dir, "bios/seabios.bin"),
    path.join(v86Dir, "bios/vgabios.bin"),
    assetRootfsDir,
    assetFsJson,
])
{
    if(!fs.existsSync(requiredPath))
    {
        console.error(`Missing required file or directory: ${requiredPath}`);
        process.exit(1);
    }
}

const { V86 } = await import(pathToFileURL(path.join(v86Dir, "build/libv86.mjs")).href);

const emulator = new V86({
    wasm_path: path.join(v86Dir, "build/v86.wasm"),
    bios: { url: path.join(v86Dir, "bios/seabios.bin") },
    vga_bios: { url: path.join(v86Dir, "bios/vgabios.bin") },
    autostart: true,
    memory_size: 512 * 1024 * 1024,
    vga_memory_size: 8 * 1024 * 1024,
    network_relay_url: "<UNUSED>",
    bzimage_initrd_from_filesystem: true,
    filesystem: {
        baseurl: assetRootfsDir,
        basefs: assetFsJson,
    },
    cmdline: [
        "rw",
        "root=host9p",
        "rootfstype=9p",
        "rootflags=trans=virtio,cache=loose",
        "modules=virtio_pci",
        "console=ttyS0",
        "tsc=reliable",
        "init=/sbin/init",
    ].join(" "),
    disable_speaker: true,
    log_level: 0,
});

let serialText = "";
let saveScheduled = false;

const timeout = setTimeout(async () => {
    console.error("Timed out waiting for the minishell demo guest to reach its startup banner.");
    await emulator.destroy();
    process.exit(1);
}, 5 * 60 * 1000);

async function saveState()
{
    const state = await emulator.save_state();
    fs.writeFileSync(outputFile, new Uint8Array(state));
    clearTimeout(timeout);
    console.log(`Saved state to ${outputFile}`);
    await emulator.destroy();
    process.exit(0);
}

emulator.add_listener("serial0-output-byte", byte => {
    const chr = String.fromCharCode(byte);

    if(chr === "\n" || chr === "\r" || chr === "\t" || (chr >= " " && chr <= "~"))
    {
        process.stdout.write(chr);
    }

    serialText += chr;

    if(!saveScheduled && serialText.includes("Minishell portfolio demo"))
    {
        saveScheduled = true;
        setTimeout(() => {
            void saveState();
        }, 4000);
    }
});