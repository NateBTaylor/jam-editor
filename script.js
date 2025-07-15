const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const video = document.createElement('video');
video.crossOrigin = "anonymous";
video.setAttribute("playsinline", "true");
video.muted = false;
let isShaking = false;
let shakeEndTime = 0;
let currentShakeIntensity = 0;
let lastBassAvg = 0;
let warpIntensity = 0; // ranges from 0 to 1
const bassHistory = [];
const historyLength = 15;
let frameCount = 0


let audioCtx;
let analyser;
let source;
let timeDomainData;
let frequencyData;
let waveData;

const glowCanvas = document.createElement('canvas');
const glowCtx = glowCanvas.getContext('2d');

const offscreenCanvas = document.createElement('canvas');
const offscreenCtx = offscreenCanvas.getContext('2d');

// Resize limits
const MAX_WIDTH = 720;
const MAX_HEIGHT = 600;

document.body.addEventListener('click', () => {
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  });
  

let currentMode = 'none';

const modeSwitch = document.getElementById('modeSwitch');
modeSwitch.addEventListener('change', (e) => {
  currentMode = e.target.value;
});

let pulseEnabled = false
const pulseToggle = document.getElementById('pulseToggle')
pulseToggle.addEventListener('change', (e) => {
    pulseEnabled = e.target.checked
})

let shakeEnabled = false;
const shakeToggle = document.getElementById('shakeToggle');
shakeToggle.addEventListener('change', (e) => {
  shakeEnabled = e.target.checked;
  isShaking = false
});

let colorShiftEnabled = false
const colorShiftToggle = document.getElementById('colorShiftToggle')
colorShiftToggle.addEventListener('change', (e) => {
    colorShiftEnabled = e.target.checked;
});

let shakeThreshold = 0.05; // default sensitivity

const shakeRange = document.getElementById('shakeRange');
const shakeValue = document.getElementById('shakeValue');

shakeRange.addEventListener('input', (e) => {
  shakeThreshold = parseFloat(e.target.value);
  shakeValue.textContent = shakeThreshold.toFixed(3);
});

let enableWobble = false;
const wobbleToggle = document.getElementById("wobbleToggle");

wobbleToggle.addEventListener("change", () => {
  enableWobble = wobbleToggle.checked;
});

let filterMode = 'none';
document.getElementById('filterMode').addEventListener('change', e => {
  filterMode = e.target.value;
});

document.getElementById('videoUploader').addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (file) {
        const url = URL.createObjectURL(file);
        video.src = url;
        video.load();
        video.play()
        video.onloadedmetadata = () => {
            const { width, height } = scaleToFit(video.videoWidth, video.videoHeight);

            canvas.width = width;
            canvas.height = height;
            glowCanvas.width = canvas.width;
            glowCanvas.height = canvas.height;
            offscreenCanvas.width = canvas.width;
            offscreenCanvas.height = canvas.height;

            // 🔊 Setup audio context
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            source = audioCtx.createMediaElementSource(video);
            analyser = audioCtx.createAnalyser();
            analyser.fftSize = 512;
            analyser.smoothingTimeConstant = 0.95;

            const bufferLength = analyser.frequencyBinCount;
            timeDomainData = new Uint8Array(bufferLength);
            frequencyData = new Uint8Array(bufferLength);
            waveData = new Uint8Array(bufferLength)

            isShaking = false

            source.connect(analyser);
            analyser.connect(audioCtx.destination); // To actually hear the video

            video.play()
            requestAnimationFrame(draw);
        };
    }
});

const seekSlider = document.getElementById('seekSlider');
const timeDisplay = document.getElementById('timeDisplay');

video.addEventListener('loadedmetadata', () => {
  seekSlider.max = video.duration;
  updateTimeDisplay();
});

video.addEventListener('timeupdate', () => {
  seekSlider.value = video.currentTime;
  updateTimeDisplay();
});

seekSlider.addEventListener('input', () => {
  video.currentTime = parseFloat(seekSlider.value);
  updateTimeDisplay();
});

function updateTimeDisplay() {
  const format = (time) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  };

  const current = format(video.currentTime);
  const total = isNaN(video.duration) ? '00:00' : format(video.duration);
  timeDisplay.textContent = `${current} / ${total}`;
}


function scaleToFit(videoWidth, videoHeight) {
    const aspect = videoWidth / videoHeight;
  
    if (videoWidth > videoHeight) {
      // Landscape
      const width = Math.min(videoWidth, MAX_WIDTH);
      const height = width / aspect;
      return { width, height };
    } else {
      // Portrait
      const height = Math.min(videoHeight, MAX_HEIGHT);
      const width = height * aspect;
      return { width, height };
    }
}
  

