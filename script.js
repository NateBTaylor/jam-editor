const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
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

let visualizerYOffset = 0;
let visualizerXOffset = 0;

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

const psychCanvas = document.createElement('canvas');
const psychCtx = psychCanvas.getContext('2d');

// Resize limits
const MAX_WIDTH = 720;
const MAX_HEIGHT = 600;

document.body.addEventListener('click', () => {
    if (typeof audioCtx !== "undefined" && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
});
  
const YOffsetSlider = document.getElementById("YOffset");
const YOffsetValue = document.getElementById("YOffsetValue");

YOffsetSlider.addEventListener("input", (e) => {
  visualizerYOffset = parseInt(e.target.value);
  YOffsetValue.textContent = visualizerYOffset;
});

const XOffsetSlider = document.getElementById("XOffset");
const XOffsetValue = document.getElementById("XOffsetValue");

XOffsetSlider.addEventListener("input", (e) => {
  visualizerXOffset = parseInt(e.target.value);
  XOffsetValue.textContent = visualizerXOffset;
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

let shockwaveEnabled = false
const waveToggle = document.getElementById('shockwaveToggle')
waveToggle.addEventListener('change', (e) => {
    shockwaveEnabled = e.target.checked
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

let wobbleEnabled = false;
const wobbleToggle = document.getElementById("wobbleToggle");

wobbleToggle.addEventListener("change", () => {
  wobbleEnabled = wobbleToggle.checked;
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
            psychCanvas.width = canvas.width;
            psychCanvas.height = canvas.height;


            const YOffsetSlider = document.getElementById("YOffset");
            const YOffsetValue = document.getElementById("YOffsetValue");

            // Set Y offset slider limits based on canvas height
            const maxYOffset = Math.floor(canvas.height / 2);
            YOffsetSlider.min = -maxYOffset;
            YOffsetSlider.max = maxYOffset;
            YOffsetSlider.value = 0;
            YOffsetValue.textContent = "0";

            const XOffsetSlider = document.getElementById("XOffset");
            const XOffsetValue = document.getElementById("XOffsetValue");

            // Set Y offset slider limits based on canvas height
            const maxXOffset = Math.floor(canvas.height / 2);
            XOffsetSlider.min = -maxXOffset;
            XOffsetSlider.max = maxXOffset;
            XOffsetSlider.value = 0;
            XOffsetValue.textContent = "0";



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
  

function glowFilter(inputCtx, outputCtx) {
  const width = inputCtx.canvas.width;
  const height = inputCtx.canvas.height;

  // 1. Draw input onto output first
  outputCtx.drawImage(inputCtx.canvas, 0, 0, width, height);

  // 2. Create an offscreen canvas for the glow effect
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = width;
  glowCanvas.height = height;
  const glowCtx = glowCanvas.getContext('2d');

  glowCtx.clearRect(0, 0, width, height);
  glowCtx.filter = 'blur(4px) brightness(1.05) saturate(1.1)';
  glowCtx.drawImage(inputCtx.canvas, 0, 0, width, height);

  // 3. Blend glow layer back onto output with 'lighter' mode
  outputCtx.save();
  outputCtx.globalAlpha = 0.35;  // glowIntensity
  outputCtx.globalCompositeOperation = 'lighter';
  outputCtx.drawImage(glowCanvas, 0, 0);
  outputCtx.restore();

  // 4. Add scanlines on outputCtx
  outputCtx.save();
  outputCtx.globalAlpha = 0.07;
  outputCtx.fillStyle = '#000';
  for (let y = 0; y < height; y += 4) {
    outputCtx.fillRect(0, y, width, 1);
  }
  outputCtx.restore();
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
  

function metalFilter(inputCtx, outputCtx) {
  const width = inputCtx.canvas.width;
  const height = inputCtx.canvas.height;

  // 1. Draw input frame onto output
  outputCtx.drawImage(inputCtx.canvas, 0, 0, width, height);

  // 2. Deeper red tint with slightly less opacity
  outputCtx.save();
  outputCtx.globalCompositeOperation = 'multiply';
  outputCtx.fillStyle = 'rgba(120, 0, 0, 0.18)';
  outputCtx.fillRect(0, 0, width, height);
  outputCtx.restore();

  // 3. Desaturation and brightness correction
  outputCtx.save();
  outputCtx.filter = 'grayscale(0.5) contrast(1.1) brightness(1)';
  // Re-draw current output with filter
  // We have to draw from outputCtx canvas again since this is a separate context
  outputCtx.drawImage(outputCtx.canvas, 0, 0, width, height);
  outputCtx.restore();

  // 4. Lighter vignette with smoother gradient
  const vignetteStrength = 0.35 + Math.min(currentShakeIntensity * 0.3, 0.4); // you might want to pass currentShakeIntensity or make it global
  outputCtx.save();
  const grd = outputCtx.createRadialGradient(
    width / 2, height / 2, width / 4,
    width / 2, height / 2, width / 1.05
  );
  grd.addColorStop(0, 'rgba(0,0,0,0)');
  grd.addColorStop(1, `rgba(0,0,0,${vignetteStrength})`);
  outputCtx.fillStyle = grd;
  outputCtx.fillRect(0, 0, width, height);
  outputCtx.restore();

  // 5. Light glitch scanlines
  outputCtx.save();
  outputCtx.globalAlpha = 0.04;
  outputCtx.fillStyle = '#111';
  for (let y = 0; y < height; y += 4) {
    if (Math.random() < 0.15) {
      outputCtx.fillRect(0, y, width, 1);
    }
  }
  outputCtx.restore();

  // 6. More intense fisheye distortion
  const strength = getVolumePulse() / 4;
  if (strength > 0.01) {
    const imageData = outputCtx.getImageData(0, 0, width, height);
    const warped = fisheyeWarp(imageData, strength);
    outputCtx.putImageData(warped, 0, 0);
  }
}


function drawTimestamp(outputCtx, text, maxFontSize = 16, margin = 12, y = 25) {
  let fontSize = maxFontSize;
  outputCtx.font = `${fontSize}px monospace`;
  let textWidth = outputCtx.measureText(text).width;

  // Reduce font size until it fits
  while (textWidth > outputCtx.canvas.width - margin * 2 && fontSize > 8) {
    fontSize--;
    outputCtx.font = `${fontSize}px monospace`;
    textWidth = outputCtx.measureText(text).width;
  }

  // Draw text left-aligned with margin
  outputCtx.fillText(text, margin, y);
}

function retroCamcorderFilter(inputCtx, outputCtx) {
  const width = outputCtx.canvas.width;
  const height = outputCtx.canvas.height;

  // 1. Draw the original frame from inputCtx to outputCtx
  outputCtx.clearRect(0, 0, width, height);
  outputCtx.drawImage(inputCtx.canvas, 0, 0, width, height);

  // 2. Apply washed-out VHS color (sepia/green tint)
  outputCtx.save();
  outputCtx.globalCompositeOperation = 'multiply';
  outputCtx.fillStyle = 'rgba(200, 180, 130, 0.12)'; // VHS tint overlay
  outputCtx.fillRect(0, 0, width, height);
  outputCtx.restore();

  // 3. Scanlines (stronger than usual)
  outputCtx.save();
  outputCtx.globalAlpha = 0.07;
  outputCtx.fillStyle = '#000';
  for (let y = 0; y < height; y += 3) {
    outputCtx.fillRect(0, y, width, 1);
  }
  outputCtx.restore();

  // 4. Tape flicker (pulsing brightness)
  const flicker = 0.96 + Math.random() * 0.04;
  outputCtx.save();
  outputCtx.globalAlpha = 1;
  outputCtx.filter = `brightness(${flicker})`;
  // Re-draw current output with flicker applied (draw over itself)
  outputCtx.drawImage(outputCtx.canvas, 0, 0);
  outputCtx.restore();

  // 5. Slight horizontal jitter every few frames
  if (Math.random() < 0.15) {
    const offset = Math.random() * 4 - 2; // -2px to +2px
    const frame = outputCtx.getImageData(0, 0, width, height);
    outputCtx.clearRect(0, 0, width, height);
    outputCtx.putImageData(frame, offset, 0);
  }

  // 6. Timestamp / Overlay
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour12: false });
  const date = now.toLocaleDateString();
  const timestampText = `REC  •  ${date} ${time}`;

  outputCtx.save();
  outputCtx.fillStyle = 'red';
  outputCtx.shadowColor = 'rgba(255, 0, 0, 0.4)';
  outputCtx.shadowBlur = 4;

  drawTimestamp(outputCtx, timestampText);

  outputCtx.restore();
}


let psychedelicHue = 0;
const trailFrames = [];
const TRAIL_LENGTH = 20;

function psychedelicFilter(inputCtx, outputCtx) {
    analyser.getByteFrequencyData(frequencyData);
    const avgVolume = frequencyData.reduce((a, b) => a + b, 0) / frequencyData.length;
    const pulse = Math.min(avgVolume / 256, 1);
    const pulseScale = 1 + pulse * 0.7;

    const width = outputCtx.canvas.width;
    const height = outputCtx.canvas.height;

    outputCtx.clearRect(0, 0, width, height);

    // Draw trail frames
    for (let i = trailFrames.length - 1; i >= 0; i--) {
        const ghost = trailFrames[i];
        const alpha = (i + 1) / (trailFrames.length + 1);

        outputCtx.save();
        outputCtx.globalAlpha = 0.15 * alpha;
        outputCtx.filter = `blur(${(trailFrames.length - i)}px)`;
        outputCtx.drawImage(ghost, 0, 0);
        outputCtx.restore();
    }

    // Draw current frame with scale/pulse
    outputCtx.save();
    outputCtx.globalAlpha = 0.4;
    outputCtx.translate(width / 2, height / 2);
    outputCtx.scale(pulseScale, pulseScale);
    outputCtx.translate(-width / 2, -height / 2);
    outputCtx.drawImage(inputCtx.canvas, 0, 0, width, height);
    outputCtx.restore();

    // Store current frame for trail
    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = width;
    frameCanvas.height = height;
    frameCanvas.getContext('2d').drawImage(inputCtx.canvas, 0, 0, width, height);

    trailFrames.unshift(frameCanvas);
    if (trailFrames.length > TRAIL_LENGTH) {
        trailFrames.pop();
    }

    // Hue rotation overlay
    psychedelicHue = (psychedelicHue + 0.8 + pulse * 3) % 360;
    outputCtx.save();
    outputCtx.globalCompositeOperation = 'hue';
    outputCtx.fillStyle = `hsl(${psychedelicHue}, 100%, 50%)`;
    outputCtx.fillRect(0, 0, width, height);
    outputCtx.restore();
}


function grungeFilter(inputCtx, outputCtx) {
  const width = inputCtx.canvas.width;
  const height = inputCtx.canvas.height;

  // 1. Draw input onto output
  outputCtx.drawImage(inputCtx.canvas, 0, 0, width, height);

  // 2. Desaturate and crush blacks
  const imageData = outputCtx.getImageData(0, 0, width, height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const gray = (r + g + b) / 3;
    const contrast = (gray < 100) ? gray * 0.7 : gray * 1.1;

    data[i]     = contrast * 0.8;  // R
    data[i + 1] = contrast * 0.95; // G
    data[i + 2] = contrast * 0.8;  // B
  }

  outputCtx.putImageData(imageData, 0, 0);

  // 3. Add grain
  const grainStrength = 20;
  const grainDensity = 0.15;
  for (let i = 0; i < width * height * grainDensity; i++) {
    const x = Math.floor(Math.random() * width);
    const y = Math.floor(Math.random() * height);
    const intensity = (Math.random() - 0.5) * grainStrength;

    outputCtx.fillStyle = `rgba(${intensity}, ${intensity}, ${intensity}, 0.1)`;
    outputCtx.fillRect(x, y, 1, 1);
  }

  // 4. Add vignette
  const gradient = outputCtx.createRadialGradient(
    width / 2,
    height / 2,
    width * 0.1,
    width / 2,
    height / 2,
    width * 0.6
  );
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0.4)');

  outputCtx.fillStyle = gradient;
  outputCtx.fillRect(0, 0, width, height);
}



function drawFilmBorder(context) {
    const holeWidth = 12;
    const holeHeight = 36;
    const holeSpacing = 24;
    const sidePadding = 24;
    const borderThickness = 36;
    const cornerRadius = 20;
  
    context.save();
  
    // Dark rounded frame
    context.fillStyle = 'rgba(0, 0, 0, 0.7)';
    context.beginPath();
  
    // Outer rectangle
    context.rect(0, 0, canvas.width, canvas.height);
  
    // Inner rounded rectangle (cutout)
    context.moveTo(borderThickness + cornerRadius, borderThickness);
    context.lineTo(canvas.width - borderThickness - cornerRadius, borderThickness);
    context.quadraticCurveTo(canvas.width - borderThickness, borderThickness, canvas.width - borderThickness, borderThickness + cornerRadius);
    context.lineTo(canvas.width - borderThickness, canvas.height - borderThickness - cornerRadius);
    context.quadraticCurveTo(canvas.width - borderThickness, canvas.height - borderThickness, canvas.width - borderThickness - cornerRadius, canvas.height - borderThickness);
    context.lineTo(borderThickness + cornerRadius, canvas.height - borderThickness);
    context.quadraticCurveTo(borderThickness, canvas.height - borderThickness, borderThickness, canvas.height - borderThickness - cornerRadius);
    context.lineTo(borderThickness, borderThickness + cornerRadius);
    context.quadraticCurveTo(borderThickness, borderThickness, borderThickness + cornerRadius, borderThickness);
  
    // Cut out the inner shape
    context.closePath();
    context.fill("evenodd");
  
    // Sprocket holes on left and right (clear rectangles)
    for (let y = sidePadding; y < canvas.height - sidePadding; y += holeHeight + holeSpacing) {
      context.clearRect(0, y, holeWidth, holeHeight); // Left side
      context.clearRect(canvas.width - holeWidth, y, holeWidth, holeHeight); // Right side
    }
  
    context.restore();
}

function sepiaFilmFilter(inputCtx, outputCtx) {
  let width = canvas.width
  let height = canvas.height
  // 1. Get pixel data from input
  const imageData = inputCtx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // 2. Apply sepia tone with grayscale base
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const gray = 0.3 * r + 0.59 * g + 0.11 * b;

    data[i]     = Math.min(255, gray * 1.07); // R
    data[i + 1] = Math.min(255, gray * 0.74); // G
    data[i + 2] = Math.min(255, gray * 0.43); // B
  }

  // 3. Put the modified image data on the output context
  outputCtx.putImageData(imageData, 0, 0);

  // 4. Add grain
  const grainStrength = 20;
  const grainDensity = 0.13;
  for (let i = 0; i < width * height * grainDensity; i++) {
    const x = Math.floor(Math.random() * width);
    const y = Math.floor(Math.random() * height);
    const intensity = (Math.random() - 0.5) * grainStrength;
    outputCtx.fillStyle = `rgba(${intensity}, ${intensity}, ${intensity}, 0.1)`;
    outputCtx.fillRect(x, y, 1, 1);
  }

  // 5. Flicker effect
  const flickerStrength = (Math.random() - 0.5) * 0.1;
  if (flickerStrength > 0) {
    outputCtx.fillStyle = `rgba(255, 255, 255, ${flickerStrength})`;
  } else {
    outputCtx.fillStyle = `rgba(0, 0, 0, ${Math.abs(flickerStrength)})`;
  }
  outputCtx.fillRect(0, 0, width, height);

  // 6. Vignette
  const gradient = outputCtx.createRadialGradient(
    width / 2, height / 2, width * 0.3,
    width / 2, height / 2, width * 0.75
  );
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0.3)');

  outputCtx.fillStyle = gradient;
  outputCtx.fillRect(0, 0, width, height);

  // 7. Draw border (call externally if needed, or modify this)
  drawFilmBorder(outputCtx);
}

  
function neonFilter(inputCtx, outputCtx) {
  const width = inputCtx.canvas.width;
  const height = inputCtx.canvas.height;

  // 1. Draw base input onto output
  outputCtx.drawImage(inputCtx.canvas, 0, 0, width, height);

  // 2. Heavy dark overlay
  outputCtx.save();
  outputCtx.fillStyle = 'rgba(0, 0, 0, 0.50)';
  outputCtx.fillRect(0, 0, width, height);
  outputCtx.restore();

  // 3. Extract pixel data for edges
  const frame = outputCtx.getImageData(0, 0, width, height);
  const data = frame.data;
  const grayscale = new Uint8ClampedArray(width * height);

  for (let i = 0; i < data.length; i += 4) {
    grayscale[i / 4] = 0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2];
  }

  // 4. Edge detection
  const edges = new Uint8ClampedArray(grayscale.length);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const gx = grayscale[i - 1] - grayscale[i + 1];
      const gy = grayscale[i - width] - grayscale[i + width];
      const mag = Math.sqrt(gx * gx + gy * gy);
      edges[i] = Math.min(255, mag * 3.5);
    }
  }

  // 5. Volume pulse detection
  analyser.getByteFrequencyData(frequencyData);
  const avg = frequencyData.reduce((a, b) => a + b, 0) / frequencyData.length;
  const pulse = Math.min(1, avg / 128);

  // 6. Glow effect
  const glowAlpha = 0.4 + 0.6 * pulse;
  const glowSize = 1.5 + 2.5 * pulse;

  outputCtx.save();
  outputCtx.globalCompositeOperation = 'lighter';
  outputCtx.fillStyle = `rgba(0, 255, 255, ${glowAlpha})`;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (edges[i] > 50) {
        outputCtx.fillRect(x, y, glowSize, glowSize);
      }
    }
  }

  outputCtx.restore();

  // 7. Vignette overlay
  const gradient = outputCtx.createRadialGradient(
    width / 2, height / 2, width * 0.3,
    width / 2, height / 2, width * 0.85
  );
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(1, 'rgba(0,0,0,0.3)');
  outputCtx.fillStyle = gradient;
  outputCtx.fillRect(0, 0, width, height);
}

  
function getVolumePulse() {
    analyser.getByteFrequencyData(frequencyData);
    const avg = frequencyData.reduce((a, b) => a + b, 0) / frequencyData.length;
    return Math.min(1, avg / 128);
}
  
