// oscillaContributionRecorder.js
//
// Score-native audio recording for performer contributions
// Part of the Oscilla Contribution Surface system
//
// Usage:
//   import { showRecordingModal, uploadRecordedAudio, isRecordingSupported } from "./oscillaContributionRecorder.js";
//

// =============================================================
// CONSTANTS
// =============================================================

const RECORDING_MAX_DURATION_MS = 20000; // 20 seconds max

const RECORDING_SUPPORTED_MIMES = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/mp4',
    'audio/wav'
];

// =============================================================
// UTILITY FUNCTIONS
// =============================================================

/**
 * Check if recording is supported in this browser
 */
export function isRecordingSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
}

/**
 * Get the best supported MIME type for recording
 */
function getBestRecordingMime() {
    for (const mime of RECORDING_SUPPORTED_MIMES) {
        if (MediaRecorder.isTypeSupported(mime)) {
            return mime;
        }
    }
    return null;
}

/**
 * Get file extension for a MIME type
 */
function getExtensionForMime(mime) {
    if (mime.includes('webm')) return '.webm';
    if (mime.includes('ogg')) return '.ogg';
    if (mime.includes('mp4')) return '.m4a';
    if (mime.includes('wav')) return '.wav';
    return '.webm';
}

/**
 * Format milliseconds as MM:SS
 */
function formatRecordingTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Get current project name from URL
 */
function getProjectName() {
    const params = new URLSearchParams(window.location.search);
    return params.get("score") || params.get("project") || null;
}

// =============================================================
// FETCH EXISTING DIRECTORIES
// =============================================================

/**
 * Fetch list of existing contribution directories
 */
async function fetchExistingDirectories() {
    const projectName = getProjectName();
    if (!projectName) return [];
    
    try {
        const res = await fetch(`/api/audio-tree/${projectName}/contributions`);
        if (!res.ok) return [];
        const data = await res.json();
        return data.directories || [];
    } catch (err) {
        console.warn("[recorder] Could not fetch directories:", err);
        return [];
    }
}

// =============================================================
// RECORDING MODAL
// =============================================================

/**
 * Show the recording modal
 * Returns a Promise that resolves with the recording result or null if cancelled
 * 
 * @param {string} annotationId - The ID of the annotation this recording belongs to
 * @param {object} options - Optional configuration
 * @param {string} options.existingDirectory - Pre-selected directory path
 * @returns {Promise<RecordingResult | null>}
 * 
 * @typedef {object} RecordingResult
 * @property {Blob} blob - The recorded audio blob
 * @property {string} mimeType - The MIME type of the recording
 * @property {boolean} consent - Whether consent was given
 * @property {number} duration - Recording duration in ms
 * @property {object} metadata - User-provided metadata
 * @property {string} metadata.author - Author name or "Anonymous"
 * @property {string} metadata.url - Optional URL
 * @property {boolean} metadata.anonymous - Whether anonymous was selected
 * @property {string} targetDirectory - The target directory for upload
 */