function glowFilter() {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    glowCtx.clearRect(0, 0, glowCanvas.width, glowCanvas.height);
    glowCtx.filter = 'blur(4px) brightness(1.05) saturate(1.1)';
    glowCtx.clearRect(0, 0, glowCanvas.width, glowCanvas.height);
    glowCtx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const glowIntensity = 0.35

    // 3. Blend glow layer back with lighter mode
    ctx.save();
    ctx.globalAlpha = glowIntensity;
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(glowCanvas, 0, 0);
    ctx.restore();

    // 4. Add scanlines
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = '#000';
    for (let y = 0; y < canvas.height; y += 4) {
        ctx.fillRect(0, y, canvas.width, 1);
    }
    ctx.restore();
}

function fisheyeWarp(imageData, strength = 0.2) {
    const { width, height, data } = imageData;
    const output = ctx.createImageData(width, height);
  
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) / 2;
  
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dx = (x - cx) / radius;
        const dy = (y - cy) / radius;
        const dist = Math.sqrt(dx * dx + dy * dy);
  
        const factor = 1 + strength * (1 - dist);
        const sx = Math.floor(cx + dx * radius * factor);
        const sy = Math.floor(cy + dy * radius * factor);
  
        if (sx >= 0 && sx < width && sy >= 0 && sy < height) {
          const srcIndex = (sy * width + sx) * 4;
          const dstIndex = (y * width + x) * 4;
  
          output.data[dstIndex] = data[srcIndex];
          output.data[dstIndex + 1] = data[srcIndex + 1];
          output.data[dstIndex + 2] = data[srcIndex + 2];
          output.data[dstIndex + 3] = data[srcIndex + 3];
        }
      }
    }
  
    return output;
}
  

function metalFilter() {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    // 2. Deeper red tint with slightly less opacity
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = 'rgba(120, 0, 0, 0.18)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    // 3. Desaturation and brightness correction
    ctx.save();
    ctx.filter = 'grayscale(0.5) contrast(1.1) brightness(1)';
    ctx.drawImage(canvas, 0, 0);
    ctx.restore();

    // 4. Lighter vignette with smoother gradient
    const vignetteStrength = 0.35 + Math.min(currentShakeIntensity * 0.3, 0.4);
    ctx.save();
    const grd = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, canvas.width / 4,
        canvas.width / 2, canvas.height / 2, canvas.width / 1.05
    );
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, `rgba(0,0,0,${vignetteStrength})`);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    // 5. Light glitch scanlines
    ctx.save();
    ctx.globalAlpha = 0.04;
    ctx.fillStyle = '#111';
    for (let y = 0; y < canvas.height; y += 4) {
        if (Math.random() < 0.15) {
        ctx.fillRect(0, y, canvas.width, 1);
        }
    }
    ctx.restore();

    // 7. More intense fisheye distortion
    const strength = 0.16
    if (strength > 0.01) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const warped = fisheyeWarp(imageData, strength);
        ctx.putImageData(warped, 0, 0);
    }

}

function retroCamcorderFilter() {
    // 1. Draw the original video
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  
    // 2. Apply washed-out VHS color (sepia/green tint)
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = 'rgba(200, 180, 130, 0.12)'; // VHS tint overlay
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  
    // 3. Scanlines (stronger than usual)
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = '#000';
    for (let y = 0; y < canvas.height; y += 3) {
      ctx.fillRect(0, y, canvas.width, 1);
    }
    ctx.restore();
  
    // 4. Tape flicker (pulsing brightness)
    const flicker = 0.96 + Math.random() * 0.04;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.filter = `brightness(${flicker})`;
    ctx.drawImage(canvas, 0, 0);
    ctx.restore();
  
    // 5. Slight horizontal jitter every few frames
    if (Math.random() < 0.15) {
      const offset = Math.random() * 4 - 2; // -2px to +2px
      ctx.save();
      const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.putImageData(frame, offset, 0);
      ctx.restore();
    }
  
    // 6. Timestamp / Overlay
    ctx.save();
    ctx.font = '16px monospace';
    ctx.fillStyle = 'red';
    ctx.shadowColor = 'rgba(255, 0, 0, 0.4)';
    ctx.shadowBlur = 4;
    const now = new Date();
    const time = now.toLocaleTimeString([], { hour12: false });
    const date = now.toLocaleDateString();
    ctx.fillText(`REC  •  ${date} ${time}`, 20, 30);
    ctx.restore();
}

let psychedelicHue = 0;

const trailFrames = [];
const TRAIL_LENGTH = 20; // number of ghost frames


