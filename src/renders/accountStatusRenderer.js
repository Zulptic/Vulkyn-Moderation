import { createCanvas, loadImage } from '@napi-rs/canvas';

const W = 680;
const H = 200;
const PAD = 24;
const LEFT_W = 6;
const AV = 64;
const BAR_H = 6;

function accentColor(pct) {
    if (pct === 0) return '#b5bac1';
    if (pct < 0.34) return '#57f287';
    if (pct < 0.67) return '#fee75c';
    return '#ed4245';
}

export async function render({ username, avatarURL, score, threshold, thresholdAction, lastInfraction }) {
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    const pct = threshold ? Math.min(score / threshold, 1) : 0;
    const accent = accentColor(pct);

    // Background layers
    ctx.fillStyle = '#1e1f22';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#2b2d31';
    ctx.fillRect(LEFT_W, 0, W - LEFT_W, H);
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, LEFT_W, H);

    // Avatar
    const ax = LEFT_W + PAD;
    const ay = PAD;
    try {
        const img = await loadImage(avatarURL);
        ctx.save();
        ctx.beginPath();
        ctx.arc(ax + AV / 2, ay + AV / 2, AV / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(img, ax, ay, AV, AV);
        ctx.restore();
    } catch {
        ctx.fillStyle = '#4e5058';
        ctx.beginPath();
        ctx.arc(ax + AV / 2, ay + AV / 2, AV / 2, 0, Math.PI * 2);
        ctx.fill();
    }

    // Header text
    const nx = ax + AV + 14;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(username, nx, ay + 28);
    ctx.fillStyle = '#b5bac1';
    ctx.font = '13px sans-serif';
    ctx.fillText('Member Score Card', nx, ay + 50);
    ctx.fillStyle = accent;
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('ACCOUNT STATUS', W - PAD, ay + 22);
    ctx.textAlign = 'left';

    // Separator 1
    const s1 = ay + AV + 12;
    ctx.fillStyle = '#3b3d43';
    ctx.fillRect(LEFT_W + PAD, s1, W - PAD * 2 - LEFT_W, 1);

    // Score row
    const scoreY = s1 + 16;
    ctx.fillStyle = '#b5bac1';
    ctx.font = '11px sans-serif';
    ctx.fillText('SCORE PROGRESS', LEFT_W + PAD, scoreY);
    const scoreLabel = threshold != null ? `${score} / ${threshold} pts` : `${score} pts`;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(scoreLabel, W - PAD, scoreY);
    ctx.textAlign = 'left';

    // Progress bar
    const barX = LEFT_W + PAD;
    const barW = W - PAD * 2 - LEFT_W;
    const barY = scoreY + 10;
    ctx.fillStyle = '#3b3d43';
    ctx.fillRect(barX, barY, barW, BAR_H);
    if (pct > 0) {
        const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
        grad.addColorStop(0, '#57f287');
        grad.addColorStop(0.5, '#fee75c');
        grad.addColorStop(1, '#ed4245');
        ctx.fillStyle = grad;
        ctx.fillRect(barX, barY, barW * pct, BAR_H);
    }

    // Separator 2
    const s2 = barY + BAR_H + 18;
    ctx.fillStyle = '#3b3d43';
    ctx.fillRect(LEFT_W + PAD, s2, W - PAD * 2 - LEFT_W, 1);

    // Footer
    const fY = s2 + 22;
    ctx.fillStyle = '#b5bac1';
    ctx.font = '13px sans-serif';
    const cap = (s) => s ? s[0].toUpperCase() + s.slice(1) : '—';
    ctx.fillText(`Threshold Action: ${cap(thresholdAction)}`, LEFT_W + PAD, fY);
    const lastDate = lastInfraction
        ? new Date(lastInfraction).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : 'N/A';
    ctx.textAlign = 'right';
    ctx.fillText(`Last Infraction: ${lastDate}`, W - PAD, fY);
    ctx.textAlign = 'left';

    return canvas.toBuffer('image/png');
}
