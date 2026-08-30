const SHARED_SECRET = "MY_SECRET_KEY_123";
const BIT_DURATION_MS = 200; 

let isTransmitting = false;

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

function transmitTokenForLock(targetLockId) {
    if (isTransmitting) return;

    const status = document.getElementById('status');
    const btn1 = document.getElementById('tx-btn-1');
    const btn2 = document.getElementById('tx-btn-2');
    const flashScreen = document.getElementById('flash-screen');
    const flashIcon = document.getElementById('flash-icon');

    isTransmitting = true;
    btn1.disabled = true;
    btn2.disabled = true;

    const payload = generateToken(targetLockId);
    
    // Header Structure: Warmup (11110000) + Preamble (11111000) + Payload (20 bits) + Stop (00)
    const fullBitStream = "1111000011111000" + payload + "00"; 
    
    status.innerText = `Transmitting: ${payload}`;

    let bitIndex = 0;

    const timer = setInterval(() => {
        if (bitIndex < fullBitStream.length) {
            const currentBit = fullBitStream[bitIndex];
            const isOn = (currentBit === '1');

            // High-contrast screen state modulation
            if (isOn) {
                flashScreen.style.backgroundColor = "#FFFFFF";
                flashIcon.style.color = "#000000";
            } else {
                flashScreen.style.backgroundColor = "#000000";
                flashIcon.style.color = "#222222";
            }

            bitIndex++;
        } else {
            clearInterval(timer);
            flashScreen.style.backgroundColor = "#000000";
            flashIcon.style.color = "#333333";
            
            status.innerText = `Sent: ${payload}`;
            btn1.disabled = false;
            btn2.disabled = false;
            isTransmitting = false;
        }
    }, BIT_DURATION_MS);
}
