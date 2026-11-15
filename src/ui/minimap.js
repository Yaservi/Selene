import { sites } from '../data/sites.js';

export function renderMinimap(mini, globe, project, comparison, selected) {
  const context = mini.getContext('2d');
  const size = mini.width;
  context.clearRect(0, 0, size, size);
  context.drawImage(globe, 0, 0, size, size);

  for (const [index] of sites.entries()) {
    const location = project(index);
    if (!location.visible) continue;
    const x = Number.parseFloat(location.left) * size / 100;
    const y = Number.parseFloat(location.top) * size / 100;
    const active = index === selected;
    const compared = comparison.includes(index);
    context.beginPath();
    context.arc(x, y, active ? 6 : compared ? 4.5 : 3, 0, Math.PI * 2);
    context.fillStyle = active ? '#ffd36f' : compared ? '#fae0a2' : '#42d6e7';
    context.fill();
    context.strokeStyle = '#071623';
    context.lineWidth = 1.5;
    context.stroke();
    if (active) {
      context.beginPath();
      context.arc(x, y, 9, 0, Math.PI * 2);
      context.strokeStyle = '#ffd36f';
      context.lineWidth = 1.25;
      context.stroke();
    }
  }
}
