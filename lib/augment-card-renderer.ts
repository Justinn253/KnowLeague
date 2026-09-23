import {
  AUGMENT_STAT_ICONS,
  parseAugmentText,
  resolveAugmentIconId,
  type AugmentDraft,
  type AugmentTextRun,
} from '@/lib/augment-builder';

export const AUGMENT_CARD_WIDTH = 624;
export const AUGMENT_CARD_HEIGHT = 1024;
const images = new Map<string, Promise<HTMLImageElement>>();
let fonts: Promise<unknown> | undefined;
function loadImage(src: string) {
  if (!images.has(src))
    images.set(
      src,
      new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => {
          images.delete(src);
          reject(new Error('Unable to load card artwork. Please retry.'));
        };
        image.src = src;
      }),
    );
  return images.get(src)!;
}
function loadFonts() {
  if (!fonts)
    fonts = Promise.all([
      new FontFace('AugmentTitle', 'url(/augments/beaufortforlol-bold.otf)').load(),
      new FontFace('AugmentBody', 'url(/augments/spiegel-regular.otf)').load(),
    ])
      .then((loaded) => loaded.forEach((font) => document.fonts.add(font)))
      .catch((error) => {
        fonts = undefined;
        throw error;
      });
  return fonts;
}
type Line = Array<AugmentTextRun & { width: number }>;
function layout(context: CanvasRenderingContext2D, runs: AugmentTextRun[], size: number, title = false): Line[] {
  const lines: Line[] = [[]];
  let width = 0;
  for (const run of runs) {
    context.font = `${run.bold ? 'bold ' : ''}${size}px ${title ? 'AugmentTitle' : 'AugmentBody'}, serif`;
    if (run.icon) {
      if (width + size > 476) {
        lines.push([]);
        width = 0;
      }
      lines[lines.length - 1].push({ ...run, width: size });
      width += size;
      continue;
    }
    for (const word of run.text.split(/(\n|[^\S\n]+)/).filter(Boolean)) {
      if (word === '\n') {
        lines.push([]);
        width = 0;
        continue;
      }
      const measured = context.measureText(word).width;
      if (width + measured > 476 && width > 0) {
        lines.push([]);
        width = 0;
      }
      if (!width && !word.trim()) continue;
      // Split long unbroken input as well as ordinary words.
      if (measured > 476) {
        for (const character of Array.from(word)) {
          const characterWidth = context.measureText(character).width;
          if (width + characterWidth > 476) {
            lines.push([]);
            width = 0;
          }
          lines[lines.length - 1].push({ ...run, text: character, width: characterWidth });
          width += characterWidth;
        }
      } else {
        lines[lines.length - 1].push({ ...run, text: word, width: measured });
        width += measured;
      }
    }
  }
  return lines;
}
function drawText(
  context: CanvasRenderingContext2D,
  runs: AugmentTextRun[],
  y: number,
  maxHeight: number,
  initialSize: number,
  title = false,
  atlas?: HTMLImageElement,
) {
  let size = initialSize;
  let lines = layout(context, runs, size, title);
  while (lines.length * size * 1.3 > maxHeight && size > 16) lines = layout(context, runs, --size, title);
  context.textBaseline = 'alphabetic';
  for (const line of lines) {
    context.font = `${size}px ${title ? 'AugmentTitle' : 'AugmentBody'}, serif`;
    const metrics = context.measureText('Mg');
    // Center the visible text and sprite boxes on the same line axis.
    const baseline = y + size / 2 + (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2;
    let x = (AUGMENT_CARD_WIDTH - line.reduce((sum, run) => sum + run.width, 0)) / 2;
    for (const run of line) {
      context.font = `${run.bold ? 'bold ' : ''}${size}px ${title ? 'AugmentTitle' : 'AugmentBody'}, serif`;
      context.fillStyle = run.color;
      if (run.icon && atlas) {
        const uv = AUGMENT_STAT_ICONS[run.icon];
        context.drawImage(
          atlas,
          uv.startX * atlas.width,
          uv.startY * atlas.height,
          (uv.endX - uv.startX) * atlas.width,
          (uv.endY - uv.startY) * atlas.height,
          x,
          y,
          size,
          size,
        );
      } else context.fillText(run.text, x, baseline);
      x += run.width;
    }
    y += size * 1.3;
  }
  return y;
}

export async function renderAugmentCard(canvas: HTMLCanvasElement, draft: AugmentDraft, blank = false) {
  const [, frame, background, icon, statAtlas] = await Promise.all([
    loadFonts(),
    loadImage(`/augments/augmentcard_frame_${draft.rarity}.png`),
    loadImage('/augments/augmentcard_bg.png'),
    blank || !draft.icon ? Promise.resolve(null) : loadImage(`/augments/icons/${resolveAugmentIconId(draft.icon)}.png`),
    loadImage('/augments/stat-icons.png'),
  ]);
  canvas.width = AUGMENT_CARD_WIDTH;
  canvas.height = AUGMENT_CARD_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Image rendering is unavailable in this browser.');
  context.clearRect(0, 0, canvas.width, canvas.height);
  // Original textures are 512-square UV atlases; the card occupies x=100..412.
  // Clip the atlas to the rounded outer silhouette and reconstruct the inset face.
  context.save();
  context.beginPath();
  context.roundRect(0, 0, 624, 1024, 48);
  context.clip();
  context.drawImage(frame, 100, 0, 312, 512, 0, 0, 624, 1024);
  const face = new Path2D(
    'M 60 116 L 116 56 L 220 56 L 232 44 L 392 44 L 404 56 L 508 56 L 564 116 L 564 302 L 576 320 L 576 704 L 564 722 L 564 908 L 508 968 L 404 968 L 392 980 L 232 980 L 220 968 L 116 968 L 60 908 L 60 722 L 48 704 L 48 320 L 60 302 Z',
  );
  context.save();
  context.clip(face);
  context.drawImage(background, 100, 0, 312, 512, 0, 0, 624, 1024);
  context.restore();
  context.strokeStyle = draft.rarity === 'prismatic' ? '#857899' : draft.rarity === 'gold' ? '#594c3b' : '#555d60';
  context.lineWidth = 7;
  context.stroke(face);
  context.restore();
  if (blank) return;
  if (icon) context.drawImage(icon, 174, 108, 276, 276);
  context.textBaseline = 'top';
  const titleBottom = drawText(context, [{ text: draft.name || 'Your augment', color: '#fffdf3' }], 414, 152, 66, true);
  context.save();
  context.beginPath();
  context.rect(70, titleBottom + 30, 484, 930 - titleBottom - 30);
  context.clip();
  drawText(
    context,
    parseAugmentText(draft.description || 'Enter a description.'),
    titleBottom + 30,
    900 - titleBottom,
    38,
    false,
    statAtlas,
  );
  context.restore();
}

export async function augmentPng(draft: AugmentDraft) {
  const canvas = document.createElement('canvas');
  await renderAugmentCard(canvas, draft);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Unable to export this image.'))), 'image/png'),
  );
}
