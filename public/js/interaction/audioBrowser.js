// public/js/oscillaContributionAudioBrowser.js
//
// Audio Browser for Oscilla Contribution Surface
// - Browse project audio files and directories
// - Upload audio files with conflict resolution
// - Rename dialog for file conflicts
//
// Usage:
//   import { openAudioBrowser } from "./oscillaContributionAudioBrowser.js";

import { getProjectName } from "./shared.js";

// =============================================================
// AUDIO BROWSER
// =============================================================

/**
 * Open audio browser dialog (supports subdirectories)
 * @param {HTMLInputElement} sourceInput - Input to populate with selected path
 * @param {HTMLElement} statusMsg - Element to show status messages
 */
export async function openAudioBrowser(sourceInput, statusMsg) {
    const projectName = getProjectName();
    let currentPath = ""; // relative to audio root

    console.log("[openAudioBrowser] projectName:", projectName);
    statusMsg.textContent = "Loading audio files…";

    async function loadAndShow(path) {
        try {
            const url = path
                ? `/api/audio-tree/${projectName}/${path}`
                : `/api/audio-tree/${projectName}`;

            console.log("[openAudioBrowser] Fetching:", url);
            const res = await fetch(url);
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }

            const data = await res.json();
            console.log("[openAudioBrowser] Response:", data);

            const modal = createAudioBrowserModal({
                ...data,
                currentPath: path,
                onNavigate: loadAndShow,
                onSelect: (selectedPath) => {
                    sourceInput.value = selectedPath;
                    statusMsg.textContent = `Selected: ${selectedPath}`;
                }
            });

            document.body.appendChild(modal);
            statusMsg.textContent = "";

        } catch (err) {
            console.error("[audioBrowser] Failed:", err);
            statusMsg.textContent = "Failed to load audio files";
        }
    }

    loadAndShow(currentPath);
}

/**
 * Create the audio browser modal UI (navigable tree)
 */
function createAudioBrowserModal({
    directories = [],
    files = [],
    currentPath = "",
    onNavigate,
    onSelect
}) {
    const overlay = document.createElement("div");
    overlay.className = "osc-overlay visible";

    const modal = document.createElement("div");
    modal.className = "osc-modal";
    modal.style.maxHeight = "70vh";

    // Header
    const header = document.createElement("div");
    header.className = "osc-dialog-header";

    const title = document.createElement("div");
    title.className = "osc-dialog-title";
    title.textContent = currentPath ? `/${currentPath}` : "/audio";

    const closeBtn = document.createElement("button");
    closeBtn.className = "osc-dialog-close";
    closeBtn.textContent = "\u2715";
    closeBtn.onclick = () => overlay.remove();

    header.appendChild(title);
    header.appendChild(closeBtn);
    modal.appendChild(header);

    // Body
    const body = document.createElement("div");
    body.className = "osc-dialog-body";

    // Breadcrumb / back
    if (currentPath) {
        const backBtn = document.createElement("button");
        backBtn.textContent = "\u2B05 Back";
        backBtn.className = "osc-dialog-btn osc-dialog-btn--ghost";
        backBtn.style.marginBottom = "10px";
        backBtn.onclick = () => {
            overlay.remove();
            const parent = currentPath.split("/").slice(0, -1).join("/");
            onNavigate(parent);
        };
        body.appendChild(backBtn);
    }

    // List container
    const list = document.createElement("div");
    list.className = "osc-dialog-list";
    list.style.maxHeight = "none";
    list.style.flex = "1";
    list.style.overflowY = "auto";

    // Directories
    for (const dir of directories) {
        const row = document.createElement("div");
        row.className = "osc-dialog-list-item";
        row.textContent = `\uD83D\uDCC1 ${dir}`;

        row.onclick = () => {
            overlay.remove();
            const newPath = currentPath ? `${currentPath}/${dir}` : dir;
            onNavigate(newPath);
        };

        list.appendChild(row);
    }

    // Files
    for (const file of files) {
        const row = document.createElement("div");
        row.className = "osc-dialog-list-item";

        const nameSpan = document.createElement("span");
        nameSpan.textContent = `\uD83D\uDD0A ${file}`;
        row.appendChild(nameSpan);

        const selectBtn = document.createElement("button");
        selectBtn.textContent = "Select";
        selectBtn.className = "osc-dialog-btn osc-dialog-btn--primary";
        selectBtn.style.padding = "3px 10px";
        selectBtn.style.fontSize = "11px";
        selectBtn.onclick = (e) => {
            e.stopPropagation();
            const fullPath = currentPath ? `${currentPath}/${file}` : file;
            onSelect(fullPath);
            overlay.remove();
        };
        row.appendChild(selectBtn);

        list.appendChild(row);
    }

    // Select folder (for directory triggers)
    if (currentPath) {
        body.appendChild(list);
        const selectFolderBtn = document.createElement("button");
        selectFolderBtn.textContent = `\uD83D\uDCC2 Select This Folder`;
        selectFolderBtn.className = "osc-dialog-btn osc-dialog-btn--success";
        selectFolderBtn.style.marginTop = "12px";
        selectFolderBtn.style.width = "100%";
        selectFolderBtn.style.fontWeight = "bold";
        selectFolderBtn.onclick = () => {
            onSelect(currentPath);
            overlay.remove();
        };
        body.appendChild(selectFolderBtn);
    } else {
        body.appendChild(list);
    }

    // Empty state
    if (!directories.length && !files.length) {
        list.innerHTML = `<div class="osc-dialog-list-empty">
            No audio files found.<br>
            Upload .wav, .mp3, .ogg, or .aif files to get started.
        </div>`;
    }

    modal.appendChild(body);
    overlay.appendChild(modal);

    // Close on overlay click
    overlay.onclick = (e) => {
        if (e.target === overlay) overlay.remove();
    };

    return overlay;
}

