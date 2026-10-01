// Procedural tileable surface maps. Pure data so the same code runs in a worker or on the main thread.

function hash(ix, iy, seed) {
    let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

function noise(x, y, px, py, seed) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const x0 = ((xi % px) + px) % px;
    const y0 = ((yi % py) + py) % py;
    const x1 = (x0 + 1) % px;
    const y1 = (y0 + 1) % py;
    const u = fx * fx * (3 - 2 * fx);
    const v = fy * fy * (3 - 2 * fy);
    const a = hash(x0, y0, seed);
    const b = hash(x1, y0, seed);
    const c = hash(x0, y1, seed);
    const d = hash(x1, y1, seed);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x, y, px, py, octaves, seed) {
    let sum = 0;
    let amp = 0.5;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
        sum += amp * noise(x, y, px, py, seed + o * 17);
        norm += amp;
        x *= 2;
        y *= 2;
        px *= 2;
        py *= 2;
        amp *= 0.5;
    }
    return sum / norm;
}

// `fill` writes height (mm), roughness and optional sRGB albedo per pixel.
// Returns RGBA8 normal, roughness and colour data plus the texture repeat per metre or per mm.
function surfaceMaps(w, h, spanU, spanV, fill, withColor, repeat) {
    const n = w * h;
    const height = new Float32Array(n);
    const rough = new Float32Array(n);
    const albedo = withColor ? new Float32Array(n * 3) : null;
    for (let y = 0, i = 0; y < h; y++) {
        for (let x = 0; x < w; x++, i++) fill(x / w, y / h, x, y, i, height, rough, albedo);
    }
    const sx = 1 / (2 * spanU / w);
    const sy = 1 / (2 * spanV / h);
    const normal = new Uint8Array(n * 4);
    const roughData = new Uint8Array(n * 4);
    const colorData = withColor ? new Uint8Array(n * 4) : null;
    for (let y = 0; y < h; y++) {
        const row = y * w;
        const prev = ((y - 1 + h) % h) * w;
        const next = ((y + 1) % h) * w;
        for (let x = 0; x < w; x++) {
            const i = row + x;
            const dx = (height[row + (x + 1) % w] - height[row + (x - 1 + w) % w]) * sx;
            const dy = (height[next + x] - height[prev + x]) * sy;
            const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
            const o = i * 4;
            normal[o] = (-dx * inv * 0.5 + 0.5) * 255;
            normal[o + 1] = (-dy * inv * 0.5 + 0.5) * 255;
            normal[o + 2] = (inv * 0.5 + 0.5) * 255;
            normal[o + 3] = 255;
            const r = Math.min(1, Math.max(0, rough[i])) * 255;
            roughData[o] = r;
            roughData[o + 1] = r;
            roughData[o + 2] = r;
            roughData[o + 3] = 255;
            if (colorData) {
                colorData[o] = Math.min(1, albedo[i * 3]) * 255;
                colorData[o + 1] = Math.min(1, albedo[i * 3 + 1]) * 255;
                colorData[o + 2] = Math.min(1, albedo[i * 3 + 2]) * 255;
                colorData[o + 3] = 255;
            }
        }
    }
    return { w, h, normal, rough: roughData, color: colorData, repeat };
}

function powderCoat() {
    const span = 30;
    return surfaceMaps(512, 512, span, span, (u, v, x, y, i, height, rough) => {
        const peel = fbm(u * 14, v * 14, 14, 14, 4, 5);
        const fine = noise(u * 96, v * 96, 96, 96, 9);
        height[i] = (peel - 0.5) * 0.045 + (fine - 0.5) * 0.006;
        rough[i] = 0.64 + (fine - 0.5) * 0.08 + (peel - 0.5) * 0.06;
    }, false, [1 / span, 1 / span]);
}

function brushed() {
    const span = 160;
    return surfaceMaps(512, 512, span, span, (u, v, x, y, i, height, rough, albedo) => {
        const band = fbm(u * 1, v * 24, 1, 24, 3, 45);
        const streak = fbm(u * 2, v * 96, 2, 96, 3, 41);
        const line = noise(u * 4, v * 512, 4, 512, 43);
        const s = band * 0.4 + streak * 0.35 + line * 0.25;
        height[i] = (s - 0.5) * 0.004;
        rough[i] = 0.3 + s * 0.2;
        const c = 0.86 + (s - 0.5) * 0.22;
        albedo[i * 3] = c;
        albedo[i * 3 + 1] = c;
        albedo[i * 3 + 2] = c;
    }, true, [1 / span, 1 / span]);
}

