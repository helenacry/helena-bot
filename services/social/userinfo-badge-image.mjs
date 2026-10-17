import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getUserBadgeImages } from './userinfo-badges.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BADGES_DIR = path.join(ROOT, 'assets', 'badges');
const OUTPUT_DIR = path.resolve(process.env.BADGE_OUTPUT_DIR || path.join(ROOT, 'public', 'userinfo-badges'));
const ICON_SIZE = 52;
const GAP = 12;
const PADDING = 18;
const MAX_COLUMNS = 9;
const pending = new Map();

function publicBaseUrl() {
  const raw = (process.env.BADGE_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  if (!raw) return null;
  let url;
  try { url = new URL(raw); } catch { throw new Error(`BADGE_PUBLIC_BASE_URL inválida: ${raw}`); }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.search || url.hash) {
    throw new Error('BADGE_PUBLIC_BASE_URL precisa ser uma URL HTTPS pública válida, sem credenciais, query ou fragmento.');
  }
  return url.href.replace(/\/+$/, '');
}

function localPath(file) {
  if (typeof file !== 'string' || !/^[a-zA-Z0-9/_-]+\.(svg|png|webp)$/.test(file)) {
    throw new Error(`Nome de arquivo de badge inválido: ${file}`);
  }
  const resolved = path.resolve(BADGES_DIR, file);
  if (!resolved.startsWith(BADGES_DIR + path.sep)) throw new Error('Caminho fora da pasta de badges.');
  return resolved;
}

async function loadIcon(file) {
  const bytes = await readFile(localPath(file));
  if (bytes.length > 2_000_000) throw new Error(`Badge muito grande: ${file}`);
  return sharp(bytes, { density: 240, limitInputPixels: 4_000_000 })
    .resize(ICON_SIZE, ICON_SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toBuffer();
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 24);
}

async function generate(badges) {
  if (!badges.length) return null;
  const available = [];
  for (const badge of badges) {
    try {
      const filepath = localPath(badge.file);
      const info = await stat(filepath);
      if (!info.isFile()) throw new Error('Não é arquivo regular');
      available.push({ ...badge, mtimeMs: info.mtimeMs, size: info.size });
    } catch (error) {
      console.warn(`[USERINFO BADGES] Arquivo ausente/inválido: ${badge.id} (${badge.file}): ${error.message}`);
    }
  }
  if (!available.length) return null;

  // Inclui metadados dos arquivos no hash: substituir uma badge invalida o cache.
  const key = digest(available.map(b => [b.id, b.file, b.mtimeMs, b.size]));
  const filename = `${key}.png`;
  const filepath = path.join(OUTPUT_DIR, filename);
  const base = publicBaseUrl();
  await mkdir(OUTPUT_DIR, { recursive: true });
  try {
    const existing = await stat(filepath);
    if (existing.isFile() && existing.size > 0) {
      return { filepath, filename, url: base ? `${base}/${filename}` : null, count: available.length };
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const results = await Promise.allSettled(available.map(b => loadIcon(b.file)));
  const icons = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled') icons.push(result.value);
    else console.error(`[USERINFO BADGES] Falha ao processar ${available[i].id} (${available[i].file}):`, result.reason);
  }
  if (!icons.length) return null;
  const columns = Math.min(icons.length, MAX_COLUMNS);
  const rows = Math.ceil(icons.length / MAX_COLUMNS);
  const width = PADDING * 2 + columns * ICON_SIZE + (columns - 1) * GAP;
  const height = PADDING * 2 + rows * ICON_SIZE + (rows - 1) * GAP;
  const layers = icons.map((input, index) => ({
    input,
    left: PADDING + (index % MAX_COLUMNS) * (ICON_SIZE + GAP),
    top: PADDING + Math.floor(index / MAX_COLUMNS) * (ICON_SIZE + GAP)
  }));
  const png = await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(layers).png().toBuffer();
  await writeFile(filepath, png);
  return { filepath, filename, url: base ? `${base}/${filename}` : null, count: icons.length };
}

export async function generateUserBadgeImage(user) {
  const badges = getUserBadgeImages(user);
  if (!badges.length) return null;
  const key = digest(badges.map(b => [b.id, b.file]));
  if (pending.has(key)) return pending.get(key);
  const task = generate(badges).finally(() => pending.delete(key));
  pending.set(key, task);
  return task;
}
