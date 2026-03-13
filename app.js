const ASSET_BASE = "./assets";

const assetPaths = {
    wasm: `${ASSET_BASE}/v86.wasm`,
    bios: `${ASSET_BASE}/bios/seabios.bin`,
    vgaBios: `${ASSET_BASE}/bios/vgabios.bin`,
    state: `${ASSET_BASE}/images/minishell-state.bin`,
    baseFs: `${ASSET_BASE}/images/alpine-fs.json`,
    rootFsBaseUrl: `${ASSET_BASE}/images/alpine-rootfs-flat`,
};

const ui = {
    start: document.getElementById("start-emulator"),
    pause: document.getElementById("pause-emulator"),
    resume: document.getElementById("resume-emulator"),
    restart: document.getElementById("restart-emulator"),
    status: document.getElementById("status-line"),
    assetMode: document.getElementById("asset-mode"),
    screen: document.getElementById("screen_container"),
    mobileInput: document.getElementById("mobile-shell-input"),
};

let emulator;
let currentBootMode = "none";

async function fileExists(url)
{
    try
    {
        const response = await fetch(url, { method: "HEAD" });
        return response.ok;
    }
    catch
    {
        return false;
    }
}

function setStatus(message)
{
    ui.status.textContent = message;
}

function sendSerialText(text)
{
    if(!emulator || !text)
    {
        return;
    }

    emulator.serial0_send(text);
}

function setButtonState({ startDisabled, pauseDisabled, resumeDisabled, restartDisabled })
{
    ui.start.disabled = startDisabled;
    ui.pause.disabled = pauseDisabled;
    ui.resume.disabled = resumeDisabled;
    ui.restart.disabled = restartDisabled;
}

async function detectBootMode()
{
    const hasState = await fileExists(assetPaths.state);

    if(hasState)
    {
        currentBootMode = "state";
        ui.assetMode.textContent = "Fast boot via saved state";
        return;
    }

    const [hasBaseFs, hasBios, hasVgaBios, hasWasm] = await Promise.all([
        fileExists(assetPaths.baseFs),
        fileExists(assetPaths.bios),
        fileExists(assetPaths.vgaBios),
        fileExists(assetPaths.wasm),
    ]);

    if(hasBaseFs && hasBios && hasVgaBios && hasWasm)
    {
        currentBootMode = "filesystem";
        ui.assetMode.textContent = "Cold boot from root filesystem";
        return;
    }

    currentBootMode = "missing";
    ui.assetMode.textContent = "Waiting for assets";
}

function buildConfig()
{
    const shared = {
        wasm_path: assetPaths.wasm,
        memory_size: 512 * 1024 * 1024,
        vga_memory_size: 8 * 1024 * 1024,
        screen_container: ui.screen,
        bios: { url: assetPaths.bios },
        vga_bios: { url: assetPaths.vgaBios },
        autostart: true,
        disable_speaker: true,
    };

    if(currentBootMode === "state")
    {
        return {
            ...shared,
            initial_state: { url: assetPaths.state },
            filesystem: {
                baseurl: assetPaths.rootFsBaseUrl,
            },
        };
    }

    if(currentBootMode === "filesystem")
    {
        return {
            ...shared,
            filesystem: {
                baseurl: assetPaths.rootFsBaseUrl,
                basefs: { url: assetPaths.baseFs },
            },
            bzimage_initrd_from_filesystem: true,
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
        };
    }

    throw new Error("Missing required v86 assets. Read portfolio-v86-demo/README.md for setup.");
}

async function destroyEmulator()
{
    if(!emulator)
    {
        return;
    }

    await emulator.destroy();
    emulator = undefined;
}

async function startEmulator()
{
    if(typeof window.V86 !== "function")
    {
        setStatus("The v86 runtime is not loaded yet. Copy libv86.js into ./assets before starting the demo.");
        ui.assetMode.textContent = "v86 library missing";
        return;
    }

    await detectBootMode();

    if(currentBootMode === "missing")
    {
        setStatus("Missing v86 assets. Copy libv86.js, v86.wasm, BIOS files, and a Linux filesystem or saved state into ./assets first.");
        return;
    }

    await destroyEmulator();

    if(currentBootMode === "state")
    {
        setStatus("Downloading saved state (80 MB)… this can take 15–60 s depending on your connection.");
    }
    else
    {
        setStatus("Cold booting Alpine Linux. This can take 3-5 minutes on first load.");
    }

    setButtonState({
        startDisabled: true,
        pauseDisabled: false,
        resumeDisabled: true,
        restartDisabled: false,
    });

    emulator = new window.V86(buildConfig());

    emulator.add_listener("emulator-loaded", () => {
        if(currentBootMode === "state")
        {
            setStatus("State downloaded - restoring VM now.");
        }
        else
        {
            setStatus("Kernel and initramfs loaded. Linux boot is in progress.");
        }
    });

    emulator.add_listener("emulator-ready", () => {
        setStatus("VM ready. Tap/click inside the VM screen to type in minishell.");
    });
}

ui.start.addEventListener("click", () => {
    void startEmulator();
});

ui.pause.addEventListener("click", async () => {
    if(!emulator)
    {
        return;
    }

    await emulator.stop();
    setStatus("Emulator paused.");
    setButtonState({
        startDisabled: true,
        pauseDisabled: true,
        resumeDisabled: false,
        restartDisabled: false,
    });
});

ui.resume.addEventListener("click", async () => {
    if(!emulator)
    {
        return;
    }

    await emulator.run();
    setStatus("Emulator resumed.");
    setButtonState({
        startDisabled: true,
        pauseDisabled: false,
        resumeDisabled: true,
        restartDisabled: false,
    });
});

ui.restart.addEventListener("click", () => {
    void startEmulator();
});

ui.mobileInput.addEventListener("input", e => {
    sendSerialText(e.target.value);
    e.target.value = "";
});

ui.mobileInput.addEventListener("keydown", e => {
    if(e.key === "Enter")
    {
        e.preventDefault();
        sendSerialText("\n");
    }
    else if(e.key === "Backspace" && e.target.value.length === 0)
    {
        e.preventDefault();
        sendSerialText("\x7f");
    }
});

ui.screen.addEventListener("pointerdown", () => {
    if(window.matchMedia("(pointer: coarse)").matches)
    {
        ui.mobileInput.focus();
    }
});

void detectBootMode();