let glitchTimer = 0;

function glitchFilter(inputCtx, outputCtx) {
  const width = inputCtx.canvas.width;
  const height = inputCtx.canvas.height;
  outputCtx.drawImage(inputCtx.canvas, 0, 0, width, height);

  const frame = outputCtx.getImageData(0, 0, width, height);
  const src = frame.data;
  const dest = new Uint8ClampedArray(src); // Copy for manipulation

  // Audio pulse
  analyser.getByteFrequencyData(frequencyData);
  const avg = frequencyData.reduce((a, b) => a + b, 0) / frequencyData.length;
  const pulse = Math.min(1, avg / 128);

  // === 1. RGB Aberration ===
  const rOffset = Math.floor(pulse * 5 + 2);
  const gOffset = -Math.floor(pulse * 3);
  const bOffset = Math.floor(pulse * 8);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;

      const rIndex = ((y * width + Math.min(width - 1, x + rOffset)) * 4);
      const gIndex = ((y * width + Math.min(width - 1, x + gOffset)) * 4);
      const bIndex = ((y * width + Math.min(width - 1, x + bOffset)) * 4);

      dest[i]     = src[rIndex];     // Red
      dest[i + 1] = src[gIndex + 1]; // Green
      dest[i + 2] = src[bIndex + 2]; // Blue
      dest[i + 3] = src[i + 3];      // Alpha
    }
  }

  // === 2. Optional: Noise Flicker ===
  const noiseDensity = 100 * pulse;
  for (let i = 0; i < noiseDensity; i++) {
    const x = Math.floor(Math.random() * width);
    const y = Math.floor(Math.random() * height);
    const i4 = (y * width + x) * 4;
    const noise = Math.floor(Math.random() * 50);
    dest[i4] += noise;
    dest[i4 + 1] += noise;
    dest[i4 + 2] += noise;
  }

  // === 3. Optional: Scanline Flicker ===
  for (let y = 0; y < height; y += 2) {
    if (Math.random() < 0.3 * pulse) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        dest[i] *= 0.8;
        dest[i + 1] *= 0.8;
        dest[i + 2] *= 0.8;
      }
    }
  }

  // === 4. Output the modified pixel buffer ===
  const outputImage = new ImageData(dest, width, height);
  outputCtx.putImageData(outputImage, 0, 0);

  // === 5. Now do Horizontal Slice Shifts on final canvas ===
  if (pulse > 0.25) {
    let sliceCount = Math.floor(pulse * 8);
    for (let i = 0; i < sliceCount; i++) {
      const sliceHeight = 5 + Math.random() * 10;
      const y = Math.floor(Math.random() * (height - sliceHeight));
      const dx = (Math.random() - 0.5) * 30;

      const slice = outputCtx.getImageData(0, y, width, sliceHeight);
      outputCtx.putImageData(slice, dx, y);
    }
  }
}



