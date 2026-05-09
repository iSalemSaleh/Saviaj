import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), 'android/app/src/main/res');
const SRC_LOGO = path.resolve(process.cwd(), 'resources/icon.png');
const TEAL = { r: 0x0d, g: 0x73, b: 0x77, alpha: 1 };

const ICON_SIZES = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
};

const SPLASH_SIZES = {
  'drawable-ldpi':       [200, 320],
  'drawable-mdpi':       [320, 480],
  'drawable-hdpi':       [480, 800],
  'drawable-xhdpi':      [720, 1280],
  'drawable-xxhdpi':     [960, 1600],
  'drawable-xxxhdpi':    [1280, 1920],
  'drawable-land-ldpi':  [320, 200],
  'drawable-land-mdpi':  [480, 320],
  'drawable-land-hdpi':  [800, 480],
  'drawable-land-xhdpi': [1280, 720],
  'drawable-land-xxhdpi':[1600, 960],
  'drawable-land-xxxhdpi':[1920, 1280],
};

async function buildSquareIcon(size) {
  const bg = sharp({
    create: { width: size, height: size, channels: 4, background: TEAL },
  }).png();

  const inner = Math.round(size * 0.78);
  const logoBuf = await sharp(SRC_LOGO)
    .resize({ width: inner, height: inner, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  return bg.composite([{ input: logoBuf, gravity: 'center' }]).png().toBuffer();
}

async function buildRoundIcon(size) {
  const square = await buildSquareIcon(size);
  const r = size / 2;
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${r}" cy="${r}" r="${r}" fill="white"/></svg>`
  );
  return sharp(square)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

async function buildSplash(width, height) {
  const bg = sharp({
    create: { width, height, channels: 4, background: TEAL },
  });

  const minDim = Math.min(width, height);
  const logoSize = Math.round(minDim * 0.40);
  const logoBuf = await sharp(SRC_LOGO)
    .resize({ width: logoSize, height: logoSize, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const tagline = 'Community-Driven Rides';
  const fontSize = Math.round(minDim * 0.045);
  const taglineSvg = Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <style>
        .t { fill: rgba(255,255,255,0.85); font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; font-size: ${fontSize}px; font-weight: 500; letter-spacing: 0.5px; }
      </style>
      <text x="50%" y="${Math.round(height / 2 + logoSize / 2 + fontSize * 1.6)}" text-anchor="middle" class="t">${tagline}</text>
    </svg>`
  );

  return bg
    .composite([
      { input: logoBuf, gravity: 'center' },
      { input: taglineSvg, top: 0, left: 0 },
    ])
    .png()
    .toBuffer();
}

async function main() {
  for (const [folder, size] of Object.entries(ICON_SIZES)) {
    const dir = path.join(ROOT, folder);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'ic_launcher.png'), await buildSquareIcon(size));
    await writeFile(path.join(dir, 'ic_launcher_round.png'), await buildRoundIcon(size));
    await writeFile(path.join(dir, 'ic_launcher_foreground.png'), await buildSquareIcon(size));
    console.log(`icons: ${folder} ${size}x${size}`);
  }

  for (const [folder, [w, h]] of Object.entries(SPLASH_SIZES)) {
    const dir = path.join(ROOT, folder);
    await mkdir(dir, { recursive: true });
    const splash = await buildSplash(w, h);
    await writeFile(path.join(dir, 'splash.png'), splash);
    const nightFolder = folder.replace('drawable-', 'drawable-').replace(/^drawable-(land-)?/, 'drawable-$1night-');
    const nightDir = path.join(ROOT, nightFolder);
    await mkdir(nightDir, { recursive: true });
    await writeFile(path.join(nightDir, 'splash.png'), splash);
    console.log(`splash: ${folder} ${w}x${h}`);
  }

  console.log('\nDone. Run `npx cap sync android` next (requires Node >= 22).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
