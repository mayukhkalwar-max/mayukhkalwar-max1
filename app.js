const SHARED_SECRET = "MY_SECRET_KEY_123";
const BIT_DURATION_MS = 200; 

let track = null;
let imageCapture = null;
let useTorch = false;
let isTransmitting = false;

// Initialization tailored for Samsung S23 Ultra Hardware
window.addEventListener('DOMContentLoaded', async () => {
    const desc = document.getElementById('mode-desc');
    
    // Explicitly request back camera with exact constraints needed by Samsung WebKit/Chrome
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { 
                    facingMode: { exact: "environment" },
                    width: { ideal: 640 },
                    height: { ideal: 480 }
                }
            });
            
            track = stream.getVideoTracks()[0];
            const capabilities = track.getCapabilities ? track.getCapabilities() : {};

            if (capabilities.torch || 'torch' in capabilities) {
                useTorch = true;
                if (desc) desc.innerText = "Hardware LED Torch Enabled (S23 Ultra)";
            } else if ('ImageCapture' in window) {
                // Samsung Fallback path via ImageCapture API
                try {
                    imageCapture = new ImageCapture(track);
                    useTorch = true;
                    if (desc) desc.innerText = "Hardware Torch Enabled (ImageCapture API)";
                } catch (e) {}
            }
        } catch (e) {
            // Fallback for non-exact environment constraint
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
                track = stream.getVideoTracks()[0];
                useTorch = true;
                if (desc) desc.innerText = "Hardware LED Torch Enabled (Standard)";
            } catch (err) {
                if (desc) desc.innerText = "Screen Flash Mode Only (Camera Permission Denied)";
            }
        }
    }
});

// Robust torch toggle supporting both standard constraints and Samsung extensions
async function setTorchState(state) {
    if (!useTorch || !track) return;

    try {
        // Standard WebRTC constraint toggle
        await track.applyConstraints({
            advanced: [{ torch: state }]
        });
    } catch (e) {
        // Samsung One UI fallback method using fillLightMode / ImageCapture
        try {
            if (imageCapture && imageCapture.setOptions) {
                await imageCapture.setOptions({ fillLightMode: state ? 'flash' : 'off' });
            }
        } catch (err) {
            console.error("Torch toggle failed:", err);
        }
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

    // Ensure camera track is active on user gesture (Required on Samsung Internet / Chrome)
    if (track && track.readyState === 'ended') {
        location.reload();
        return;
    }

    isTransmitting = true;
    if (btn1) btn1.disabled = true;
    if (btn2) btn2.disabled = true;

    const payload = generateToken(targetLockId);
    
    // Header Structure: Warmup (11110000) + Preamble (11111000) + Payload (20 bits) + Stop (00)
    const fullBitStream = "1111000011111000" + payload + "00"; 
    
    if (status) status.innerText = `Token: ${payload}`;

    let bitIndex = 0;

    const timer = setInterval(async () => {
        if (bitIndex < fullBitStream.length) {
            const currentBit = fullBitStream[bitIndex];
            const isOn = (currentBit === '1');

            await setTorchState(isOn);

            if (flashBox) flashBox.style.backgroundColor = isOn ? "#FFFFFF" : "#000000";
            if (flashIcon) {
                flashIcon.style.color = isOn ? "#ffbb00" : "#222222";
                flashIcon.style.transform = isOn ? "scale(1.2)" : "scale(1)";
            }

            bitIndex++;
        } else {
            clearInterval(timer);
            await setTorchState(false);
            
            if (flashBox) flashBox.style.backgroundColor = "#111111";
            if (flashIcon) flashIcon.style.color = "#333333";
            
            if (status) status.innerText = `Sent: ${payload}`;
            
            if (btn1) btn1.disabled = false;
            if (btn2) btn2.disabled = false;
            isTransmitting = false;
        }
    }, BIT_DURATION_MS);
}