function psychedelicFilter() {

    analyser.getByteFrequencyData(frequencyData);
    const avgVolume = frequencyData.reduce((a, b) => a + b, 0) / frequencyData.length;
    const pulse = Math.min(avgVolume / 256, 1); // normalized

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw trail frames first
    for (let i = trailFrames.length - 1; i >= 0; i--) {
        const ghost = trailFrames[i];
        const alpha = (i + 1) / (trailFrames.length + 1); // fades out
    
        ctx.save();
        ctx.globalAlpha = 0.15 * alpha; // subtle trail glow
        ctx.filter = `blur(${(trailFrames.length - i)}px)`; // optional softness
        ctx.drawImage(ghost, 0, 0);
        ctx.restore();
    }

    ctx.save();
    const pulseScale = 1 + pulse * 0.7;
    ctx.globalAlpha = 0.4;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(pulseScale, pulseScale);
    ctx.translate(-canvas.width / 2, -canvas.height / 2);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.restore();


    // Store current frame into trail queue
    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = canvas.width;
    frameCanvas.height = canvas.height;
    frameCanvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

    if (frameCount % 1 == 0) {
        // Add to the start of the queue
        trailFrames.unshift(frameCanvas);

        // Limit to last N frames
        if (trailFrames.length > TRAIL_LENGTH) {
            trailFrames.pop();
        }
    }

    // 5. Apply hue rotation
    psychedelicHue = (psychedelicHue + 0.8 + pulse * 3) % 360;
    ctx.save();
    ctx.globalCompositeOperation = 'hue';
    ctx.fillStyle = `hsl(${psychedelicHue}, 100%, 50%)`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    // 5. Copy current canvas frame into offscreen canvas for next iteration
    offscreenCtx.fillStyle = 'rgba(0, 0, 0, 0.1)'; // Lower alpha = longer trails
    offscreenCtx.fillRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
    offscreenCtx.drawImage(canvas, 0, 0);
}

function grungeFilter() {
    // 1. Draw current video frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  
    // 2. Desaturate and crush blacks
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
  
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
  
      // Desaturate by averaging channels
      const gray = (r + g + b) / 3;
  
      // Grunge = desaturated + high contrast
      const contrast = (gray < 100) ? gray * 0.7 : gray * 1.1;
  
      // Add dirty greenish tint
      data[i]     = contrast * 0.8; // Red
      data[i + 1] = contrast * 0.95; // Green
      data[i + 2] = contrast * 0.8; // Blue
    }
  
    ctx.putImageData(imageData, 0, 0);
  
    // 3. Add grain
    const grainStrength = 20;
    const grainDensity = 0.15; // 15% of pixels
    for (let i = 0; i < canvas.width * canvas.height * grainDensity; i++) {
      const x = Math.floor(Math.random() * canvas.width);
      const y = Math.floor(Math.random() * canvas.height);
      const intensity = (Math.random() - 0.5) * grainStrength;
  
      ctx.fillStyle = `rgba(${intensity}, ${intensity}, ${intensity}, 0.1)`;
      ctx.fillRect(x, y, 1, 1);
    }
  
    // 4. Add vignette
    const gradient = ctx.createRadialGradient(
      canvas.width / 2,
      canvas.height / 2,
      canvas.width * 0.1,
      canvas.width / 2,
      canvas.height / 2,
      canvas.width * 0.6
    );
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.4)');
  
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawFilmBorder() {
    const holeWidth = 12;
    const holeHeight = 36;
    const holeSpacing = 24;
    const sidePadding = 24;
    const borderThickness = 36;
    const cornerRadius = 20;
  
    ctx.save();
  
    // Dark rounded frame
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.beginPath();
  
    // Outer rectangle
    ctx.rect(0, 0, canvas.width, canvas.height);
  
    // Inner rounded rectangle (cutout)
    ctx.moveTo(borderThickness + cornerRadius, borderThickness);
    ctx.lineTo(canvas.width - borderThickness - cornerRadius, borderThickness);
    ctx.quadraticCurveTo(canvas.width - borderThickness, borderThickness, canvas.width - borderThickness, borderThickness + cornerRadius);
    ctx.lineTo(canvas.width - borderThickness, canvas.height - borderThickness - cornerRadius);
    ctx.quadraticCurveTo(canvas.width - borderThickness, canvas.height - borderThickness, canvas.width - borderThickness - cornerRadius, canvas.height - borderThickness);
    ctx.lineTo(borderThickness + cornerRadius, canvas.height - borderThickness);
    ctx.quadraticCurveTo(borderThickness, canvas.height - borderThickness, borderThickness, canvas.height - borderThickness - cornerRadius);
    ctx.lineTo(borderThickness, borderThickness + cornerRadius);
    ctx.quadraticCurveTo(borderThickness, borderThickness, borderThickness + cornerRadius, borderThickness);
  
    // Cut out the inner shape
    ctx.closePath();
    ctx.fill("evenodd");
  
    // Sprocket holes on left and right (clear rectangles)
    for (let y = sidePadding; y < canvas.height - sidePadding; y += holeHeight + holeSpacing) {
      ctx.clearRect(0, y, holeWidth, holeHeight); // Left side
      ctx.clearRect(canvas.width - holeWidth, y, holeWidth, holeHeight); // Right side
    }
  
    ctx.restore();
}
  
  