// =============================================================
// AUDIO UPLOAD
// =============================================================

/**
 * Handle audio file upload
 * @param {File} file - The file to upload
 * @param {HTMLInputElement} sourceInput - Input to populate with path
 * @param {HTMLElement} statusMsg - Status message element
 * @param {boolean} forceOverwrite - Whether to overwrite existing file
 */
export async function handleAudioUpload(file, sourceInput, statusMsg, forceOverwrite = false) {
    const projectName = getProjectName();

    statusMsg.textContent = "Uploading…";
    statusMsg.style.color = "#888";

    const formData = new FormData();
    formData.append("audio", file);
    if (forceOverwrite) {
        formData.append("overwrite", "true");
    }

    try {
        const res = await fetch(`/api/audio-upload/${projectName}`, {
            method: "POST",
            body: formData
        });

        const result = await res.json();

        if (!res.ok) {
            // Check for conflict (file exists)
            if (res.status === 409 && result.exists) {
                const action = await showUploadConflictDialog(file.name, result.path);

                if (action === "overwrite") {
                    return handleAudioUpload(file, sourceInput, statusMsg, true);
                } else if (action === "rename") {
                    const newName = await showRenameDialog(file.name);
                    if (newName) {
                        const renamedFile = new File([file], newName, { type: file.type });
                        return handleAudioUpload(renamedFile, sourceInput, statusMsg, false);
                    } else {
                        statusMsg.textContent = "Upload cancelled";
                        return;
                    }
                } else {
                    statusMsg.textContent = "Upload cancelled";
                    return;
                }
            }

            throw new Error(result.error || `HTTP ${res.status}`);
        }

        // Success
        sourceInput.value = result.path;
        statusMsg.textContent = `✓ Uploaded: ${result.path}`;
        statusMsg.style.color = "#6f6";

    } catch (err) {
        console.error("[audioUpload] Failed:", err);
        statusMsg.textContent = `Upload failed: ${err.message}`;
        statusMsg.style.color = "#f66";
    }
}

// =============================================================
// CONFLICT DIALOG
// =============================================================