let vhsGlitchTimer = 0;

function vhsFilter(inputCtx, outputCtx) {
  let width = canvas.width
  let height = canvas.height

  // 1. Base video draw from inputCtx
  outputCtx.drawImage(inputCtx.canvas, 0, 0, width, height);

  // 2. Horizontal scanlines
  outputCtx.save();
  outputCtx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
  outputCtx.lineWidth = 2;
  for (let y = 0; y < height; y += 4) {
    outputCtx.beginPath();
    outputCtx.moveTo(0, y + Math.random());
    outputCtx.lineTo(width, y + Math.random());
    outputCtx.stroke();
  }
  outputCtx.restore();

  // 3. Flickering noise
  const noiseDensity = 200;
  outputCtx.save();
  for (let i = 0; i < noiseDensity; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    outputCtx.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
    outputCtx.fillRect(x, y, 1, 1);
  }
  outputCtx.restore();

  // 4. Color smear (manual RGB shift)
  const smear = 2;
  outputCtx.save();
  outputCtx.globalCompositeOperation = "lighter";
  outputCtx.globalAlpha = 0.5;
  outputCtx.filter = "brightness(0.9)";

  // Red smear
  outputCtx.drawImage(inputCtx.canvas, smear, 0, width, height);
  // Blue smear
  outputCtx.drawImage(inputCtx.canvas, -smear, smear, width, height);

  outputCtx.restore();
  outputCtx.globalAlpha = 1;
  outputCtx.filter = "none";
  outputCtx.globalCompositeOperation = "source-over";

  // 5. Random glitch slice tear
  if (vhsGlitchTimer <= 0 && Math.random() < 0.03) {
    vhsGlitchTimer = 3 + Math.floor(Math.random() * 5);
  }
  if (vhsGlitchTimer > 0) {
    const sliceHeight = 5 + Math.random() * 10;
    const y = Math.floor(Math.random() * (height - sliceHeight));
    const dx = (Math.random() - 0.5) * 30;

    const slice = outputCtx.getImageData(0, y, width, sliceHeight);
    outputCtx.putImageData(slice, dx, y);
    vhsGlitchTimer--;
  }

  // 6. Subtle vertical wobble
  const wobble = Math.sin(performance.now() / 80);
  outputCtx.translate(0, wobble);
  outputCtx.setTransform(1, 0, 0, 1, 0, 0); // reset

  drawTrackingOverlay(outputCtx);
}