function sepiaFilmFilter() {
    // 1. Draw current video frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  
    // 2. Get and modify pixel data
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
  
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
  
      // Convert to grayscale first
      const gray = 0.3 * r + 0.59 * g + 0.11 * b;
  
      // Apply sepia tone
      data[i]     = Math.min(255, gray * 1.07);  // R
      data[i + 1] = Math.min(255, gray * 0.74);  // G
      data[i + 2] = Math.min(255, gray * 0.43);  // B
  
      // Optional: Increase contrast slightly
      // Not needed if your footage already has strong contrast
    }
  
    ctx.putImageData(imageData, 0, 0);
  
    // 3. Add grain (subtle)
    const grainStrength = 20;
    const grainDensity = 0.13; // 15% of pixels
    for (let i = 0; i < canvas.width * canvas.height * grainDensity; i++) {
      const x = Math.floor(Math.random() * canvas.width);
      const y = Math.floor(Math.random() * canvas.height);
      const intensity = (Math.random() - 0.5) * grainStrength;
  
      ctx.fillStyle = `rgba(${intensity}, ${intensity}, ${intensity}, 0.1)`;
      ctx.fillRect(x, y, 1, 1);
    }
  
    // 4. Optional flicker (simulate projector instability)
    const flickerStrength = (Math.random() - 0.5) * 0.1; // Range: -0.05 to +0.05

    if (flickerStrength > 0) {
    // Light flicker
    ctx.fillStyle = `rgba(255, 255, 255, ${flickerStrength})`;
    } else {
    // Dark flicker
    ctx.fillStyle = `rgba(0, 0, 0, ${Math.abs(flickerStrength)})`;
    }

    ctx.fillRect(0, 0, canvas.width, canvas.height);

  
    // 5. Add vignette (classic vintage look)
    const gradient = ctx.createRadialGradient(
      canvas.width / 2,
      canvas.height / 2,
      canvas.width * 0.3,
      canvas.width / 2,
      canvas.height / 2,
      canvas.width * 0.75
    );
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.3)');

    drawFilmBorder()
  
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}
  
