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
// RECORDING MODAL
// =============================================================

/**
 * Show the recording modal
 * Returns a Promise that resolves with the recorded Blob or null if cancelled
 * 
 * @param {string} annotationId - The ID of the annotation this recording belongs to
 * @returns {Promise<{blob: Blob, mimeType: string, consent: boolean, duration: number} | null>}
 */
export function showRecordingModal(annotationId) {
    return new Promise((resolve) => {
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
            min-width: 320px;
            max-width: 400px;
            color: white;
            box-shadow: 0 20px 60px rgba(0,0,0,0.5);
        `;

        // Title
        const title = document.createElement("div");
        title.textContent = "Record Audio";
        title.style.cssText = `
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 16px;
            text-align: center;
        `;
        modal.appendChild(title);

        // Consent section
        const consentSection = document.createElement("div");
        consentSection.style.cssText = `
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.1);
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

        // Timer display
        const timerDisplay = document.createElement("div");
        timerDisplay.style.cssText = `
            font-size: 36px;
            font-family: monospace;
            text-align: center;
            margin: 20px 0;
            color: rgba(255,255,255,0.9);
        `;
        timerDisplay.textContent = "0:00";
        modal.appendChild(timerDisplay);

        // Max duration indicator
        const maxDurationText = document.createElement("div");
        maxDurationText.style.cssText = `
            font-size: 11px;
            text-align: center;
            opacity: 0.6;
            margin-bottom: 16px;
        `;
        maxDurationText.textContent = `Maximum: ${formatRecordingTime(RECORDING_MAX_DURATION_MS)}`;
        modal.appendChild(maxDurationText);

        // Recording button
        const recordBtn = document.createElement("button");
        recordBtn.style.cssText = `
            display: block;
            width: 80px;
            height: 80px;
            margin: 0 auto 20px;
            border-radius: 50%;
            border: 3px solid rgba(255,100,100,0.6);
            background: rgba(255,80,80,0.2);
            cursor: not-allowed;
            opacity: 0.5;
            transition: all 0.2s ease;
            position: relative;
        `;

        // Inner circle (recording indicator)
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

        // Action buttons
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

        // Recording state
        let mediaRecorder = null;
        let audioChunks = [];
        let recordingStartTime = null;
        let timerInterval = null;
        let recordedBlob = null;
        let isRecording = false;

        // Enable/disable recording based on consent
        const updateRecordingAvailability = () => {
            const canRecord = consentCheckbox.checked;
            recordBtn.style.cursor = canRecord ? "pointer" : "not-allowed";
            recordBtn.style.opacity = canRecord ? "1" : "0.5";
            statusText.textContent = canRecord 
                ? "Click to start recording" 
                : "Check consent to enable recording";
        };

        consentCheckbox.onchange = updateRecordingAvailability;

        // Start recording
        const startRecording = async () => {
            if (!consentCheckbox.checked || isRecording) return;

            try {
                const stream = await navigator.mediaDevices.getUserMedia({ 
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                    }
                });

                audioChunks = [];
                mediaRecorder = new MediaRecorder(stream, { mimeType });

                mediaRecorder.ondataavailable = (e) => {
                    if (e.data.size > 0) {
                        audioChunks.push(e.data);
                    }
                };

                mediaRecorder.onstop = () => {
                    // Stop all tracks
                    stream.getTracks().forEach(track => track.stop());
                    
                    // Create blob
                    recordedBlob = new Blob(audioChunks, { type: mimeType });
                    
                    // Enable use button
                    useBtn.disabled = false;
                    useBtn.style.cursor = "pointer";
                    useBtn.style.opacity = "1";
                    
                    statusText.textContent = "Recording complete. Click 'Use Recording' to save.";
                };

                mediaRecorder.start(100); // Collect data every 100ms
                isRecording = true;
                recordingStartTime = Date.now();

                // Update UI
                innerCircle.style.borderRadius = "4px";
                innerCircle.style.width = "24px";
                innerCircle.style.height = "24px";
                recordBtn.style.borderColor = "rgba(255,100,100,1)";
                recordBtn.style.animation = "pulse-recording 1s infinite";
                statusText.textContent = "Recording...";

                // Start timer
                timerInterval = setInterval(() => {
                    const elapsed = Date.now() - recordingStartTime;
                    timerDisplay.textContent = formatRecordingTime(elapsed);

                    // Auto-stop at max duration
                    if (elapsed >= RECORDING_MAX_DURATION_MS) {
                        stopRecording();
                    }
                }, 100);

            } catch (err) {
                console.error("[recording] Failed to start:", err);
                statusText.textContent = `Error: ${err.message || "Could not access microphone"}`;
            }
        };

        // Stop recording
        const stopRecording = () => {
            if (!isRecording || !mediaRecorder) return;

            clearInterval(timerInterval);
            mediaRecorder.stop();
            isRecording = false;

            // Reset UI
            innerCircle.style.borderRadius = "50%";
            innerCircle.style.width = "32px";
            innerCircle.style.height = "32px";
            recordBtn.style.borderColor = "rgba(255,100,100,0.6)";
            recordBtn.style.animation = "none";
        };

        // Toggle recording on button click
        recordBtn.onclick = () => {
            if (!consentCheckbox.checked) return;
            
            if (isRecording) {
                stopRecording();
            } else {
                startRecording();
            }
        };

        // Cancel button
        cancelBtn.onclick = () => {
            if (isRecording) {
                stopRecording();
            }
            document.body.removeChild(overlay);
            resolve(null);
        };

        // Use recording button
        useBtn.onclick = () => {
            if (recordedBlob) {
                document.body.removeChild(overlay);
                resolve({
                    blob: recordedBlob,
                    mimeType,
                    consent: true,
                    duration: Date.now() - recordingStartTime
                });
            }
        };

        // Add CSS animation for recording pulse
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

        // Close on escape
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
 * @param {string} annotationId - The annotation ID for directory scoping
 * @param {HTMLInputElement} sourceInput - The source input field to update
 * @param {HTMLElement} statusMsg - Status message element to update
 * @returns {Promise<string|null>} - The uploaded file path or null on failure
 */
export async function uploadRecordedAudio(blob, mimeType, annotationId, sourceInput, statusMsg) {
    const projectName = getProjectName();
    if (!projectName) {
        if (statusMsg) statusMsg.textContent = "✗ No project loaded";
        return null;
    }

    // Generate filename: recording_<timestamp>.<ext>
    const ext = getExtensionForMime(mimeType);
    const timestamp = Date.now();
    const filename = `recording_${timestamp}${ext}`;
    
    // Determine subdirectory based on annotation ID
    const subdir = `contributions/${annotationId}`;

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
        
        console.log(`[recording] Uploaded to: ${result.path}`);
        return result.path;

    } catch (err) {
        console.error("[recording] Upload failed:", err);
        if (statusMsg) statusMsg.textContent = `✗ Upload failed: ${err.message}`;
        return null;
    }
}