function drawTrackingOverlay(ctx) {
  if (Math.random() < 0.01) return;
  ctx.save();
  ctx.font = "bold 16px monospace";
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillText("TRACKING", 20, 20);
  ctx.restore();
}
  

function fireFilter(inputCtx, outputCtx) {
  const inputCanvas = inputCtx.canvas;
  const width = inputCanvas.width;
  const height = inputCanvas.height;

  // 1. Draw base
  const baseFrame = inputCtx.getImageData(0, 0, width, height);
  outputCtx.putImageData(baseFrame, 0, 0);

  // 2. Red/orange glow overlay
  outputCtx.save();
  outputCtx.globalCompositeOperation = "overlay";
  outputCtx.fillStyle = "rgba(255, 80, 0, 0.2)";
  outputCtx.fillRect(0, 0, width, height);
  outputCtx.restore();

  // 3. Heat distortion waves
  const strength = 0.3;
  const imageData = outputCtx.getImageData(0, 0, width, height);
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = width;
  tempCanvas.height = height;
  const tempCtx = tempCanvas.getContext("2d");
  tempCtx.putImageData(imageData, 0, 0);

  const waveAmount = 1.5;
  for (let y = 0; y < height; y++) {
    const offset = Math.sin((performance.now() / 100) + y * 0.1) * waveAmount;
    outputCtx.drawImage(
      tempCanvas,
      0, y, width, 1,
      offset, y, width, 1
    );
  }

  // 4. Ember particles
  emberParticles.forEach(p => {
    p.x += p.vx;
    p.y += p.vy;
    p.alpha -= 0.002;

    if (p.alpha <= 0 || p.y < 0 || p.x < 0 || p.x > width) {
      p.x = Math.random() * width;
      p.y = Math.random() * height;
      p.alpha = 0.3 + Math.random() * 0.4;
      p.size = 1.3 + Math.random() * 2;
      p.vx = (Math.random() - 0.5) * 0.3;
      p.vy = -0.2 - Math.random() * 0.4;
    }

    outputCtx.beginPath();
    outputCtx.fillStyle = `rgba(255, 60, 60, ${p.alpha})`;
    outputCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    outputCtx.fill();
  });

  // 5. Audio pulse glow
  analyser.getByteFrequencyData(frequencyData);
  const avg = frequencyData.reduce((a, b) => a + b, 0) / frequencyData.length;
  const pulse = avg / 256;

  if (pulse > 0.1) {
    outputCtx.save();
    outputCtx.globalAlpha = pulse * 0.3;
    outputCtx.fillStyle = 'rgba(255, 200, 50, 0.2)';
    outputCtx.fillRect(0, 0, width, height);
    outputCtx.restore();
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

function dreamWarpFilter(inputCtx, outputCtx) {
  analyser.getByteFrequencyData(frequencyData);
  const avg = frequencyData.reduce((a, b) => a + b, 0) / frequencyData.length;
  const pulse = avg / 256;
  const intensity = pulse * 5;

  dreamTime += 0.03 + intensity * 0.1;

  const width = inputCtx.canvas.width;
  const height = inputCtx.canvas.height;

  outputCtx.canvas.width = width;
  outputCtx.canvas.height = height;

  const source = inputCtx.getImageData(0, 0, width, height);
  const dest = outputCtx.createImageData(width, height);

  const srcData = source.data;
  const dstData = dest.data;

  const scaleBase = 1.0;
  const scaleAmplitude = 0.05;
  const scale = scaleBase + scaleAmplitude * Math.sin(pulse * Math.PI * 2);

  const centerX = width / 2;
  const centerY = height / 2;

  for (let y = 0; y < height; y++) {
    const yWaveOffset = Math.sin((y / 30) + dreamTime) * 10 * intensity;
    for (let x = 0; x < width; x++) {
      const xWaveOffset = Math.cos((x / 30) + dreamTime) * 10 * intensity;

      let warpedX = x + xWaveOffset;
      let warpedY = y + yWaveOffset;

      let dx = warpedX - centerX;
      let dy = warpedY - centerY;

      dx *= scale;
      dy *= scale;

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

  outputCtx.putImageData(dest, 0, 0);

  // Hue shimmer effect
  dreamHue = (dreamHue + 0.6 + intensity * 2) % 360;
  outputCtx.save();
  outputCtx.globalCompositeOperation = 'hue';
  outputCtx.fillStyle = `hsl(${dreamHue}, 100%, 50%)`;
  outputCtx.fillRect(0, 0, width, height);
  outputCtx.restore();
}

let shockwaveRadius = 0;
let shockwaveActive = false;
let shockwavePulseStrength = 0;

let shockwaves = []; // Each shockwave will have { radius, strength }

const volumeHistory = [];
const waveHistory = 15; // frames to keep
let lastShockwaveTime = 0;
const cooldown = 300; // milliseconds cooldown between shockwaves

function getRMS(data) {
  let sumSquares = 0;
  for (let i = 0; i < data.length; i++) {
    const val = data[i] / 255; // normalize 0-1
    sumSquares += val * val;
  }
  return Math.sqrt(sumSquares / data.length);
}

function triggerShockwave(s) {
    // your existing code
    if (shockwaves.length < 10) {
        shockwaves.push({ radius: 0, maxRadius: canvas.height, speed: 2 + s * 150, strength: s * 1.5 });
    }
}
  
let prevRMS = 0;

function checkForShockwave() {
  analyser.getByteFrequencyData(frequencyData);
  const rms = getRMS(frequencyData);

  const now = performance.now();

  const isSpike = rms > prevRMS && rms > 0.02;
  const cooldownPassed = (now - lastShockwaveTime) > cooldown;

  if (isSpike && cooldownPassed) {
    lastShockwaveTime = now;
    triggerShockwave(rms);
  }

  prevRMS = rms;
}

function shockwave(inputCtx, outputCtx) {
  checkForShockwave(); // still needed for triggering based on audio

  const width = inputCtx.canvas.width;
  const height = inputCtx.canvas.height;

  const source = inputCtx.getImageData(0, 0, width, height);
  const dest = outputCtx.createImageData(width, height);

  const srcData = source.data;
  const dstData = dest.data;

  const cx = width / 2;
  const cy = height / 2;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      let offsetX = 0;
      let offsetY = 0;

      for (let i = shockwaves.length - 1; i >= 0; i--) {
        const wave = shockwaves[i];
        const waveWidth = 20;
        const distanceFromWave = dist - wave.radius;

        if (Math.abs(distanceFromWave) < waveWidth * 3) {
          const ripple = Math.sin(distanceFromWave / waveWidth);
          const factor = ripple * 10 * wave.strength / (dist + 1);
          offsetX += dx * factor;
          offsetY += dy * factor;
        }
      }

      const srcX = Math.max(0, Math.min(width - 1, Math.floor(x + offsetX)));
      const srcY = Math.max(0, Math.min(height - 1, Math.floor(y + offsetY)));

      const dstIdx = (y * width + x) * 4;
      const srcIdx = (srcY * width + srcX) * 4;

      dstData[dstIdx] = srcData[srcIdx];
      dstData[dstIdx + 1] = srcData[srcIdx + 1];
      dstData[dstIdx + 2] = srcData[srcIdx + 2];
      dstData[dstIdx + 3] = 255;
    }
  }

  outputCtx.putImageData(dest, 0, 0);

  // Update shockwave positions
  for (let wave of shockwaves) {
    wave.radius += wave.speed;
  }

  // Remove finished shockwaves
  shockwaves = shockwaves.filter(w => w.radius < w.maxRadius);
}
  
function shake(inputCtx, outputCtx) {
  analyser.getByteTimeDomainData(timeDomainData);
  const currentTime = video.currentTime;
  let scale = 1, dx = 0, dy = 0;

  // Calculate RMS (root mean square) of the waveform
  let sumSquares = 0;
  for (let i = 0; i < timeDomainData.length; i++) {
    const norm = (timeDomainData[i] - 128) / 128;
    sumSquares += norm * norm;
  }
  const rms = Math.sqrt(sumSquares / timeDomainData.length);

  // Shake activation logic
  if (shakeEnabled && rms > shakeThreshold && !isShaking) {
    isShaking = true;
    shakeEndTime = currentTime + 0.2 * (rms - shakeThreshold) * 10;
    currentShakeIntensity = rms * 15;
  }

  if (isShaking && !video.paused) {
    const maxShake = currentShakeIntensity * 7;
    dx = (Math.random() - 0.5) * maxShake;
    dy = (Math.random() - 0.5) * maxShake;
    scale = 1 + Math.random() * 0.03;

    if (currentTime > shakeEndTime) {
      isShaking = false;
      currentShakeIntensity = 0;
    }
  }

  // Apply transformation and draw to outputCtx
  const { width, height } = inputCtx.canvas;

  outputCtx.save();
  const centerX = width / 2;
  const centerY = height / 2;

  outputCtx.translate(centerX + dx, centerY + dy);
  outputCtx.scale(scale, scale);
  outputCtx.translate(-centerX, -centerY);

  outputCtx.drawImage(inputCtx.canvas, 0, 0);
  outputCtx.restore();
}

function wobble(inputCtx, outputCtx) {
  // --- Wobble / Warp based on bass ---
  analyser.getByteFrequencyData(frequencyData);
  let bassSum = 0;
  for (let i = 0; i < 10; i++) bassSum += frequencyData[i];
  const bassAvg = bassSum / 10;

  bassHistory.push(bassAvg);
  if (bassHistory.length > historyLength) bassHistory.shift();

  const bassMean = bassHistory.reduce((a, b) => a + b, 0) / bassHistory.length;
  const delta = bassAvg - bassMean;

  if (wobbleEnabled && bassAvg > 130 && delta > 3) {
    const normalized = Math.min((bassAvg - 130) / 100, 1);
    warpIntensity = Math.max(warpIntensity, normalized ** 1.5);
  }

  warpIntensity *= 0.95;
  if (warpIntensity < 0.01) warpIntensity = 0;

  outputCtx.save();
  outputCtx.clearRect(0, 0, canvas.width, canvas.height);

  if (wobbleEnabled && warpIntensity > 0) {
    const t = performance.now() / 1000;
    const wobbleX = Math.sin(t * 20) * 0.08 * warpIntensity;
    const wobbleY = Math.cos(t * 15) * 0.08 * warpIntensity;
    const scale = 1 + 0.06 * warpIntensity;

    outputCtx.translate(canvas.width / 2, canvas.height / 2);
    outputCtx.scale(scale + wobbleX, scale + wobbleY);
    outputCtx.translate(-canvas.width / 2, -canvas.height / 2);
  }

  outputCtx.drawImage(inputCtx.canvas, 0, 0);
  outputCtx.restore();
}

function pulse(inputCtx, outputCtx) {
  analyser.getByteFrequencyData(frequencyData);
  const avgVolume = frequencyData.reduce((a, b) => a + b, 0) / frequencyData.length;
  const pulse = Math.min(avgVolume / 256, 1);
  const pulseScale = 1 + pulse * 0.6;

  outputCtx.save();
  outputCtx.clearRect(0, 0, canvas.width, canvas.height);

  outputCtx.translate(canvas.width / 2, canvas.height / 2);
  outputCtx.scale(pulseScale, pulseScale);
  outputCtx.translate(-canvas.width / 2, -canvas.height / 2);

  outputCtx.drawImage(inputCtx.canvas, 0, 0);

  outputCtx.restore();
}

const effectCanvases = [];
const effectContexts = [];

function ensureEffectCanvases(count) {
  while (effectCanvases.length < count) {
    const c = document.createElement('canvas');
    c.width = canvas.width;
    c.height = canvas.height;
    effectCanvases.push(c);
    effectContexts.push(c.getContext('2d'));
  }
  for (let c of effectCanvases) {
    c.width = canvas.width;
    c.height = canvas.height;
  }
}

function drawVideo() {
  // Build active effects list
  const activeEffects = [];

  if (filterMode !== 'none') {
    switch (filterMode) {
      case 'retroCamcorder': activeEffects.push(retroCamcorderFilter); break;
      case 'darkMetal': activeEffects.push(metalFilter); break;
      case 'glow80s': activeEffects.push(glowFilter); break;
      case 'psychedelicPulse': activeEffects.push(psychedelicFilter); break;
      case 'grunge': activeEffects.push(grungeFilter); break;
      case 'sepiaFilm': activeEffects.push(sepiaFilmFilter); break;
      case 'neon': activeEffects.push(neonFilter); break;
      case 'glitch': activeEffects.push(glitchFilter); break;
      case 'vhs': activeEffects.push(vhsFilter); break;
      case 'fire': activeEffects.push(fireFilter); break;
      case 'dream': activeEffects.push(dreamWarpFilter); break;
    }
  }

  if (shakeEnabled) activeEffects.push(shake);
  if (wobbleEnabled) activeEffects.push(wobble);
  if (pulseEnabled) activeEffects.push(pulse);
  if (shockwaveEnabled) activeEffects.push(shockwave);

  // Prepare canvases, one more than number of effects
  ensureEffectCanvases(activeEffects.length + 1);

  // Start pipeline: draw raw video frame to first canvas
  effectContexts[0].drawImage(video, 0, 0, canvas.width, canvas.height);

  // Run effects chain
  for (let i = 0; i < activeEffects.length; i++) {
    activeEffects[i](effectContexts[i], effectContexts[i + 1]);
  }

  // Draw final output to main canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (activeEffects.length > 0) {
    ctx.drawImage(effectCanvases[activeEffects.length], 0, 0);
  } else {
    // No effects active, just draw video directly
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  }
} 

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    frameCount = (frameCount || 0) + 1;

    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // --- Apply camera transforms for shake ---
    ctx.save();
    drawVideo();
    ctx.restore();

    // --- Visualizers (overlays) ---
    switch (currentMode) {
        case 'waveform': drawWaveform(); break;
        case 'bars': drawFrequencyBars(); break;
        case 'radial1': drawRadialVisualizer1(); break;
        case 'eq1': drawEQBarsVisualizer1(); break;
        case 'eq2': drawEQBarsVisualizer2(); break;
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
    const waveformY = canvas.height / 2 + visualizerYOffset; 

    if (colorShiftEnabled && !video.paused && isShaking) {
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
    const barHeightMultiplier = 0.7;
  
    ctx.save();

    if (colorShiftEnabled && !video.paused && isShaking) {
        const shakeBoost = currentShakeIntensity * 5; // more shake = more color shift
        h = (h + shakeBoost) % 360;
    }
  
    for (let i = 0; i < totalBars; i++) {
      const value = frequencyData[i];
      const barHeight = value * barHeightMultiplier;
      const x = i * (barWidth + gap);
      const y = canvas.height - barHeight + visualizerYOffset;
  
      ctx.fillStyle = `hsla(${h}, ${baseS}%, ${baseL}%, 0.8)`;
      ctx.shadowColor = `hsla(${h}, ${baseS}%, ${baseL}%, 0.8)`;
      ctx.shadowBlur = 30;
  
      ctx.fillRect(x, y, barWidth, barHeight);
    }
  
    ctx.restore();
}

function drawRadialVisualizer1() {
    analyser.getByteFrequencyData(frequencyData);
    
    const centerX = canvas.width / 2 + visualizerXOffset;
    const centerY = canvas.height / 2 + visualizerYOffset;
    const radius = 40;
    const barCount = 200;
    const barWidth = 2;
    const barHeightMultiplier = 0.3;
  
    const angleStep = (Math.PI * 2) / barCount;

    if (colorShiftEnabled && !video.paused && isShaking) {
        const shakeBoost = currentShakeIntensity * 5; // more shake = more color shift
        h = (h + shakeBoost) % 360;
    }
  
    ctx.save();
    ctx.translate(centerX, centerY);
  
    for (let i = 0; i < barCount; i++) {
      const value = frequencyData[Math.floor(i / 2)];
      let barHeight = value * barHeightMultiplier;

      const angle = i * angleStep;
  
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
  
      const xEnd = Math.cos(angle) * (radius + barHeight);
      const yEnd = Math.sin(angle) * (radius + barHeight);
  
      ctx.strokeStyle = `hsla(${h}, ${baseS}%, ${baseL}%, 0.8)`;
      ctx.shadowColor = `hsla(${h}, ${baseS}%, ${baseL}%, 0.8)`;
      ctx.lineWidth = barWidth;
      ctx.shadowBlur = 10;
  
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(xEnd, yEnd);
      ctx.stroke();
    }
  
    ctx.restore();
}  

function drawEQBarsVisualizer2() {
  analyser.getByteFrequencyData(frequencyData);

  const barCount = 2 // Adjust based on canvas width
  const barSpacing = 4;
  const barWidth = 20

  const segmentHeight = 8; // Height of each block segment
  const segmentSpacing = 2;
  const maxSegments = Math.floor(canvas.height / (segmentHeight + segmentSpacing) / 3);

  ctx.save();

  let dataCount = frequencyData.length
  let step = Math.floor(dataCount / 4 / barCount)

  for (let i = 0; i < barCount; i++) {
    const value = frequencyData[i * step];
    const normalizedValue = value / 255;
    const segmentCount = Math.floor(normalizedValue * maxSegments);

    const x = i * (barWidth + barSpacing);

    for (let j = 0; j < segmentCount; j++) {
      const y = canvas.height - (j + 1) * (segmentHeight + segmentSpacing);

      ctx.fillStyle = `hsla(${h}, ${baseS}%, ${baseL}%, 0.85)`;
      ctx.shadowColor = `hsla(${h}, ${baseS}%, ${baseL}%, 0.4)`;
      ctx.shadowBlur = 10;

      ctx.fillRect(x, y, barWidth, segmentHeight);
    }
  }

  ctx.restore();

}

function drawEQBarsVisualizer1() {
  analyser.getByteFrequencyData(frequencyData);

  const barCount = Math.floor(canvas.width / 25); // Adjust based on canvas width
  const barSpacing = 4;
  const barWidth = (canvas.width - ((barCount - 1) * barSpacing)) / barCount

  const segmentHeight = 8; // Height of each block segment
  const segmentSpacing = 2;
  const maxSegments = Math.floor(canvas.height / (segmentHeight + segmentSpacing) / 3);

  ctx.save();

  let dataCount = frequencyData.length
  let step = Math.floor(dataCount / 2 / barCount)

  for (let i = 0; i < barCount; i++) {
    const value = frequencyData[i * step];
    const normalizedValue = value / 255;
    const segmentCount = Math.floor(normalizedValue * maxSegments);

    const x = i * (barWidth + barSpacing);

    for (let j = 0; j < segmentCount; j++) {
      const y = canvas.height - (j + 1) * (segmentHeight + segmentSpacing);

      let segmentHue = h + Math.floor(Math.floor(j / 2) * 10) % 360

      if (colorShiftEnabled && !video.paused && isShaking) {
        const shakeBoost = currentShakeIntensity * 5;
        segmentHue = (segmentHue + shakeBoost) % 360;
      }

      ctx.fillStyle = `hsla(${segmentHue}, ${baseS}%, ${baseL}%, 0.85)`;
      ctx.shadowColor = `hsla(${segmentHue}, ${baseS}%, ${baseL}%, 0.4)`;
      ctx.shadowBlur = 10;

      ctx.fillRect(x, y, barWidth, segmentHeight);
    }
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

function shareSite() {
  navigator.clipboard.writeText(window.location.href)
      .then(() => alert("Link copied bruh"))
      .catch(err => alert("Failed to copy"));
}