function neonCyberFilter() {
    // 1. Draw base video
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  
    // 2. Heavy dark overlay
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)'; // More darkness
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  
    // 3. Extract pixel data for edges
    const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = frame.data;
    const grayscale = new Uint8ClampedArray(canvas.width * canvas.height);
  
    for (let i = 0; i < data.length; i += 4) {
      grayscale[i / 4] = 0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2];
    }
  
    const edges = new Uint8ClampedArray(grayscale.length);
    for (let y = 1; y < canvas.height - 1; y++) {
      for (let x = 1; x < canvas.width - 1; x++) {
        const i = y * canvas.width + x;
        const gx = grayscale[i - 1] - grayscale[i + 1];
        const gy = grayscale[i - canvas.width] - grayscale[i + canvas.width];
        const mag = Math.sqrt(gx * gx + gy * gy);
        edges[i] = Math.min(255, mag * 3.5);
      }
    }
  
    // 4. Volume pulse detection
    analyser.getByteFrequencyData(frequencyData);
    const avg = frequencyData.reduce((a, b) => a + b, 0) / frequencyData.length;
    const pulse = Math.min(1, avg / 128);
  
    // 5. Pulse variables
    const glowAlpha = 0.4 + 0.6 * pulse; // Opacity changes with volume
    const glowSize = 1.5 + 2.5 * pulse;  // Size of each glow pixel grows with volume
  
    // 6. Draw glow lines
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(0, 255, 255, ${glowAlpha})`;
  
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const i = y * canvas.width + x;
        if (edges[i] > 50) {
          ctx.fillRect(x, y, glowSize, glowSize);
        }
      }
    }
  
    ctx.restore();
  
    // 7. Vignette for dramatic effect
    const gradient = ctx.createRadialGradient(
      canvas.width / 2, canvas.height / 2, canvas.width * 0.3,
      canvas.width / 2, canvas.height / 2, canvas.width * 0.85
    );
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, 'rgba(0,0,0,0.3)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}  
  
  // Utility to get volume-based pulse
function getVolumePulse() {
    analyser.getByteFrequencyData(frequencyData);
    const avg = frequencyData.reduce((a, b) => a + b, 0) / frequencyData.length;
    return Math.min(1, avg / 128);
}
  
let glitchTimer = 0;

function glitchFilter() {
  // 1. Draw video frame
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  // 2. Get current audio pulse
  analyser.getByteFrequencyData(frequencyData);
  const avg = frequencyData.reduce((a, b) => a + b, 0) / frequencyData.length;
  const pulse = Math.min(1, avg / 128);

  // 3. Occasionally trigger glitch
  if (Math.random() < 0.05 + pulse * 0.1) {
    glitchTimer = 5 + Math.floor(pulse * 10); // Frames of glitch
  }

  // 4. Apply glitch effects if active
  if (glitchTimer > 0) {
    const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = frame.data;

    // --- RGB Channel Offset ---
    const offset = Math.floor(4 + pulse * 6);
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width - offset; x++) {
        const i = (y * canvas.width + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // Offset red channel
        const oi = (y * canvas.width + (x + offset)) * 4;
        data[oi] = r;
        data[oi + 1] = g;
        data[oi + 2] = b;
      }
    }

    // --- Horizontal Tearing ---
    for (let i = 0; i < 5; i++) {
      const sliceHeight = 5 + Math.random() * 10;
      const y = Math.floor(Math.random() * (canvas.height - sliceHeight));
      const dx = Math.random() * 30 - 15;

      const slice = ctx.getImageData(0, y, canvas.width, sliceHeight);
      ctx.putImageData(slice, dx, y);
    }

    // --- Vertical Jitter ---
    const jitter = Math.random() * 10 - 5;
    ctx.translate(0, jitter);

    glitchTimer--;
  }

  // 5. White flash on very loud hits
  if (pulse > 0.15) {
    ctx.save();
    ctx.fillStyle = `rgba(255,255,255,${(pulse - 0.9) * 5})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  // Reset transform just in case
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

let vhsGlitchTimer = 0;

function vhsFilter() {
  // 1. Base video draw
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  // 2. Horizontal scanlines
  ctx.save();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
  ctx.lineWidth = 2
  for (let y = 0; y < canvas.height; y += 4) {
    ctx.beginPath();
    ctx.moveTo(0, y + Math.random()); // tiny jitter
    ctx.lineTo(canvas.width, y + Math.random());
    ctx.stroke();
  }
  ctx.restore();

  // 3. Flickering noise
  const noiseDensity = 200;
  ctx.save();
  for (let i = 0; i < noiseDensity; i++) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
    ctx.fillRect(x, y, 1, 1);
  }
  ctx.restore();

  // 4. Color smear (manual RGB shift using composite)
  const smear = 2;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 0.5;
  ctx.filter = "brightness(0.9)";

  // Red smear
  ctx.drawImage(video, smear, 0, canvas.width, canvas.height);
  // Blue smear
  ctx.drawImage(video, -smear, smear, canvas.width, canvas.height);

  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.filter = "none";
  ctx.globalCompositeOperation = "source-over";

  // 5. Random glitch slice tear
  if (vhsGlitchTimer <= 0 && Math.random() < 0.03) {
    vhsGlitchTimer = 3 + Math.floor(Math.random() * 5);
  }
  if (vhsGlitchTimer > 0) {
    const sliceHeight = 5 + Math.random() * 10;
    const y = Math.floor(Math.random() * (canvas.height - sliceHeight));
    const dx = (Math.random() - 0.5) * 30;

    const slice = ctx.getImageData(0, y, canvas.width, sliceHeight);
    ctx.putImageData(slice, dx, y);
    vhsGlitchTimer--;
  }

  // 6. Subtle vertical wobble
  const wobble = Math.sin(performance.now() / 80) * 0.6;
  ctx.translate(0, wobble);
  ctx.setTransform(1, 0, 0, 1, 0, 0); // reset

  drawTrackingOverlay()
}

function drawTrackingOverlay() {
    if (Math.random() < 0.01) return; // flicker it sometimes
    ctx.save();
    ctx.font = "bold 16px monospace";
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillText("TRACKING", 20, 20);
    ctx.restore();
}
  