export function showRecordingModal(annotationId, options = {}) {
    return new Promise(async (resolve) => {
        // Check browser support
        if (!isRecordingSupported()) {
            alert("Recording is not supported in this browser. Please use a modern browser like Chrome, Firefox, or Safari.");
            resolve(null);
            return;
        }

        const mimeType = getBestRecordingMime();
        if (!mimeType) {
            alert("No supported audio recording format found in this browser.");
            resolve(null);
            return;
        }

        // Fetch existing directories for the dropdown
        const existingDirs = await fetchExistingDirectories();

        // Create modal overlay
        const overlay = document.createElement("div");
        overlay.className = "osc-overlay visible";

        // Create modal dialog
        const modal = document.createElement("div");
        modal.className = "osc-modal osc-modal--wide";
        modal.style.padding = "24px";

        // Title
        const title = document.createElement("div");
        title.textContent = "Record Contribution";
        title.className = "osc-dialog-title";
        title.style.textAlign = "center";
        title.style.marginBottom = "16px";
        modal.appendChild(title);

        // =============================================================
        // METADATA SECTION
        // =============================================================
        const metadataSection = document.createElement("div");
        metadataSection.className = "osc-dialog-section--grouped";
        metadataSection.style.marginBottom = "12px";

        // Anonymous checkbox
        const anonRow = document.createElement("label");
        anonRow.className = "osc-dialog-checkbox-row";
        anonRow.style.marginBottom = "10px";

        const anonCheckbox = document.createElement("input");
        anonCheckbox.type = "checkbox";
        anonCheckbox.checked = false;

        const anonLabel = document.createElement("span");
        anonLabel.textContent = "Contribute anonymously";
        // opacity handled by parent .osc-dialog-checkbox-row

        anonRow.appendChild(anonCheckbox);
        anonRow.appendChild(anonLabel);
        metadataSection.appendChild(anonRow);

        // Author name input
        const authorRow = document.createElement("div");
        authorRow.style.marginBottom = "8px";

        const authorLabelEl = document.createElement("label");
        authorLabelEl.textContent = "Your name";
        authorLabelEl.className = "osc-dialog-hint";
        authorLabelEl.style.display = "block";
        authorLabelEl.style.marginBottom = "4px";

        const authorInput = document.createElement("input");
        authorInput.type = "text";
        authorInput.placeholder = "Name (optional)";
        authorInput.className = "osc-dialog-input";
        authorInput.style.width = "100%";
        authorInput.style.boxSizing = "border-box";

        authorRow.appendChild(authorLabelEl);
        authorRow.appendChild(authorInput);
        metadataSection.appendChild(authorRow);

        // URL input
        const urlRow = document.createElement("div");
        
        const urlLabelEl = document.createElement("label");
        urlLabelEl.textContent = "Website / social link (optional)";
        urlLabelEl.className = "osc-dialog-hint";
        urlLabelEl.style.display = "block";
        urlLabelEl.style.marginBottom = "4px";

        const urlInput = document.createElement("input");
        urlInput.type = "url";
        urlInput.placeholder = "https://...";
        urlInput.className = "osc-dialog-input";
        urlInput.style.width = "100%";
        urlInput.style.boxSizing = "border-box";

        urlRow.appendChild(urlLabelEl);
        urlRow.appendChild(urlInput);
        metadataSection.appendChild(urlRow);

        // Toggle metadata fields based on anonymous
        const updateMetadataVisibility = () => {
            const isAnon = anonCheckbox.checked;
            authorRow.style.display = isAnon ? "none" : "block";
            urlRow.style.display = isAnon ? "none" : "block";
        };
        anonCheckbox.onchange = updateMetadataVisibility;

        modal.appendChild(metadataSection);

        // =============================================================
        // DIRECTORY SELECTION
        // =============================================================
        const dirSection = document.createElement("div");
        dirSection.className = "osc-dialog-section--grouped";
        dirSection.style.marginBottom = "12px";

        const dirLabel = document.createElement("label");
        dirLabel.textContent = "Save to directory";
        dirLabel.className = "osc-dialog-hint";
        dirLabel.style.display = "block";
        dirLabel.style.marginBottom = "6px";
        dirSection.appendChild(dirLabel);

        const dirSelect = document.createElement("select");
        dirSelect.className = "osc-dialog-input";
        dirSelect.style.width = "100%";
        dirSelect.style.marginBottom = "8px";

        // Add options
        const defaultOpt = document.createElement("option");
        defaultOpt.value = `ann_${annotationId}`;
        defaultOpt.textContent = `New: ann_${annotationId.slice(0, 8)}...`;
        dirSelect.appendChild(defaultOpt);

        // Add existing directories
        existingDirs.forEach(dir => {
            const opt = document.createElement("option");
            opt.value = dir;
            opt.textContent = dir;
            dirSelect.appendChild(opt);
        });

        // Custom directory option
        const customOpt = document.createElement("option");
        customOpt.value = "__custom__";
        customOpt.textContent = "➕ Create new directory...";
        dirSelect.appendChild(customOpt);

        dirSection.appendChild(dirSelect);

        // Custom directory input (hidden by default)
        const customDirRow = document.createElement("div");
        customDirRow.style.display = "none";

        const customDirInput = document.createElement("input");
        customDirInput.type = "text";
        customDirInput.placeholder = "my-contribution-folder";
        customDirInput.className = "osc-dialog-input";
        customDirInput.style.width = "100%";
        customDirInput.style.boxSizing = "border-box";

        const customDirHint = document.createElement("div");
        customDirHint.textContent = "Letters, numbers, hyphens only";
        customDirHint.className = "osc-dialog-hint";
        customDirHint.style.marginTop = "4px";

        customDirRow.appendChild(customDirInput);
        customDirRow.appendChild(customDirHint);
        dirSection.appendChild(customDirRow);

        dirSelect.onchange = () => {
            customDirRow.style.display = dirSelect.value === "__custom__" ? "block" : "none";
        };

        // Pre-select existing directory if provided
        if (options.existingDirectory) {
            dirSelect.value = options.existingDirectory;
        }

        modal.appendChild(dirSection);

        // =============================================================
        // CONSENT SECTION
        // =============================================================
        const consentSection = document.createElement("div");
        consentSection.className = "osc-dialog-section--warning";
        consentSection.style.marginBottom = "16px";

        const consentRow = document.createElement("label");
        consentRow.className = "osc-dialog-checkbox-row";
        consentRow.style.alignItems = "flex-start";

        const consentCheckbox = document.createElement("input");
        consentCheckbox.type = "checkbox";
        consentCheckbox.style.marginTop = "2px";
        consentCheckbox.style.flexShrink = "0";

        const consentText = document.createElement("span");
        consentText.innerHTML = `I consent to my contribution being used by the artist in performances, installations, documentation, and future works related to this project.`;
        // opacity handled by parent .osc-dialog-checkbox-row

        consentRow.appendChild(consentCheckbox);
        consentRow.appendChild(consentText);
        consentSection.appendChild(consentRow);
        modal.appendChild(consentSection);

        // =============================================================
        // VU METER
        // =============================================================
        const vuContainer = document.createElement("div");
        vuContainer.className = "osc-vu-container";
        vuContainer.style.marginBottom = "12px";

        const vuLabel = document.createElement("div");
        vuLabel.textContent = "Input Level";
        vuLabel.className = "osc-vu-label";
        vuLabel.style.textAlign = "center";
        vuContainer.appendChild(vuLabel);

        const vuBarBg = document.createElement("div");
        vuBarBg.className = "osc-vu-bar-bg";
        vuBarBg.style.height = "12px";

        const vuBar = document.createElement("div");
        vuBar.className = "osc-vu-bar";
        vuBar.style.background = "linear-gradient(90deg, #00ff88 0%, #ffff00 70%, #ff4444 100%)";
        vuBarBg.appendChild(vuBar);
        vuContainer.appendChild(vuBarBg);

        // Peak indicator
        const vuPeak = document.createElement("div");
        vuPeak.className = "osc-vu-peak";
        vuPeak.textContent = "— dB";
        vuContainer.appendChild(vuPeak);

        modal.appendChild(vuContainer);

        // =============================================================
        // TIMER DISPLAY
        // =============================================================
        const timerDisplay = document.createElement("div");
        timerDisplay.className = "osc-timer-display";
        timerDisplay.style.fontSize = "42px";
        timerDisplay.textContent = "0:00";
        modal.appendChild(timerDisplay);

        // Max duration indicator
        const maxDurationText = document.createElement("div");
        maxDurationText.className = "osc-dialog-hint";
        maxDurationText.style.textAlign = "center";
        maxDurationText.style.marginBottom = "16px";
        maxDurationText.textContent = `Maximum: ${formatRecordingTime(RECORDING_MAX_DURATION_MS)}`;
        modal.appendChild(maxDurationText);

        // =============================================================
        // RECORDING BUTTON
        // =============================================================
        const recordBtn = document.createElement("button");
        recordBtn.className = "osc-record-btn";

        const innerCircle = document.createElement("div");
        innerCircle.className = "osc-record-btn-inner";
        recordBtn.appendChild(innerCircle);
        modal.appendChild(recordBtn);

        // Status text
        const statusText = document.createElement("div");
        statusText.className = "osc-status-text";
        statusText.textContent = "Check consent to enable recording";
        modal.appendChild(statusText);

        // =============================================================
        // PREVIEW SECTION (hidden until recording complete)
        // =============================================================
        const previewSection = document.createElement("div");
        previewSection.className = "osc-dialog-section--success";
        previewSection.style.display = "none";
        previewSection.style.marginBottom = "16px";

        const previewLabel = document.createElement("div");
        previewLabel.textContent = "Preview Recording";
        previewLabel.className = "osc-dialog-hint";
        previewLabel.style.textAlign = "center";
        previewLabel.style.marginBottom = "8px";
        previewSection.appendChild(previewLabel);

        const previewControls = document.createElement("div");
        previewControls.className = "osc-dialog-actions osc-dialog-actions--center";

        const playBtn = document.createElement("button");
        playBtn.textContent = "▶ Play";
        playBtn.className = "osc-dialog-btn osc-dialog-btn--primary";

        const reRecordBtn = document.createElement("button");
        reRecordBtn.textContent = "⏺ Record Again";
        reRecordBtn.className = "osc-dialog-btn osc-dialog-btn--warning";

        previewControls.appendChild(playBtn);
        previewControls.appendChild(reRecordBtn);
        previewSection.appendChild(previewControls);
        modal.appendChild(previewSection);

        // =============================================================
        // ACTION BUTTONS
        // =============================================================
        const actionRow = document.createElement("div");
        actionRow.className = "osc-dialog-actions osc-dialog-actions--center";

        const cancelBtn = document.createElement("button");
        cancelBtn.textContent = "Cancel";
        cancelBtn.className = "osc-dialog-btn osc-dialog-btn--ghost";

        const useBtn = document.createElement("button");
        useBtn.textContent = "Use Recording";
        useBtn.className = "osc-dialog-btn osc-dialog-btn--primary";
        useBtn.disabled = true;

        actionRow.appendChild(cancelBtn);
        actionRow.appendChild(useBtn);
        modal.appendChild(actionRow);

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // =============================================================
        // RECORDING STATE & AUDIO CONTEXT
        // =============================================================
        let mediaRecorder = null;
        let audioChunks = [];
        let recordingStartTime = null;
        let timerInterval = null;
        let recordedBlob = null;
        let isRecording = false;
        let audioContext = null;
        let analyser = null;
        let mediaStream = null;
        let vuAnimationId = null;
        let previewAudio = null;

        // =============================================================
        // VU METER UPDATE
        // =============================================================
        const updateVuMeter = () => {
            if (!analyser) return;

            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            analyser.getByteFrequencyData(dataArray);

            // Calculate RMS level
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
                sum += dataArray[i] * dataArray[i];
            }
            const rms = Math.sqrt(sum / dataArray.length);
            const level = Math.min(100, (rms / 128) * 100);

            // Update bar
            vuBar.style.width = `${level}%`;

            // Calculate dB
            const db = rms > 0 ? 20 * Math.log10(rms / 255) : -60;
            vuPeak.textContent = `${db.toFixed(1)} dB`;

            // Color feedback
            if (level > 90) {
                vuBar.style.filter = "brightness(1.2)";
            } else {
                vuBar.style.filter = "none";
            }

            if (isRecording || mediaStream) {
                vuAnimationId = requestAnimationFrame(updateVuMeter);
            }
        };

        // =============================================================
        // ENABLE/DISABLE RECORDING
        // =============================================================
        const updateRecordingAvailability = () => {
            const canRecord = consentCheckbox.checked;
            recordBtn.classList.toggle("enabled", canRecord);
            statusText.textContent = canRecord 
                ? "Click to start recording" 
                : "Check consent to enable recording";
        };

        consentCheckbox.onchange = updateRecordingAvailability;

        // =============================================================
        // START RECORDING
        // =============================================================
        const startRecording = async () => {
            if (!consentCheckbox.checked || isRecording) return;

            try {
                // Get audio stream
                mediaStream = await navigator.mediaDevices.getUserMedia({ 
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                    }
                });

                // Set up audio analysis for VU meter
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
                analyser = audioContext.createAnalyser();
                analyser.fftSize = 256;
                const source = audioContext.createMediaStreamSource(mediaStream);
                source.connect(analyser);

                // Start VU meter
                updateVuMeter();

                // Set up recorder
                audioChunks = [];
                mediaRecorder = new MediaRecorder(mediaStream, { mimeType });

                mediaRecorder.ondataavailable = (e) => {
                    if (e.data.size > 0) {
                        audioChunks.push(e.data);
                    }
                };

                mediaRecorder.onstop = () => {
                    // Create blob
                    recordedBlob = new Blob(audioChunks, { type: mimeType });
                    
                    // Show preview section
                    previewSection.style.display = "block";
                    
                    // Enable use button
                    useBtn.disabled = false;
                    
                    statusText.textContent = "Recording complete. Preview or use your recording.";
                };

                mediaRecorder.start(100);
                isRecording = true;
                recordingStartTime = Date.now();

                // Hide preview section during recording
                previewSection.style.display = "none";

                // Update UI
                recordBtn.classList.add("recording");
                statusText.textContent = "Recording...";
                timerDisplay.style.color = "var(--osc-danger, #c62828)";

                // Start timer
                timerInterval = setInterval(() => {
                    const elapsed = Date.now() - recordingStartTime;
                    timerDisplay.textContent = formatRecordingTime(elapsed);

                    if (elapsed >= RECORDING_MAX_DURATION_MS) {
                        stopRecording();
                    }
                }, 100);

            } catch (err) {
                console.error("[recording] Failed to start:", err);
                statusText.textContent = `Error: ${err.message || "Could not access microphone"}`;
            }
        };

        // =============================================================
        // STOP RECORDING
        // =============================================================
        const stopRecording = () => {
            if (!isRecording || !mediaRecorder) return;

            clearInterval(timerInterval);
            mediaRecorder.stop();
            isRecording = false;

            // Stop VU meter
            if (vuAnimationId) {
                cancelAnimationFrame(vuAnimationId);
                vuAnimationId = null;
            }

            // Stop media stream
            if (mediaStream) {
                mediaStream.getTracks().forEach(track => track.stop());
            }

            // Close audio context
            if (audioContext) {
                audioContext.close();
                audioContext = null;
            }

            // Reset VU
            vuBar.style.width = "0%";
            vuPeak.textContent = "— dB";

            // Reset UI
            recordBtn.classList.remove("recording");
            timerDisplay.style.color = "";
        };

        // =============================================================
        // PREVIEW PLAYBACK
        // =============================================================
        playBtn.onclick = () => {
            if (!recordedBlob) return;

            // Stop any existing playback
            if (previewAudio) {
                previewAudio.pause();
                previewAudio = null;
                playBtn.textContent = "▶ Play";
                return;
            }

            previewAudio = new Audio(URL.createObjectURL(recordedBlob));
            previewAudio.onended = () => {
                playBtn.textContent = "▶ Play";
                previewAudio = null;
            };
            previewAudio.play();
            playBtn.textContent = "⏹ Stop";
        };

        // =============================================================
        // RE-RECORD
        // =============================================================
        reRecordBtn.onclick = () => {
            // Stop any preview
            if (previewAudio) {
                previewAudio.pause();
                previewAudio = null;
                playBtn.textContent = "▶ Play";
            }

            // Reset state
            recordedBlob = null;
            previewSection.style.display = "none";
            useBtn.disabled = true;
            timerDisplay.textContent = "0:00";
            statusText.textContent = "Click to start recording";

            // Start new recording
            startRecording();
        };

        // =============================================================
        // TOGGLE RECORDING
        // =============================================================
        recordBtn.onclick = () => {
            if (!consentCheckbox.checked) return;
            
            if (isRecording) {
                stopRecording();
            } else {
                startRecording();
            }
        };

        // =============================================================
        // CANCEL
        // =============================================================
        cancelBtn.onclick = () => {
            if (isRecording) stopRecording();
            if (previewAudio) {
                previewAudio.pause();
                previewAudio = null;
            }
            document.body.removeChild(overlay);
            resolve(null);
        };

        // =============================================================
        // USE RECORDING
        // =============================================================
        useBtn.onclick = () => {
            if (!recordedBlob) return;

            // Determine target directory
            let targetDir;
            if (dirSelect.value === "__custom__") {
                const customName = customDirInput.value.trim().replace(/[^a-zA-Z0-9-_]/g, "-");
                if (!customName) {
                    statusText.textContent = "Please enter a directory name";
                    customDirInput.focus();
                    return;
                }
                targetDir = customName;
            } else {
                targetDir = dirSelect.value;
            }

            // Build metadata
            const metadata = {
                anonymous: anonCheckbox.checked,
                author: anonCheckbox.checked ? "Anonymous" : (authorInput.value.trim() || "Anonymous"),
                url: anonCheckbox.checked ? "" : urlInput.value.trim()
            };

            if (previewAudio) {
                previewAudio.pause();
                previewAudio = null;
            }

            document.body.removeChild(overlay);
            
            resolve({
                blob: recordedBlob,
                mimeType,
                consent: true,
                duration: Date.now() - recordingStartTime,
                metadata,
                targetDirectory: targetDir
            });
        };

        // =============================================================
        // CSS ANIMATION
        // =============================================================
        if (!document.getElementById('recording-pulse-style')) {
            const style = document.createElement('style');
            style.id = 'recording-pulse-style';
            style.textContent = `
                @keyframes pulse-recording {
                    0%, 100% { box-shadow: 0 0 0 0 rgba(255,80,80,0.4); }
                    50% { box-shadow: 0 0 0 12px rgba(255,80,80,0); }
                }
            `;
            document.head.appendChild(style);
        }

        // =============================================================
        // KEYBOARD HANDLER
        // =============================================================
        const onKeyDown = (e) => {
            if (e.key === "Escape") {
                cancelBtn.click();
                window.removeEventListener("keydown", onKeyDown);
            }
        };
        window.addEventListener("keydown", onKeyDown);
    });
}

