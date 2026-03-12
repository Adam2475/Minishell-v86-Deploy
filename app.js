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
};

const serialLog = {
    wrap: document.getElementById("serial-log-wrap"),
    textarea: document.getElementById("serial_log"),
    status: document.getElementById("serial-log-status"),
};

function showSerialLog()
{
    serialLog.wrap.hidden = false;
    serialLog.textarea.value = "";
    serialLog.status.textContent = "booting…";
}

function hideSerialLog()
{
    serialLog.wrap.hidden = true;
}

function appendSerialByte(byte)
{
    const chr = String.fromCharCode(byte);
    serialLog.textarea.value += chr;
    serialLog.textarea.scrollTop = serialLog.textarea.scrollHeight;
}

let emulator;
let currentBootMode = "none";
let _serialBanner = "";
let _serialBannerFound = false;

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
    _serialBanner = "";
    _serialBannerFound = false;
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

    showSerialLog();

    if(currentBootMode === "state")
    {
        setStatus("Downloading saved state (80 MB)… this can take 15–60 s depending on your connection.");
        serialLog.status.textContent = "loading state…";
        serialLog.textarea.value = "[ Saved state is downloading (80 MB). Minishell will appear here shortly. ]\n";
    }
    else
    {
        setStatus("Cold booting Alpine Linux. The kernel boots in the serial console. This takes 3–5 minutes — watch the boot log below.");
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
            setStatus("State downloaded — resuming VM. Minishell prompt will appear in the boot log below.");
            serialLog.status.textContent = "restoring…";
            serialLog.textarea.value += "[ State loaded. Resuming VM… ]\n";
        }
        else
        {
            setStatus("Kernel and initramfs loaded. Linux is booting in the background (ttyS0). Watch the boot log below.");
        }
    });

    emulator.add_listener("emulator-ready", () => {
        setStatus("VM running — type in the boot log terminal below, or click the VGA screen.");
        serialLog.status.textContent = "running ✓";
        if(currentBootMode === "state")
        {
            serialLog.textarea.value += "[ VM resumed. Type below to interact with minishell. ]\n";
        }
    });

    emulator.add_listener("serial0-output-byte", byte => {
        appendSerialByte(byte);

        // Rolling buffer: detect banner without reading the whole textarea
        _serialBanner += String.fromCharCode(byte);
        if(_serialBanner.length > 80)
        {
            _serialBanner = _serialBanner.slice(-60);
        }
        if(!_serialBannerFound && _serialBanner.includes("Minishell portfolio demo"))
        {
            _serialBannerFound = true;
            serialLog.status.textContent = "minishell ready ✓";
            setStatus("Minishell is running in the boot log terminal below. Click there and type — or use the VGA screen above.");
        }
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

// Send keyboard input typed into the serial log to v86's serial port.
// v86 echoes chars back via serial0-output-byte, so we prevent the textarea
// from inserting characters natively to avoid duplicates.
serialLog.textarea.addEventListener("keydown", e => {
    if(!emulator) return;
    e.preventDefault();
    if(e.key === "Enter")
    {
        emulator.serial0_send("\n");
    }
    else if(e.key === "Backspace")
    {
        emulator.serial0_send("\x7f");
    }
    else if(e.key === "Tab")
    {
        emulator.serial0_send("\t");
    }
    else if(e.ctrlKey && e.key.length === 1)
    {
        const code = e.key.toUpperCase().charCodeAt(0) - 64;
        if(code > 0 && code < 32) emulator.serial0_send(String.fromCharCode(code));
    }
    else if(!e.ctrlKey && !e.altKey && !e.metaKey && e.key.length === 1)
    {
        emulator.serial0_send(e.key);
    }
});

void detectBootMode();