function infernoFilter() {
    // 1. Draw base
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  
    // 2. Red/orange glow overlay
    ctx.save();
    ctx.globalCompositeOperation = "overlay";
    ctx.fillStyle = "rgba(255, 80, 0, 0.2)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  
    // 3. Heat distortion waves
    const strength = 0.3;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const tempCanvas = document.createElement("canvas");
    const tempCtx = tempCanvas.getContext("2d");
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    tempCtx.putImageData(imageData, 0, 0);
  
    const waveAmount = 1.5;
    for (let y = 0; y < canvas.height; y++) {
      const offset = Math.sin((performance.now() / 100) + y * 0.1) * waveAmount;
      ctx.drawImage(tempCanvas,
        0, y, canvas.width, 1,
        offset, y, canvas.width, 1);
    }

    // 2. Draw embers
    emberParticles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= 0.002;
    
        // Respawn if faded or off-screen
        if (p.alpha <= 0 || p.y < 0 || p.x < 0 || p.x > canvas.width) {
          p.x = Math.random() * canvas.width;
          p.y = Math.random() * canvas.height;
          p.alpha = 0.3 + Math.random() * 0.4;
          p.size = 1.3 + Math.random() * 2;
          p.vx = (Math.random() - 0.5) * 0.3;
          p.vy = -0.2 - Math.random() * 0.4;
        }
    
        ctx.beginPath();
        ctx.fillStyle = `rgba(255, 60, 60, ${p.alpha})`;
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
    });

    analyser.getByteFrequencyData(frequencyData);
    const avg = frequencyData.reduce((a, b) => a + b, 0) / frequencyData.length;
    const pulse = avg / 256;

    if (pulse > 0.1) {
        ctx.save();
        ctx.globalAlpha = pulse * 0.3;
        ctx.fillStyle = 'rgba(255, 200, 50, 0.2)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
    }
}

let emberParticles = [];

function initEmbers(count = 100) {
  emberParticles = [];
  for (let i = 0; i < count; i++) {
    emberParticles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      alpha: 0.3 + Math.random() * 0.4,
      size: 1.3 + Math.random() * 2,
      vx: (Math.random() - 0.5) * 0.3,
      vy: -0.2 - Math.random() * 0.4,
    });
  }
}

initEmbers()
  

let dreamHue = 0;
let dreamTime = 0;
const dreamCanvas = document.createElement('canvas');
const dreamCtx = dreamCanvas.getContext('2d');

function dreamWarpFilter() {
  analyser.getByteFrequencyData(frequencyData);
  const avg = frequencyData.reduce((a, b) => a + b, 0) / frequencyData.length;
  const pulse = avg / 256; // normalized 0-1 pulse value
  const intensity = pulse * 5;  // base intensity for waves

  dreamTime += 0.03 + intensity * 0.1;

  dreamCanvas.width = canvas.width;
  dreamCanvas.height = canvas.height;

  // Draw video frame into dreamCanvas
  dreamCtx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const source = dreamCtx.getImageData(0, 0, canvas.width, canvas.height);
  const dest = ctx.createImageData(canvas.width, canvas.height);

  const srcData = source.data;
  const dstData = dest.data;
  const width = canvas.width;
  const height = canvas.height;

  // Calculate scale factor for breathing effect: oscillates between 0.95 and 1.05 based on pulse
  // Adjust multiplier and base to get desired scale range
  const scaleBase = 1.0;
  const scaleAmplitude = 0.05;
  const scale = scaleBase + scaleAmplitude * Math.sin(pulse * Math.PI * 2);

  const centerX = width / 2;
  const centerY = height / 2;

  for (let y = 0; y < height; y++) {
    const yWaveOffset = Math.sin((y / 30) + dreamTime) * 10 * intensity;
    for (let x = 0; x < width; x++) {
      const xWaveOffset = Math.cos((x / 30) + dreamTime) * 10 * intensity;

      // Apply the original smooth wave warp
      let warpedX = x + xWaveOffset;
      let warpedY = y + yWaveOffset;

      // Apply breathing scale around center
      // Vector from center to warped pixel
      let dx = warpedX - centerX;
      let dy = warpedY - centerY;

      // Scale this vector by our scale factor
      dx *= scale;
      dy *= scale;

      // Get final source pixel coords after scaling
      const srcX = Math.max(0, Math.min(width - 1, Math.floor(centerX + dx)));
      const srcY = Math.max(0, Math.min(height - 1, Math.floor(centerY + dy)));

      const destIndex = (y * width + x) * 4;
      const srcIndex = (srcY * width + srcX) * 4;

      dstData[destIndex]     = srcData[srcIndex];
      dstData[destIndex + 1] = srcData[srcIndex + 1];
      dstData[destIndex + 2] = srcData[srcIndex + 2];
      dstData[destIndex + 3] = 255;
    }
  }

  ctx.putImageData(dest, 0, 0);

  // Hue shimmer effect
  dreamHue = (dreamHue + 0.6 + intensity * 2) % 360;
  ctx.save();
  ctx.globalCompositeOperation = 'hue';
  ctx.fillStyle = `hsl(${dreamHue}, 100%, 50%)`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}





