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
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.background = "rgba(0,0,0,0.6)";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.zIndex = "100000";

    const modal = document.createElement("div");
    modal.style.background = "#1e1e1e";
    modal.style.borderRadius = "12px";
    modal.style.padding = "16px";
    modal.style.width = "420px";
    modal.style.maxHeight = "70vh";
    modal.style.display = "flex";
    modal.style.flexDirection = "column";
    modal.style.color = "#eee";
    modal.style.fontFamily = "monospace";
    modal.style.fontSize = "13px";

    // Header
    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";
    header.style.marginBottom = "12px";

    const title = document.createElement("div");
    title.textContent = currentPath ? `📁 /${currentPath}` : "📁 /audio";
    title.style.fontWeight = "bold";
    title.style.fontSize = "14px";

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "✕";
    closeBtn.style.background = "transparent";
    closeBtn.style.border = "none";
    closeBtn.style.color = "#888";
    closeBtn.style.fontSize = "18px";
    closeBtn.style.cursor = "pointer";
    closeBtn.onclick = () => overlay.remove();

    header.appendChild(title);
    header.appendChild(closeBtn);
    modal.appendChild(header);

    // Breadcrumb / back
    if (currentPath) {
        const backBtn = document.createElement("button");
        backBtn.textContent = "⬅ Back";
        backBtn.style.background = "#333";
        backBtn.style.border = "1px solid #555";
        backBtn.style.color = "#ccc";
        backBtn.style.padding = "6px 12px";
        backBtn.style.borderRadius = "6px";
        backBtn.style.cursor = "pointer";
        backBtn.style.marginBottom = "10px";
        backBtn.onclick = () => {
            overlay.remove();
            const parent = currentPath.split("/").slice(0, -1).join("/");
            onNavigate(parent);
        };
        modal.appendChild(backBtn);
    }

    // List container
    const list = document.createElement("div");
    list.style.flex = "1";
    list.style.overflowY = "auto";
    list.style.border = "1px solid #333";
    list.style.borderRadius = "8px";
    list.style.padding = "8px";

    // Directories
    for (const dir of directories) {
        const row = document.createElement("div");
        row.style.padding = "8px";
        row.style.cursor = "pointer";
        row.style.borderRadius = "6px";
        row.style.marginBottom = "4px";
        row.style.background = "#2a2a2a";
        row.textContent = `📁 ${dir}`;

        row.onmouseenter = () => row.style.background = "#3a3a3a";
        row.onmouseleave = () => row.style.background = "#2a2a2a";

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
        row.style.padding = "8px";
        row.style.cursor = "pointer";
        row.style.borderRadius = "6px";
        row.style.marginBottom = "4px";
        row.style.background = "#252525";
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.alignItems = "center";

        const nameSpan = document.createElement("span");
        nameSpan.textContent = `🔊 ${file}`;
        row.appendChild(nameSpan);

        const selectBtn = document.createElement("button");
        selectBtn.textContent = "Select";
        selectBtn.style.background = "#007acc";
        selectBtn.style.border = "none";
        selectBtn.style.color = "white";
        selectBtn.style.padding = "4px 10px";
        selectBtn.style.borderRadius = "4px";
        selectBtn.style.cursor = "pointer";
        selectBtn.style.fontSize = "11px";
        selectBtn.onclick = (e) => {
            e.stopPropagation();
            const fullPath = currentPath ? `${currentPath}/${file}` : file;
            onSelect(fullPath);
            overlay.remove();
        };
        row.appendChild(selectBtn);

        row.onmouseenter = () => row.style.background = "#303030";
        row.onmouseleave = () => row.style.background = "#252525";

        list.appendChild(row);
    }

    // Select folder (for directory triggers)
    if (currentPath) {
        const selectFolderBtn = document.createElement("button");
        selectFolderBtn.textContent = `📂 Select This Folder`;
        selectFolderBtn.style.marginTop = "12px";
        selectFolderBtn.style.width = "100%";
        selectFolderBtn.style.padding = "10px";
        selectFolderBtn.style.background = "#1d6f1d";
        selectFolderBtn.style.border = "none";
        selectFolderBtn.style.color = "white";
        selectFolderBtn.style.borderRadius = "6px";
        selectFolderBtn.style.cursor = "pointer";
        selectFolderBtn.style.fontWeight = "bold";
        selectFolderBtn.onclick = () => {
            onSelect(currentPath);
            overlay.remove();
        };
        modal.appendChild(list);
        modal.appendChild(selectFolderBtn);
    } else {
        modal.appendChild(list);
    }

    // Empty state
    if (!directories.length && !files.length) {
        list.innerHTML = `<div style="text-align:center;color:#666;padding:20px;">
            No audio files found.<br>
            Upload .wav, .mp3, .ogg, or .aif files to get started.
        </div>`;
    }

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
        overlay.style.cssText = `
            position: fixed; inset: 0;
            background: rgba(0,0,0,0.7);
            display: flex; align-items: center; justify-content: center;
            z-index: 100001;
        `;

        const dialog = document.createElement("div");
        dialog.style.cssText = `
            background: #2a2a2a;
            border-radius: 12px;
            padding: 20px;
            width: 360px;
            color: #eee;
            font-family: monospace;
        `;

        dialog.innerHTML = `
            <div style="font-weight:bold;margin-bottom:12px;">⚠️ File Already Exists</div>
            <div style="color:#aaa;margin-bottom:16px;font-size:12px;">
                <code>${filename}</code> already exists at:<br>
                <code style="color:#f90;">${path}</code>
            </div>
            <div style="display:flex;gap:8px;justify-content:flex-end;">
                <button id="conflict-cancel" style="padding:8px 16px;background:#444;border:none;color:#ccc;border-radius:6px;cursor:pointer;">Cancel</button>
                <button id="conflict-rename" style="padding:8px 16px;background:#1d6f1d;border:none;color:white;border-radius:6px;cursor:pointer;">Rename</button>
                <button id="conflict-overwrite" style="padding:8px 16px;background:#c44;border:none;color:white;border-radius:6px;cursor:pointer;">Overwrite</button>
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
        overlay.style.cssText = `
            position: fixed; inset: 0;
            background: rgba(0,0,0,0.7);
            display: flex; align-items: center; justify-content: center;
            z-index: 100001;
        `;

        const dialog = document.createElement("div");
        dialog.style.cssText = `
            background: #2a2a2a;
            border-radius: 12px;
            padding: 20px;
            width: 360px;
            color: #eee;
            font-family: monospace;
        `;

        // Split name and extension
        const lastDot = originalName.lastIndexOf(".");
        const baseName = lastDot > 0 ? originalName.slice(0, lastDot) : originalName;
        const ext = lastDot > 0 ? originalName.slice(lastDot) : "";

        dialog.innerHTML = `
            <div style="font-weight:bold;margin-bottom:12px;">📝 Rename File</div>
            <div style="margin-bottom:12px;">
                <input id="rename-input" type="text" value="${baseName}" 
                    style="width:100%;box-sizing:border-box;padding:10px;background:#1a1a1a;border:1px solid #444;color:#eee;border-radius:6px;font-family:monospace;">
                <span style="color:#888;font-size:11px;">${ext}</span>
            </div>
            <div style="display:flex;gap:8px;justify-content:flex-end;">
                <button id="rename-cancel" style="padding:8px 16px;background:#444;border:none;color:#ccc;border-radius:6px;cursor:pointer;">Cancel</button>
                <button id="rename-ok" style="padding:8px 16px;background:#007acc;border:none;color:white;border-radius:6px;cursor:pointer;">Rename</button>
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