/**
 * Show a dialog when upload conflicts with existing file
 * @returns {Promise<'overwrite'|'rename'|'cancel'>}
 */
export function showUploadConflictDialog(filename, path) {
    return new Promise((resolve) => {
        const overlay = document.createElement("div");
        overlay.className = "osc-overlay visible";

        const dialog = document.createElement("div");
        dialog.className = "osc-modal osc-modal--narrow";

        dialog.innerHTML = `
            <div class="osc-dialog-body">
                <div class="osc-dialog-section-title" style="border:none;padding:0;">⚠️ File Already Exists</div>
                <p class="osc-dialog-hint" style="margin:8px 0 14px;">
                    <code>${filename}</code> already exists at:<br>
                    <code>${path}</code>
                </p>
                <div class="osc-dialog-actions">
                    <button id="conflict-cancel" class="osc-dialog-btn osc-dialog-btn--ghost">Cancel</button>
                    <button id="conflict-rename" class="osc-dialog-btn osc-dialog-btn--success">Rename</button>
                    <button id="conflict-overwrite" class="osc-dialog-btn osc-dialog-btn--danger">Overwrite</button>
                </div>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const cleanup = () => overlay.remove();

        dialog.querySelector("#conflict-cancel").onclick = () => { cleanup(); resolve("cancel"); };
        dialog.querySelector("#conflict-rename").onclick = () => { cleanup(); resolve("rename"); };
        dialog.querySelector("#conflict-overwrite").onclick = () => { cleanup(); resolve("overwrite"); };

        overlay.onclick = (e) => {
            if (e.target === overlay) { cleanup(); resolve("cancel"); }
        };
    });
}

// =============================================================
// RENAME DIALOG
// =============================================================

/**
 * Show a dialog to rename a file
 * @returns {Promise<string|null>} New filename or null if cancelled
 */
export function showRenameDialog(originalName) {
    return new Promise((resolve) => {
        const overlay = document.createElement("div");
        overlay.className = "osc-overlay visible";

        const dialog = document.createElement("div");
        dialog.className = "osc-modal osc-modal--narrow";

        // Split name and extension
        const lastDot = originalName.lastIndexOf(".");
        const baseName = lastDot > 0 ? originalName.slice(0, lastDot) : originalName;
        const ext = lastDot > 0 ? originalName.slice(lastDot) : "";

        dialog.innerHTML = `
            <div class="osc-dialog-body">
                <div class="osc-dialog-section-title" style="border:none;padding:0;">Rename File</div>
                <div style="margin-bottom:12px;">
                    <input id="rename-input" type="text" value="${baseName}"
                        class="osc-dialog-input" style="width:100%;box-sizing:border-box;">
                    <span class="osc-dialog-hint">${ext}</span>
                </div>
                <div class="osc-dialog-actions">
                    <button id="rename-cancel" class="osc-dialog-btn osc-dialog-btn--ghost">Cancel</button>
                    <button id="rename-ok" class="osc-dialog-btn osc-dialog-btn--primary">Rename</button>
                </div>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const input = dialog.querySelector("#rename-input");
        input.focus();
        input.select();

        const cleanup = () => overlay.remove();

        const doRename = () => {
            const newBase = input.value.trim();
            cleanup();
            if (newBase && newBase !== baseName) {
                resolve(newBase + ext);
            } else {
                resolve(null);
            }
        };

        dialog.querySelector("#rename-cancel").onclick = () => { cleanup(); resolve(null); };
        dialog.querySelector("#rename-ok").onclick = doRename;
        input.onkeydown = (e) => {
            if (e.key === "Enter") doRename();
            if (e.key === "Escape") { cleanup(); resolve(null); }
        };

        overlay.onclick = (e) => {
            if (e.target === overlay) { cleanup(); resolve(null); }
        };
    });
}

// =============================================================
// EXPORTS
// =============================================================

export default {
    openAudioBrowser,
    handleAudioUpload,
    showUploadConflictDialog,
    showRenameDialog,
};