function drawVideo() {
    ctx.save();

    if (enableWobble && warpIntensity > 0) {
        const t = performance.now() / 1000;
        const wobbleX = Math.sin(t * 20) * 0.08 * warpIntensity;
        const wobbleY = Math.cos(t * 15) * 0.08 * warpIntensity;
        const scale = 1 + 0.06 * warpIntensity;
      
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.scale(scale + wobbleX, scale + wobbleY);
        ctx.translate(-canvas.width / 2, -canvas.height / 2);
    }

    if (pulseEnabled) {
        analyser.getByteFrequencyData(frequencyData);
        const avgVolume = frequencyData.reduce((a, b) => a + b, 0) / frequencyData.length;
        const pulse = Math.min(avgVolume / 256, 1); // normalized

        const pulseScale = 1 + pulse * 0.6;
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.scale(pulseScale, pulseScale);
        ctx.translate(-canvas.width / 2, -canvas.height / 2);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    }


    if (filterMode === 'retroCamcorder') {
        retroCamcorderFilter();
    }
    if (filterMode === 'darkMetal') {
        metalFilter();
    }
    if (filterMode === 'glow80s') {
        glowFilter()
    }
    if (filterMode === 'psychedelicPulse') {
        psychedelicFilter();
    } 
    if (filterMode === 'grunge') {
        grungeFilter()
    }
    if (filterMode === 'sepiaFilm') {
        sepiaFilmFilter()
    }
    if (filterMode === 'neon') {
        neonCyberFilter();
    }
    if (filterMode === 'glitch') {
        glitchFilter()
    }
    if (filterMode === "vhs") {
        vhsFilter()
    }
    if(filterMode === 'fire') {
        infernoFilter()
    }
    if (filterMode === 'dream') {
        dreamWarpFilter()
    }
    if (filterMode === 'none') {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    }

    ctx.restore()
}
  
  

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    analyser.getByteFrequencyData(frequencyData)
    analyser.getByteTimeDomainData(timeDomainData)

    const currentTime = video.currentTime;

    frameCount = (frameCount || 0) + 1;

    // Get bass avg (bins 0–10)
    let bassSum = 0;
    for (let i = 0; i < 10; i++) {
        bassSum += frequencyData[i];
    }
    const bassAvg = bassSum / 10;

    // Add to history
    bassHistory.push(bassAvg);
    if (bassHistory.length > historyLength) bassHistory.shift();

    // Compute moving average
    const bassMean = bassHistory.reduce((a, b) => a + b, 0) / bassHistory.length;

    // Compare current to average
    const delta = bassAvg - bassMean;

    if (enableWobble && bassAvg > 130 && delta > 3) {
        const normalizedImpact = Math.min((bassAvg - 130) / 100, 1);
        const easedImpact = normalizedImpact ** 1.5;
        warpIntensity = Math.max(warpIntensity, easedImpact);
    }

    warpIntensity *= 0.95; // tweak this (0.85–0.97) for speed
    if (warpIntensity < 0.01) warpIntensity = 0;

    // Compute RMS (root mean square) = signal energy
    let sumSquares = 0;
    for (let i = 0; i < timeDomainData.length; i++) {
        const norm = (timeDomainData[i] - 128) / 128;
        sumSquares += norm * norm;
    }
    const rms = Math.sqrt(sumSquares / timeDomainData.length);

    // If volume spike, trigger shake
    if (shakeEnabled && rms > shakeThreshold && !isShaking) {
        isShaking = true;
        shakeEndTime = video.currentTime + 0.2 * (rms - shakeThreshold) * 10;
        currentShakeIntensity = rms * 15; // scale for visual effect
    }

    let scale = 1
    let dx = 0, dy = 0;
    if (isShaking && !video.paused) {
        const maxShake = currentShakeIntensity * 7;
        dx = (Math.random() - 0.5) * maxShake;
        dy = (Math.random() - 0.5) * maxShake;
        scale = 1 + Math.random() * 0.03
        if (video.currentTime > shakeEndTime) {
            isShaking = false;
            currentShakeIntensity = 0;
            scale = 1
        }
    }

    ctx.save();
    ctx.scale(scale, scale)
    ctx.translate(dx, dy);
    drawVideo()
    ctx.restore();

    if (currentMode === 'waveform') {
        drawWaveform();
    } else if (currentMode === 'bars') {
        drawFrequencyBars();
    }

    requestAnimationFrame(draw);
}

