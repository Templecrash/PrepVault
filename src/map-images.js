export const MAX_MAP_IMAGE_LENGTH = 2_000_000;
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export function imageSize(width, height, maxEdge = 1800) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error('This image has invalid dimensions.');
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function pointOnMap(clientX, clientY, rect) {
  if (!rect.width || !rect.height) return null;
  return {
    x: Math.max(0, Math.min(100, (clientX - rect.left) / rect.width * 100)),
    y: Math.max(0, Math.min(100, (clientY - rect.top) / rect.height * 100)),
  };
}

export function normalizeCrop(a, b) {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('This image could not be opened. Try a PNG, JPEG or WebP file.'));
    image.src = src;
  });
}

export async function prepareMapImage(file) {
  if (!file || !IMAGE_TYPES.includes(file.type)) throw new Error('Choose a PNG, JPEG or WebP image.');
  if (file.size > 20_000_000) throw new Error('Choose an image smaller than 20 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    return imageToData(image);
  } finally { URL.revokeObjectURL(url); }
}

export function imageToData(image, crop) {
  const naturalWidth = image.naturalWidth || image.videoWidth || image.width;
  const naturalHeight = image.naturalHeight || image.videoHeight || image.height;
  const area = crop || { x: 0, y: 0, width: 100, height: 100 };
  if (![area.x, area.y, area.width, area.height].every(Number.isFinite) || area.x < 0 || area.y < 0 || area.width <= 0 || area.height <= 0 || area.x + area.width > 100 || area.y + area.height > 100) throw new Error('Select a crop inside the map image.');
  const sourceWidth = naturalWidth * area.width / 100;
  const sourceHeight = naturalHeight * area.height / 100;
  if (sourceWidth < 80 || sourceHeight < 80) throw new Error('Select a larger map area (at least 80 × 80 pixels).');
  const size = imageSize(sourceWidth, sourceHeight);
  const canvas = document.createElement('canvas');
  canvas.width = size.width; canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Your browser could not prepare this map image.');
  context.fillStyle = '#fff'; context.fillRect(0, 0, size.width, size.height);
  context.drawImage(image, naturalWidth * area.x / 100, naturalHeight * area.y / 100, sourceWidth, sourceHeight, 0, 0, size.width, size.height);
  let dataUrl = canvas.toDataURL('image/jpeg', 0.9);
  for (const quality of [0.8, 0.65, 0.5]) {
    if (dataUrl.length <= MAX_MAP_IMAGE_LENGTH) break;
    dataUrl = canvas.toDataURL('image/jpeg', quality);
  }
  if (dataUrl.length > MAX_MAP_IMAGE_LENGTH) throw new Error('This map is too detailed to save on this device. Choose a smaller image.');
  return { dataUrl, ...size };
}

export async function captureMapWindow() {
  if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('Screen capture is not available in this browser. Take a screenshot and choose the image instead.');
  let stream;
  let video;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 1 }, audio: false });
    video = document.createElement('video');
    video.muted = true; video.srcObject = stream;
    await video.play();
    if (video.readyState < 2) await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('The screen capture did not load. Try choosing an image instead.')), 8000);
      video.onloadeddata = () => { clearTimeout(timer); resolve(); };
    });
    return imageToData(video);
  } catch (error) {
    if (error.name === 'NotAllowedError' || error.name === 'AbortError') throw new Error('Capture was cancelled. You can try again or choose a screenshot.');
    throw error;
  } finally {
    stream?.getTracks().forEach(track => track.stop());
    if (video) { video.pause(); video.srcObject = null; }
  }
}