function concrete() {
    const sx = 2400;
    const sy = 1200;
    return surfaceMaps(1024, 512, sx, sy, (u, v, x, y, i, height, rough, albedo) => {
        const xm = u * sx;
        const ym = v * sy;
        const cloud = fbm(u * 6, v * 3, 6, 3, 4, 11);
        const mid = fbm(u * 96, v * 48, 96, 48, 2, 23);
        const fine = noise(u * 480, v * 240, 480, 240, 31);
        let hgt = (mid - 0.5) * 0.35 + (fine - 0.5) * 0.25;
        let tone = 0.84 + cloud * 0.26 + (mid - 0.5) * 0.08 + (fine - 0.5) * 0.05;
        let r = 0.86 + (fine - 0.5) * 0.08;
        const edge = Math.min(xm, sx - xm, ym, sy - ym);
        if (edge < 2.4) {
            hgt += 0.5;
            tone *= 0.88;
        } else if (edge < 40) {
            tone *= 0.96 + edge * 0.001;
        }
        const d = Math.hypot((xm % 600) - 300, (ym % 600) - 300);
        if (d < 11) {
            hgt -= 7 * (1 - d / 11);
            tone *= 0.5 + d * 0.02;
            r = 0.95;
        } else if (d < 15) {
            hgt -= 0.4;
            tone *= 0.92;
        }
        const pcx = Math.floor(xm / 4);
        const pcy = Math.floor(ym / 4);
        const ph = hash(pcx, pcy, 77);
        if (ph < 0.045) {
            const jx = (pcx + 0.5) * 4 + (hash(pcx, pcy, 78) - 0.5) * 2;
            const jy = (pcy + 0.5) * 4 + (hash(pcx, pcy, 79) - 0.5) * 2;
            const pr = 1 + ph * 30;
            const pd = Math.hypot(xm - jx, ym - jy);
            if (pd < pr) {
                hgt -= 0.8 * (1 - pd / pr);
                tone *= 0.62;
            }
        }
        height[i] = hgt;
        rough[i] = r;
        albedo[i * 3] = 0.55 * tone;
        albedo[i * 3 + 1] = 0.545 * tone;
        albedo[i * 3 + 2] = 0.53 * tone;
    }, true, [1000 / sx, 1000 / sy]);
}

function plaster() {
    const span = 1000;
    return surfaceMaps(1024, 1024, span, span, (u, v, x, y, i, height, rough, albedo) => {
        const wave = fbm(u * 5, v * 5, 5, 5, 3, 51);
        const grain = fbm(u * 320, v * 320, 320, 320, 2, 53);
        const sand = hash(x, y, 57);
        height[i] = (wave - 0.5) * 1.2 + (grain - 0.5) * 0.55 + (sand - 0.5) * 0.18;
        const tone = 0.95 + (wave - 0.5) * 0.07 + (grain - 0.5) * 0.07 + (sand - 0.5) * 0.035;
        rough[i] = 0.93 + (grain - 0.5) * 0.06;
        albedo[i * 3] = 0.7 * tone;
        albedo[i * 3 + 1] = 0.69 * tone;
        albedo[i * 3 + 2] = 0.665 * tone;
    }, true, [1000 / span, 1000 / span]);
}

// Fibre cement cladding, 600 mm wide vertical boards with 8 mm open joints.
function panel() {
    const span = 600;
    return surfaceMaps(384, 384, span, span, (u, v, x, y, i, height, rough, albedo) => {
        const xm = u * span;
        const grain = fbm(u * 60, v * 60, 60, 60, 2, 91);
        const cloud = fbm(u * 3, v * 3, 3, 3, 3, 93);
        const joint = Math.min(xm, span - xm) < 4;
        const o = i * 3;
        height[i] = joint ? -4 : (grain - 0.5) * 0.08;
        rough[i] = joint ? 0.95 : 0.5 + (grain - 0.5) * 0.08 + (cloud - 0.5) * 0.08;
        const t = joint ? 0.35 : 0.96 + (cloud - 0.5) * 0.06 + (grain - 0.5) * 0.03;
        albedo[o] = 0.2 * t;
        albedo[o + 1] = 0.205 * t;
        albedo[o + 2] = 0.215 * t;
    }, true, [1000 / span, 1000 / span]);
}

// Polished concrete floor; `sizeM` is the floor plane edge so the map repeats once per 3 m.
function floor(sizeM) {
    const span = 3000;
    const k = sizeM * 1000 / span;
    return surfaceMaps(1024, 1024, span, span, (u, v, x, y, i, height, rough, albedo) => {
        const cloud = fbm(u * 6, v * 6, 6, 6, 4, 81);
        const sheen = fbm(u * 4, v * 4, 4, 4, 3, 85);
        const mid = fbm(u * 60, v * 60, 60, 60, 2, 83);
        let tone = 0.8 + cloud * 0.34 + (mid - 0.5) * 0.08;
        const cx = Math.floor(u * 300);
        const cy = Math.floor(v * 300);
        const ah = hash(cx, cy, 87);
        if (ah < 0.4) {
            const jx = (cx + 0.5 + (hash(cx, cy, 88) - 0.5) * 0.5) * 10;
            const jy = (cy + 0.5 + (hash(cx, cy, 89) - 0.5) * 0.5) * 10;
            const r = 1.5 + ah * 6;
            if (Math.hypot(u * span - jx, v * span - jy) < r) tone *= 0.78 + hash(cx, cy, 90) * 0.5;
        }
        height[i] = (mid - 0.5) * 0.08;
        rough[i] = 0.34 + sheen * 0.28 + (mid - 0.5) * 0.06;
        albedo[i * 3] = 0.35 * tone;
        albedo[i * 3 + 1] = 0.345 * tone;
        albedo[i * 3 + 2] = 0.34 * tone;
    }, true, [k, k]);
}

const SURFACES = { pulveri: powderCoat, harjattu: brushed, betoni: concrete, rappaus: plaster, paneeli: panel, lattia: floor };

export function computeSurface(name, args = []) {
    return SURFACES[name](...args);
}
