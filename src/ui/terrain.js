export function mountTerrain(canvas, grid, label) {
  const ctx = canvas.getContext('2d');
  const { n, heights, spacing } = grid;
  const base = (Math.min(...heights) + Math.max(...heights)) / 2;
  const extent = (n - 1) * spacing;
  const relief = Math.max(...heights) - Math.min(...heights);
  let angle = .35;
  let exaggeration = 1;
  let lastX = null;

  function draw() {
    const scale = Math.min(480 / extent, 280 / (extent * .65 + relief * exaggeration));
    const cosine = Math.cos(angle), sine = Math.sin(angle);
    const vertices = heights.map((height, index) => {
      const east = (index % n - (n - 1) / 2) * spacing;
      const north = (Math.floor(index / n) - (n - 1) / 2) * spacing;
      const u = east * cosine - north * sine;
      const v = east * sine + north * cosine;
      return { x: 450 + u * scale, y: 265 + v * scale * .48 - (height - base) * scale * exaggeration, depth: v, height };
    });
    const faces = [];
    for (let row = 0; row < n - 1; row++) for (let column = 0; column < n - 1; column++) {
      const a = row * n + column, b = a + 1, c = a + n, d = c + 1;
      faces.push([a, b, d], [a, d, c]);
    }
    faces.sort((a, b) => a.reduce((v, i) => v + vertices[i].depth, 0) - b.reduce((v, i) => v + vertices[i].depth, 0));
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#07121e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const face of faces) {
      const [a, b, c] = face.map(index => vertices[index]);
      const grade = (b.height - a.height) * .7 + (c.height - a.height) * .4;
      const shade = Math.max(45, Math.min(200, 136 - grade / spacing * 105));
      ctx.fillStyle = `rgb(${Math.round(shade * .88)},${Math.round(shade * .96)},${Math.round(shade)})`;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.closePath();
      ctx.fill();
    }
    const center = vertices[Math.floor(vertices.length / 2)];
    ctx.fillStyle = '#ffd273';
    ctx.beginPath();
    ctx.arc(center.x, center.y, 5, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = '#f2f6f9';
    ctx.font = '14px system-ui';
    ctx.fillText(label, center.x + 10, center.y - 10);
  }

  canvas.addEventListener('pointerdown', event => { lastX = event.clientX; canvas.setPointerCapture(event.pointerId); });
  canvas.addEventListener('pointermove', event => {
    if (lastX === null) return;
    angle += (event.clientX - lastX) * .008;
    lastX = event.clientX;
    draw();
  });
  canvas.addEventListener('lostpointercapture', () => { lastX = null; });
  draw();
  return { setExaggeration(value) { exaggeration = value; draw(); } };
}
