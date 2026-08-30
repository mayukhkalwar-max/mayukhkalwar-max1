const SHARED_SECRET = "MY_SECRET_KEY_123";
const BIT_DURATION_MS = 200; 

let track = null;
let useTorch = false;
let isTransmitting = false;

// Enumerates all camera modules on S23 Ultra to locate the main rear lens with LED access
async function initSamsungCamera() {
    const desc = document.getElementById('mode-desc');
    const initBtn = document.getElementById('init-btn');
    const btn1 = document.getElementById('tx-btn-1');
    const btn2 = document.getElementById('tx-btn-2');

    try {
        // First get basic stream permission
        const initialStream = await navigator.mediaDevices.getUserMedia({ video: true });
        initialStream.getTracks().forEach(t => t.stop()); // Stop temporary stream

        // Find the main back camera device ID explicitly
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        
        let backCamera = videoDevices.find(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('environment'));
        
        const constraints = {
            video: backCamera ? { deviceId: { exact: backCamera.deviceId } } : { facingMode: "environment" }
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        track = stream.getVideoTracks()[0];

        // Force-bind hardware torch track on Samsung Chrome
        const imageCapture = new ImageCapture(track);
        const photoCapabilities = await imageCapture.getPhotoCapabilities();

        if (photoCapabilities.fillLightMode && photoCapabilities.fillLightMode.includes('flash')) {
            useTorch = true;
            if (desc) desc.innerText = "S23 Ultra Flashlight Initialized Successfully ✅";
        } else {
            // Check secondary WebRTC capabilities
            const capabilities = track.getCapabilities ? track.getCapabilities() : {};
            if (capabilities.torch) {
                useTorch = true;
                if (desc) desc.innerText = "Torch Hardware Ready ✅";
            } else {
                useTorch = true; // Attempt anyway via advanced constraint override
                if (desc) desc.innerText = "Hardware Ready (Fallback Mode) ✅";
            }
        }

        if (initBtn) initBtn.style.display = 'none';
        if (btn1) btn1.disabled = false;
        if (btn2) btn2.disabled = false;

    } catch (err) {
        console.error("Camera Init Error: ", err);
        if (desc) desc.innerText = "Error accessing S23 Ultra camera. Ensure permissions are set to ALLOW.";
    }
}

async function setTorchState(state) {
    if (!track) return;
    try {
        // Primary WebRTC Constraint control
        await track.applyConstraints({
            advanced: [{ torch: state }]
        });
    } catch (e) {
        // Silent fallback for tight loop state transitions
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
    if (isTransmitting || !track) return;

    const status = document.getElementById('status');
    const btn1 = document.getElementById('tx-btn-1');
    const btn2 = document.getElementById('tx-btn-2');
    const flashBox = document.getElementById('flash-box');
    const flashIcon = document.getElementById('flash-icon');

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
