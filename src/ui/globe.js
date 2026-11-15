import { sites } from '../data/sites.js';

const radians = Math.PI / 180;

export function createGlobe(canvas, onChange) {
  const context = canvas.getContext('2d');
  const width = canvas.width;
  const radius = width * .485;
  const disk = [];
  for (let py = 0; py < width; py++) {
    for (let px = 0; px < width; px++) {
      const east = (px - width / 2) / radius;
      const north = (width / 2 - py) / radius;
      const depthSquared = 1 - east * east - north * north;
      if (depthSquared >= 0) disk.push([4 * (py * width + px), east, north, Math.sqrt(depthSquared)]);
    }
  }
  const output = context.createImageData(width, width);
  let texture = null;
  let textureWidth = 0;
  let textureHeight = 0;
  let normalPixels = null;
  let normalWidth = 0;
  let normalHeight = 0;
  let latitude = -1.52;
  let longitude = 0;
  let previous = null;
  let queued = false;

  function markerLocation(site) {
    const location = sites[site];
    const phi = location.latitude * radians;
    const delta = location.longitude * radians - longitude;
    const east = Math.cos(phi) * Math.sin(delta);
    const north = Math.sin(phi) * Math.cos(latitude) - Math.cos(phi) * Math.cos(delta) * Math.sin(latitude);
    const forward = Math.sin(phi) * Math.sin(latitude) + Math.cos(phi) * Math.cos(delta) * Math.cos(latitude);
    return { left: `${50 + east * 48.5}%`, top: `${50 - north * 48.5}%`, visible: forward > 0 };
  }

  function skyDirection(site, azimuth, elevation) {
    const location = sites[site];
    const phi = location.latitude * radians;
    const delta = location.longitude * radians - longitude;
    const az = azimuth * radians;
    const alt = elevation * radians;
    const up = [Math.cos(phi) * Math.cos(delta), Math.cos(phi) * Math.sin(delta), Math.sin(phi)];
    const north = [-Math.sin(phi) * Math.cos(delta), -Math.sin(phi) * Math.sin(delta), Math.cos(phi)];
    const east = [-Math.sin(delta), Math.cos(delta), 0];
    const unit = up.map((value, index) => value * Math.sin(alt) + (north[index] * Math.cos(az) + east[index] * Math.sin(az)) * Math.cos(alt));
    return { east: unit[1], north: unit[2] * Math.cos(latitude) - unit[0] * Math.sin(latitude) };
  }

  function draw() {
    queued = false;
    if (!texture) return;
    const cosLat = Math.cos(latitude);
    const sinLat = Math.sin(latitude);
    const lightX = .31 * cosLat - .66 * sinLat;
    const lightY = .31 * sinLat + .66 * cosLat;
    for (const [pixel, east, north, depth] of disk) {
      const horizontal = depth * cosLat - north * sinLat;
      const vertical = depth * sinLat + north * cosLat;
      const meridian = Math.atan2(east, horizontal) + longitude;
      const column = Math.floor((((meridian / (2 * Math.PI) + 1.5) % 1) + 1) % 1 * textureWidth);
      const row = Math.min(textureHeight - 1, Math.floor((.5 - Math.asin(Math.max(-1, Math.min(1, vertical))) / Math.PI) * textureHeight));
      const source = 4 * (row * textureWidth + column);
      let normalLight = .31 * depth + .45 * east + .66 * north;
      if (normalPixels) {
        const nx = Math.min(normalWidth - 1, Math.floor(column * normalWidth / textureWidth));
        const ny = Math.min(normalHeight - 1, Math.floor(row * normalHeight / textureHeight));
        const reliefPixel = 4 * (ny * normalWidth + nx);
        const slopeEast = (normalPixels[reliefPixel] - 127.5) / 127.5;
        const slopeNorth = (normalPixels[reliefPixel + 1] - 127.5) / 127.5;
        const localLongitude = Math.atan2(east, horizontal);
        const localLatitude = Math.asin(Math.max(-1, Math.min(1, vertical)));
        const alongEast = .45 * Math.cos(localLongitude) - lightX * Math.sin(localLongitude);
        const alongNorth = lightY * Math.cos(localLatitude) - Math.sin(localLatitude) * (lightX * Math.cos(localLongitude) + .45 * Math.sin(localLongitude));
        const strength = 2.5;
        normalLight = (normalLight - strength * (slopeEast * alongEast + slopeNorth * alongNorth)) / Math.sqrt(1 + strength * strength * (slopeEast * slopeEast + slopeNorth * slopeNorth));
      }
      const lighting = .07 + 1.19 * Math.pow(Math.max(0, normalLight), .64);
      output.data[pixel] = texture[source] * lighting;
      output.data[pixel + 1] = texture[source + 1] * lighting;
      output.data[pixel + 2] = texture[source + 2] * lighting;
      output.data[pixel + 3] = Math.min(255, depth * depth * radius * 255);
    }
    context.clearRect(0, 0, width, width);
    context.putImageData(output, 0, 0);
    onChange(markerLocation);
  }

  function requestDraw() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(draw);
  }

  const image = new Image();
  image.onload = () => {
    const buffer = document.createElement('canvas');
    textureWidth = buffer.width = image.naturalWidth;
    textureHeight = buffer.height = image.naturalHeight;
    const pixels = buffer.getContext('2d');
    pixels.drawImage(image, 0, 0);
    texture = pixels.getImageData(0, 0, textureWidth, textureHeight).data;
    requestDraw();
  };
  image.onerror = () => { canvas.setAttribute('aria-label', 'Moon image could not be loaded.'); };
  image.src = 'moon.webp';

  const normals = new Image();
  normals.onload = () => {
    const buffer = document.createElement('canvas');
    normalWidth = buffer.width = normals.naturalWidth;
    normalHeight = buffer.height = normals.naturalHeight;
    const pixels = buffer.getContext('2d');
    pixels.drawImage(normals, 0, 0);
    normalPixels = pixels.getImageData(0, 0, normalWidth, normalHeight).data;
    requestDraw();
  };
  normals.src = 'relief.webp';

  canvas.addEventListener('pointerdown', event => {
    previous = [event.clientX, event.clientY];
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', event => {
    if (!previous) return;
    longitude += (previous[0] - event.clientX) * .007;
    latitude = Math.max(-1.55, Math.min(1.55, latitude + (event.clientY - previous[1]) * .007));
    previous = [event.clientX, event.clientY];
    canvas.parentElement.querySelector('.globe-grid').setAttribute('hidden', '');
    requestDraw();
  });
  canvas.addEventListener('lostpointercapture', () => { previous = null; });

  return {
    reset() { latitude = -1.52; longitude = 0; canvas.parentElement.querySelector('.globe-grid').removeAttribute('hidden'); requestDraw(); },
    markerLocation,
    skyDirection,
  };
}
