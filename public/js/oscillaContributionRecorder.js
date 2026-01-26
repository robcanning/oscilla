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
        overlay.style.cssText = `
            position: fixed; inset: 0; z-index: 1000002;
            background: rgba(0,0,0,0.85);
            display: flex; align-items: center; justify-content: center;
            backdrop-filter: blur(4px);
        `;

        // Create modal dialog
        const modal = document.createElement("div");
        modal.style.cssText = `
            background: rgba(25,25,25,0.98);
            border: 1px solid rgba(255,255,255,0.15);
            border-radius: 16px;
            padding: 24px;
            min-width: 360px;
            max-width: 440px;
            max-height: 90vh;
            overflow-y: auto;
            color: white;
            box-shadow: 0 20px 60px rgba(0,0,0,0.5);
        `;

        // Title
        const title = document.createElement("div");
        title.textContent = "Record Contribution";
        title.style.cssText = `
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 16px;
            text-align: center;
        `;
        modal.appendChild(title);

        // =============================================================
        // METADATA SECTION
        // =============================================================
        const metadataSection = document.createElement("div");
        metadataSection.style.cssText = `
            background: rgba(255,255,255,0.03);
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 8px;
            padding: 12px;
            margin-bottom: 12px;
        `;

        // Anonymous checkbox
        const anonRow = document.createElement("label");
        anonRow.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
            font-size: 12px;
            margin-bottom: 10px;
        `;

        const anonCheckbox = document.createElement("input");
        anonCheckbox.type = "checkbox";
        anonCheckbox.checked = false;

        const anonLabel = document.createElement("span");
        anonLabel.textContent = "Contribute anonymously";
        anonLabel.style.opacity = "0.9";

        anonRow.appendChild(anonCheckbox);
        anonRow.appendChild(anonLabel);
        metadataSection.appendChild(anonRow);

        // Author name input
        const authorRow = document.createElement("div");
        authorRow.style.cssText = `margin-bottom: 8px;`;

        const authorLabelEl = document.createElement("label");
        authorLabelEl.textContent = "Your name";
        authorLabelEl.style.cssText = `
            display: block;
            font-size: 11px;
            opacity: 0.7;
            margin-bottom: 4px;
        `;

        const authorInput = document.createElement("input");
        authorInput.type = "text";
        authorInput.placeholder = "Name (optional)";
        authorInput.style.cssText = `
            width: 100%;
            padding: 8px;
            border-radius: 6px;
            border: 1px solid rgba(255,255,255,0.15);
            background: rgba(0,0,0,0.3);
            color: white;
            font-size: 13px;
            box-sizing: border-box;
        `;

        authorRow.appendChild(authorLabelEl);
        authorRow.appendChild(authorInput);
        metadataSection.appendChild(authorRow);

        // URL input
        const urlRow = document.createElement("div");
        
        const urlLabelEl = document.createElement("label");
        urlLabelEl.textContent = "Website / social link (optional)";
        urlLabelEl.style.cssText = `
            display: block;
            font-size: 11px;
            opacity: 0.7;
            margin-bottom: 4px;
        `;

        const urlInput = document.createElement("input");
        urlInput.type = "url";
        urlInput.placeholder = "https://...";
        urlInput.style.cssText = `
            width: 100%;
            padding: 8px;
            border-radius: 6px;
            border: 1px solid rgba(255,255,255,0.15);
            background: rgba(0,0,0,0.3);
            color: white;
            font-size: 13px;
            box-sizing: border-box;
        `;

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
        dirSection.style.cssText = `
            background: rgba(255,255,255,0.03);
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 8px;
            padding: 12px;
            margin-bottom: 12px;
        `;

        const dirLabel = document.createElement("label");
        dirLabel.textContent = "Save to directory";
        dirLabel.style.cssText = `
            display: block;
            font-size: 11px;
            opacity: 0.7;
            margin-bottom: 6px;
        `;
        dirSection.appendChild(dirLabel);

        const dirSelect = document.createElement("select");
        dirSelect.style.cssText = `
            width: 100%;
            padding: 8px;
            border-radius: 6px;
            border: 1px solid rgba(255,255,255,0.15);
            background: rgba(0,0,0,0.3);
            color: white;
            font-size: 12px;
            margin-bottom: 8px;
        `;

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
        customDirRow.style.cssText = `display: none;`;

        const customDirInput = document.createElement("input");
        customDirInput.type = "text";
        customDirInput.placeholder = "my-contribution-folder";
        customDirInput.style.cssText = `
            width: 100%;
            padding: 8px;
            border-radius: 6px;
            border: 1px solid rgba(255,255,255,0.15);
            background: rgba(0,0,0,0.3);
            color: white;
            font-size: 12px;
            box-sizing: border-box;
        `;

        const customDirHint = document.createElement("div");
        customDirHint.textContent = "Letters, numbers, hyphens only";
        customDirHint.style.cssText = `
            font-size: 10px;
            opacity: 0.5;
            margin-top: 4px;
        `;

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
        consentSection.style.cssText = `
            background: rgba(255,200,100,0.08);
            border: 1px solid rgba(255,200,100,0.2);
            border-radius: 8px;
            padding: 12px;
            margin-bottom: 16px;
        `;

        const consentRow = document.createElement("label");
        consentRow.style.cssText = `
            display: flex;
            align-items: flex-start;
            gap: 10px;
            cursor: pointer;
            font-size: 12px;
            line-height: 1.4;
        `;

        const consentCheckbox = document.createElement("input");
        consentCheckbox.type = "checkbox";
        consentCheckbox.style.cssText = `
            margin-top: 2px;
            flex-shrink: 0;
        `;

        const consentText = document.createElement("span");
        consentText.innerHTML = `I consent to my contribution being used by the artist in performances, installations, documentation, and future works related to this project.`;
        consentText.style.opacity = "0.9";

        consentRow.appendChild(consentCheckbox);
        consentRow.appendChild(consentText);
        consentSection.appendChild(consentRow);
        modal.appendChild(consentSection);

        // =============================================================
        // VU METER
        // =============================================================
        const vuContainer = document.createElement("div");
        vuContainer.style.cssText = `
            margin-bottom: 12px;
            padding: 8px;
            background: rgba(0,0,0,0.3);
            border-radius: 8px;
        `;

        const vuLabel = document.createElement("div");
        vuLabel.textContent = "Input Level";
        vuLabel.style.cssText = `
            font-size: 10px;
            opacity: 0.6;
            margin-bottom: 6px;
            text-align: center;
        `;
        vuContainer.appendChild(vuLabel);

        const vuBarBg = document.createElement("div");
        vuBarBg.style.cssText = `
            width: 100%;
            height: 12px;
            background: rgba(255,255,255,0.1);
            border-radius: 6px;
            overflow: hidden;
            position: relative;
        `;

        const vuBar = document.createElement("div");
        vuBar.style.cssText = `
            width: 0%;
            height: 100%;
            background: linear-gradient(90deg, #00ff88 0%, #ffff00 70%, #ff4444 100%);
            border-radius: 6px;
            transition: width 0.05s ease-out;
        `;
        vuBarBg.appendChild(vuBar);
        vuContainer.appendChild(vuBarBg);

        // Peak indicator
        const vuPeak = document.createElement("div");
        vuPeak.style.cssText = `
            font-size: 10px;
            text-align: center;
            margin-top: 4px;
            opacity: 0.7;
            font-family: monospace;
        `;
        vuPeak.textContent = "— dB";
        vuContainer.appendChild(vuPeak);

        modal.appendChild(vuContainer);

        // =============================================================
        // TIMER DISPLAY
        // =============================================================
        const timerDisplay = document.createElement("div");
        timerDisplay.style.cssText = `
            font-size: 42px;
            font-family: monospace;
            text-align: center;
            margin: 16px 0;
            color: rgba(255,255,255,0.9);
        `;
        timerDisplay.textContent = "0:00";
        modal.appendChild(timerDisplay);

        // Max duration indicator
        const maxDurationText = document.createElement("div");
        maxDurationText.style.cssText = `
            font-size: 11px;
            text-align: center;
            opacity: 0.5;
            margin-bottom: 16px;
        `;
        maxDurationText.textContent = `Maximum: ${formatRecordingTime(RECORDING_MAX_DURATION_MS)}`;
        modal.appendChild(maxDurationText);

        // =============================================================
        // RECORDING BUTTON
        // =============================================================
        const recordBtn = document.createElement("button");
        recordBtn.style.cssText = `
            display: block;
            width: 80px;
            height: 80px;
            margin: 0 auto 16px;
            border-radius: 50%;
            border: 3px solid rgba(255,100,100,0.6);
            background: rgba(255,80,80,0.2);
            cursor: not-allowed;
            opacity: 0.5;
            transition: all 0.2s ease;
            position: relative;
        `;

        const innerCircle = document.createElement("div");
        innerCircle.style.cssText = `
            width: 32px;
            height: 32px;
            background: #ff4444;
            border-radius: 50%;
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            transition: all 0.2s ease;
        `;
        recordBtn.appendChild(innerCircle);
        modal.appendChild(recordBtn);

        // Status text
        const statusText = document.createElement("div");
        statusText.style.cssText = `
            text-align: center;
            font-size: 12px;
            color: rgba(255,255,255,0.7);
            margin-bottom: 16px;
            min-height: 18px;
        `;
        statusText.textContent = "Check consent to enable recording";
        modal.appendChild(statusText);

        // =============================================================
        // PREVIEW SECTION (hidden until recording complete)
        // =============================================================
        const previewSection = document.createElement("div");
        previewSection.style.cssText = `
            display: none;
            background: rgba(0,180,220,0.1);
            border: 1px solid rgba(0,180,220,0.3);
            border-radius: 8px;
            padding: 12px;
            margin-bottom: 16px;
        `;

        const previewLabel = document.createElement("div");
        previewLabel.textContent = "Preview Recording";
        previewLabel.style.cssText = `
            font-size: 11px;
            opacity: 0.7;
            margin-bottom: 8px;
            text-align: center;
        `;
        previewSection.appendChild(previewLabel);

        const previewControls = document.createElement("div");
        previewControls.style.cssText = `
            display: flex;
            gap: 8px;
            justify-content: center;
        `;

        const playBtn = document.createElement("button");
        playBtn.textContent = "▶ Play";
        playBtn.style.cssText = `
            padding: 8px 20px;
            border-radius: 6px;
            border: 1px solid rgba(0,180,220,0.4);
            background: rgba(0,180,220,0.2);
            color: rgba(0,220,255,0.95);
            cursor: pointer;
            font-size: 12px;
        `;

        const reRecordBtn = document.createElement("button");
        reRecordBtn.textContent = "⏺ Record Again";
        reRecordBtn.style.cssText = `
            padding: 8px 20px;
            border-radius: 6px;
            border: 1px solid rgba(255,150,100,0.4);
            background: rgba(255,150,100,0.15);
            color: rgba(255,180,150,0.95);
            cursor: pointer;
            font-size: 12px;
        `;

        previewControls.appendChild(playBtn);
        previewControls.appendChild(reRecordBtn);
        previewSection.appendChild(previewControls);
        modal.appendChild(previewSection);

        // =============================================================
        // ACTION BUTTONS
        // =============================================================
        const actionRow = document.createElement("div");
        actionRow.style.cssText = `
            display: flex;
            gap: 10px;
            justify-content: center;
        `;

        const cancelBtn = document.createElement("button");
        cancelBtn.textContent = "Cancel";
        cancelBtn.style.cssText = `
            padding: 10px 24px;
            border-radius: 8px;
            border: 1px solid rgba(255,255,255,0.2);
            background: transparent;
            color: white;
            cursor: pointer;
            font-size: 13px;
        `;

        const useBtn = document.createElement("button");
        useBtn.textContent = "Use Recording";
        useBtn.style.cssText = `
            padding: 10px 24px;
            border-radius: 8px;
            border: 1px solid rgba(0,180,220,0.4);
            background: rgba(0,180,220,0.2);
            color: rgba(0,220,255,0.95);
            cursor: not-allowed;
            opacity: 0.5;
            font-size: 13px;
        `;
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
            recordBtn.style.cursor = canRecord ? "pointer" : "not-allowed";
            recordBtn.style.opacity = canRecord ? "1" : "0.5";
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
                    useBtn.style.cursor = "pointer";
                    useBtn.style.opacity = "1";
                    
                    statusText.textContent = "Recording complete. Preview or use your recording.";
                };

                mediaRecorder.start(100);
                isRecording = true;
                recordingStartTime = Date.now();

                // Hide preview section during recording
                previewSection.style.display = "none";

                // Update UI
                innerCircle.style.borderRadius = "4px";
                innerCircle.style.width = "24px";
                innerCircle.style.height = "24px";
                recordBtn.style.borderColor = "rgba(255,100,100,1)";
                recordBtn.style.animation = "pulse-recording 1s infinite";
                statusText.textContent = "Recording...";
                timerDisplay.style.color = "#ff6666";

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
            innerCircle.style.borderRadius = "50%";
            innerCircle.style.width = "32px";
            innerCircle.style.height = "32px";
            recordBtn.style.borderColor = "rgba(255,100,100,0.6)";
            recordBtn.style.animation = "none";
            timerDisplay.style.color = "rgba(255,255,255,0.9)";
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
            useBtn.style.cursor = "not-allowed";
            useBtn.style.opacity = "0.5";
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