// =============================================================
// UPLOAD RECORDED AUDIO
// =============================================================

/**
 * Upload a recorded audio blob to the server
 * 
 * @param {Blob} blob - The recorded audio blob
 * @param {string} mimeType - The MIME type of the recording
 * @param {string} targetDirectory - The target directory name
 * @param {object} metadata - Recording metadata
 * @param {HTMLInputElement} sourceInput - The source input field to update
 * @param {HTMLElement} statusMsg - Status message element to update
 * @returns {Promise<string|null>} - The uploaded file path or null on failure
 */
export async function uploadRecordedAudio(blob, mimeType, targetDirectory, metadata, sourceInput, statusMsg) {
    const projectName = getProjectName();
    if (!projectName) {
        if (statusMsg) statusMsg.textContent = "✗ No project loaded";
        return null;
    }

    // Generate filename with author if not anonymous
    const ext = getExtensionForMime(mimeType);
    const timestamp = Date.now();
    const authorSlug = metadata.anonymous ? "anon" : 
        (metadata.author || "unknown").toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 20);
    const filename = `${authorSlug}_${timestamp}${ext}`;
    
    // Build subdirectory path
    const subdir = `contributions/${targetDirectory}`;

    if (statusMsg) statusMsg.textContent = `Uploading recording...`;

    try {
        const formData = new FormData();
        const file = new File([blob], filename, { type: mimeType });
        formData.append("audio", file);

        const url = `/api/upload-audio/${projectName}?subdir=${encodeURIComponent(subdir)}`;

        const res = await fetch(url, {
            method: "POST",
            body: formData
        });

        const result = await res.json();

        if (!res.ok) {
            throw new Error(result.error || "Upload failed");
        }

        // Update source input with the path
        if (sourceInput) {
            sourceInput.value = result.path;
        }
        
        if (statusMsg) statusMsg.textContent = `✓ Recorded: ${result.path}`;
        
        console.log(`[recording] Uploaded to: ${result.path}`, metadata);
        return result.path;

    } catch (err) {
        console.error("[recording] Upload failed:", err);
        if (statusMsg) statusMsg.textContent = `✗ Upload failed: ${err.message}`;
        return null;
    }
}