let baseHue = 200;
let baseS = 100
let baseL = 50
let h = 300

const colorPicker = document.getElementById("colorPicker");
let selectedColor = colorPicker.value;

colorPicker.addEventListener("input", () => {
  selectedColor = colorPicker.value;
  [h, baseS, baseL] = hexToHsl(selectedColor);
});

function hexToRgba(hex, alpha = 1) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
  
    if (max === min) {
      h = s = 0; // gray
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch(max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
        case g: h = ((b - r) / d + 2); break;
        case b: h = ((r - g) / d + 4); break;
      }
      h /= 6;
    }
  
    return [h * 360, s * 100, l * 100];
}

function hexToHsl(hex) {
    // Remove "#" if present
    hex = hex.replace(/^#/, '');
    let r = parseInt(hex.substring(0, 2), 16);
    let g = parseInt(hex.substring(2, 4), 16);
    let b = parseInt(hex.substring(4, 6), 16);
  
    r /= 255; g /= 255; b /= 255;
  
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
  
    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
        case g: h = ((b - r) / d + 2); break;
        case b: h = ((r - g) / d + 4); break;
      }
      h *= 60;
    }
  
    return [h, s * 100, l * 100];
}
  
  
function drawWaveform() {
    const bufferLength = analyser.frequencyBinCount;
    if (frameCount % 2 == 0) {
        analyser.getByteTimeDomainData(waveData);
    }

    const waveformHeight = 250;
    const waveformY = 100; 

    if (colorShiftEnabled && !video.paused) {
        const shakeBoost = currentShakeIntensity * 5; // more shake = more color shift
        h = (h + shakeBoost) % 360;
    }

    
    ctx.save();
    ctx.lineWidth = 5;
    ctx.strokeStyle = `hsla(${h}, ${baseS}%, ${baseL}%, 0.8)`;
    ctx.shadowColor = `hsla(${h}, ${baseS}%, ${baseL}%, 0.8)`;
    ctx.shadowBlur = 20;
    ctx.beginPath();

    const sliceWidth = canvas.width / bufferLength;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
        const v = waveData[i] / 128.0; // normalize between 0 and 2
        const y = waveformY + (v - 1) * waveformHeight;

        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }

        x += sliceWidth;
    }

    ctx.lineTo(canvas.width, waveformY);
    ctx.stroke();
    ctx.restore();
}

function drawFrequencyBars() {
    analyser.getByteFrequencyData(frequencyData);
  
    const barWidth = 4;
    const gap = 0;
    const totalBars = Math.floor(canvas.width / (barWidth + gap));
    const barHeightMultiplier = 2;
  
    ctx.save();

    if (colorShiftEnabled && !video.paused) {
        const shakeBoost = currentShakeIntensity * 5; // more shake = more color shift
        h = (h + shakeBoost) % 360;
    }
  
    for (let i = 0; i < totalBars; i++) {
      const value = frequencyData[i];
      const barHeight = value * barHeightMultiplier;
      const x = i * (barWidth + gap);
      const y = canvas.height - barHeight;
  
      ctx.fillStyle = `hsla(${h}, ${baseS}%, ${baseL}%, 0.8)`;
      ctx.shadowColor = `hsla(${h}, ${baseS}%, ${baseL}%, 0.8)`;
      ctx.shadowBlur = 30;
  
      ctx.fillRect(x, y, barWidth, barHeight);
    }
  
    ctx.restore();
  }
    


const downloadBtn = document.getElementById("downloadProcessed");
let recorder;
let recordedChunks = [];

downloadBtn.addEventListener("click", () => {
  if (!video.src) {
    alert("Please upload and play a video first.");
    return;
  }

  // Restart video from beginning
  video.currentTime = 0;
  video.play()

  // Create streams
  const canvasStream = canvas.captureStream(30); // 30 FPS
  const videoAudioStream = video.captureStream();
  const audioTracks = videoAudioStream.getAudioTracks();
  const combinedStream = new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks]);

  recordedChunks = [];
  recorder = new MediaRecorder(combinedStream, {
    mimeType: "video/webm; codecs=vp9"
  });

  recorder.ondataavailable = e => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };

  recorder.onstop = () => {
    const blob = new Blob(recordedChunks, { type: "video/webm" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "processed-video.webm";
    a.click();

    URL.revokeObjectURL(url);
  };

  recorder.start();

  // Stop when video ends
  video.onended = () => {
    recorder.stop();
  };

  // Start playback
  video.play();
});
