const SHARED_SECRET = "MY_SECRET_KEY_123";
const BIT_DURATION_MS = 200; 

let track = null;
let useTorch = false;
let isTransmitting = false;

// Initialize camera stream directly attached to physical torch hardware
async function initCamera() {
    const desc = document.getElementById('mode-desc');
    
    try {
        // Enforce back-facing main camera module with torch capabilities
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: { exact: "environment" },
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        });
        
        const videoTracks = stream.getVideoTracks();
        if (videoTracks.length > 0) {
            track = videoTracks[0];
            
            // Apply advanced constraints specifically required by Samsung Chrome/OneUI
            try {
                await track.applyConstraints({
                    advanced: [{ torch: false }]
                });
                useTorch = true;
                if (desc) desc.innerText = "Hardware LED Torch Enabled (S23 Ultra Active)";
            } catch (torchErr) {
                // Check capability fallback
                const capabilities = track.getCapabilities ? track.getCapabilities() : {};
                if (capabilities.torch) {
                    useTorch = true;
                    if (desc) desc.innerText = "Hardware LED Torch Ready";
                } else {
                    if (desc) desc.innerText = "Screen Flash Mode Only (Torch stream unbound)";
                }
            }
        }
    } catch (e) {
        // Standard fallback if exact environment constraint is rejected
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
            track = stream.getVideoTracks()[0];
            useTorch = true;
            if (desc) desc.innerText = "Hardware LED Torch Enabled (Standard)";
        } catch (err) {
            if (desc) desc.innerText = "Screen Flash Mode Only";
        }
    }
}

// Run initialization on load
window.addEventListener('DOMContentLoaded', initCamera);

async function setTorchState(state) {
    if (!track) return;

    try {
        await track.applyConstraints({
            advanced: [{ torch: state }]
        });
    } catch (e) {
        console.warn("Direct torch control failed:", e);
    }
}

function generateToken(targetLockId) {
    const timeBucket = Math.floor(Date.now() / 30000);
    const rawString = SHARED_SECRET + targetLockId + timeBucket;
    let hash = 0;
    for (let i = 0; i < rawString.length; i++) {
        hash = ((hash << 5) - hash) + rawString.charCodeAt(i);
        hash |= 0;
    }
    return (Math.abs(hash) & 0xFFFFF).toString(2).padStart(20, '0');
}

async function transmitTokenForLock(targetLockId) {
    if (isTransmitting) return;

    const status = document.getElementById('status');
    const btn1 = document.getElementById('tx-btn-1');
    const btn2 = document.getElementById('tx-btn-2');
    const flashBox = document.getElementById('flash-box');
    const flashIcon = document.getElementById('flash-icon');

    // Re-initialize camera track if browser put video stream to sleep
    if (!track || track.readyState === 'ended') {
        await initCamera();
    }

    isTransmitting = true;
    if (btn1) btn1.disabled = true;
    if (btn2) btn2.disabled = true;

    const payload = generateToken(targetLockId);
    
    // Protocol stream: Warmup (11110000) + Preamble (11111000) + Key (20 bits) + Stop (00)
    const fullBitStream = "1111000011111000" + payload + "00"; 
    
    if (status) status.innerText = `Token: ${payload}`;

    let bitIndex = 0;

    const timer = setInterval(async () => {
        if (bitIndex < fullBitStream.length) {
            const currentBit = fullBitStream[bitIndex];
            const isOn = (currentBit === '1');

            if (useTorch) {
                await setTorchState(isOn);
            }

            // Screen flash sync fallback / visual feedback
            if (flashBox) flashBox.style.backgroundColor = isOn ? "#FFFFFF" : "#000000";
            if (flashIcon) {
                flashIcon.style.color = isOn ? "#ffbb00" : "#222222";
                flashIcon.style.transform = isOn ? "scale(1.2)" : "scale(1)";
            }

            bitIndex++;
        } else {
            clearInterval(timer);
            if (useTorch) {
                await setTorchState(false);
            }
            
            if (flashBox) flashBox.style.backgroundColor = "#111111";
            if (flashIcon) flashIcon.style.color = "#333333";
            
            if (status) status.innerText = `Sent: ${payload}`;
            
            if (btn1) btn1.disabled = false;
            if (btn2) btn2.disabled = false;
            isTransmitting = false;
        }
    }, BIT_DURATION_MS);
}
