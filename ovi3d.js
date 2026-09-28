import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const KARMI = 40;
const PUITE = 87.5;
const PUITE_LISA = 62.5;
const RAKO = 5;
const W_PARI = 420;
const W_KAYNTI = 265;
const H_POTKU = 135;
const KICK_MIN = 40;
const GLASS_MIN = 80;
const MODULE = 100;
const OPENING_GAP = 20;
const MIN_PAIR_MODULE = 13;
const MIN_SINGLE_MODULE = 5;
const KAYNTI_LOCK_MIN = 695;
const KAYNTI_LOCK_MAX = 895;
const SYVYYS = 60;
const LASI_T = 18;

const RAL = {
    "1000": "#beb87f", "1001": "#c2b078", "1002": "#c6a664", "1013": "#eae6ca", "1014": "#e1cc4f",
    "1015": "#e6d2b5", "1019": "#9e9764", "3000": "#af2b1e", "3003": "#861a22", "3005": "#5e2129",
    "5002": "#20214f", "5003": "#1d1e33", "5010": "#0e518d", "5011": "#231a24", "6005": "#2f4538",
    "6009": "#31372b", "6011": "#6c7c59", "6021": "#89ac76", "7001": "#8a9597", "7012": "#4e5754",
    "7015": "#51565c", "7016": "#383e42", "7021": "#2f3234", "7022": "#4e5049", "7024": "#474a51",
    "7030": "#8b8c7a", "7032": "#b8b799", "7035": "#d7d7d7", "7037": "#7d7f7d", "7038": "#b4b8b0",
    "7039": "#6c6960", "7040": "#9da1a5", "7042": "#8f9695", "7043": "#4e5451", "7044": "#cac4b0",
    "8014": "#49392d", "8017": "#44322d", "8019": "#403a3a", "9001": "#fdf4e3", "9002": "#e7ebda",
    "9003": "#f4f4f4", "9004": "#282828", "9005": "#0a0a0a", "9006": "#a5a5a5", "9007": "#8f8f8c",
    "9010": "#f1ece1", "9011": "#1c1c1c", "9016": "#f6f6f6", "9018": "#d7d7d2"
};

const $ = (id) => document.getElementById(id);
let syncing = false;
let ralError = "";
let openingError = "";
let typeError = "";
let openingLock = null;

function doorType() {
    const picked = document.querySelector('input[name="tyyppi"]:checked');
    return picked ? picked.value : "pariovi";
}

function isPair() {
    return doorType() === "pariovi";
}

function setDoorType(value) {
    const input = document.querySelector('input[name="tyyppi"][value="' + value + '"]');
    if (input) input.checked = true;
    syncLisa();
}

function hand() {
    const picked = document.querySelector('input[name="katisyys"]:checked');
    return picked && picked.value === "vasen" ? "vasen" : "oikea";
}

function setHand(value) {
    const input = document.querySelector('input[name="katisyys"][value="' + value + '"]');
    if (input) input.checked = true;
}

function syncOpeningHand() {
    const s = $("oviaukko").value.trim().replace(/\s+/g, "").replace(/×/g, "x").toLowerCase();
    const match = s.match(/^(\d+)x(\d+)[ov]$/);
    if (!match) return;
    const next = Number(match[1]) + "x" + Number(match[2]) + (hand() === "vasen" ? "v" : "o");
    if ($("oviaukko").value !== next) $("oviaukko").value = next;
}

function syncLisa() {
    $("lisaLabel").hidden = !isPair();
}

function num(id) {
    const n = Number(String($(id).value).replace(",", "."));
    return Number.isFinite(n) ? n : null;
}

function setNum(id, n) {
    $(id).value = String(Math.round(n));
}

function applyRal() {
    const digits = $("ral").value.replace(/\D/g, "").slice(0, 4);
    if ($("ral").value !== digits) $("ral").value = digits;
    if (digits.length < 4) {
        ralError = "";
        return;
    }
    const hex = RAL[digits];
    if (!hex) {
        ralError = "RAL " + digits + " ei ole tuettu.";
        return;
    }
    ralError = "";
    $("vari").value = hex;
}

function matchRalFromColor() {
    const hex = $("vari").value.toLowerCase();
    const code = Object.keys(RAL).find((key) => RAL[key] === hex);
    $("ral").value = code || "";
    ralError = "";
}

function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
}

function inRange(n, min, max) {
    return n != null && n >= min && n <= max;
}

function setBound(id, min, max) {
    const el = $(id);
    if (min == null) el.removeAttribute("min");
    else el.min = String(min);
    if (max == null) el.removeAttribute("max");
    else el.max = String(max);
}

function widthRanges(leveys) {
    const budget = leveys - W_PARI;
    return {
        kayntiMin: KAYNTI_LOCK_MIN,
        kayntiMax: Math.min(KAYNTI_LOCK_MAX, budget - GLASS_MIN),
        lisaMin: Math.max(GLASS_MIN, budget - KAYNTI_LOCK_MAX),
        lisaMax: budget - KAYNTI_LOCK_MIN
    };
}

function heightRanges(korkeus) {
    return {
        potkuMin: KICK_MIN,
        potkuMax: korkeus - H_POTKU - GLASS_MIN,
        valoMin: GLASS_MIN,
        valoMax: korkeus - H_POTKU - KICK_MIN
    };
}

function setLockedBounds(locked) {
    const pair = isPair();
    $("leveys").readOnly = locked;
    $("korkeus").readOnly = locked;
    $("kaynti").readOnly = locked && !pair;
    $("leveys").min = pair ? "1000" : String(W_KAYNTI + GLASS_MIN);
    if (!locked) {
        setBound("kaynti", GLASS_MIN, null);
        setBound("lisa", GLASS_MIN, null);
        setBound("valoH", GLASS_MIN, null);
        setBound("potku", KICK_MIN, null);
        return;
    }
    const hr = heightRanges(openingLock.korkeus);
    setBound("potku", hr.potkuMin, hr.potkuMax);
    setBound("valoH", hr.valoMin, hr.valoMax);
    if (!pair) return;
    const wr = widthRanges(openingLock.leveys);
    setBound("kaynti", wr.kayntiMin, wr.kayntiMax);
    setBound("lisa", wr.lisaMin, wr.lisaMax);
}

function parseOpening(raw) {
    const s = String(raw).trim().replace(/\s+/g, "").replace(/×/g, "x").toLowerCase();
    if (s === "") return { state: "empty" };
    const complete = s.match(/^(\d+)x(\d+)([ov])?$/);
    if (!complete) {
        if (/^\d+$/.test(s) || /^\d+x$/.test(s) || /^\d+x\d*$/.test(s)) return { state: "partial" };
        return { state: "invalid", message: "Oviaukon muoto on esim. 15x23 tai 15x23v." };
    }
    const wMod = Number(complete[1]);
    const hMod = Number(complete[2]);
    if (wMod < MIN_SINGLE_MODULE) {
        return { state: "invalid", message: "Oviaukon leveys on vähintään 5 (500 mm)." };
    }
    const leveys = wMod * MODULE - OPENING_GAP;
    const korkeus = hMod * MODULE - OPENING_GAP;
    const pair = wMod >= MIN_PAIR_MODULE;
    if (pair && widthRanges(leveys).kayntiMax < KAYNTI_LOCK_MIN) {
        return { state: "invalid", message: "Oviaukko on liian kapea käyntiovelle ja lisäovelle." };
    }
    if (!pair && leveys - W_KAYNTI < GLASS_MIN) {
        return { state: "invalid", message: "Oviaukko on liian kapea käyntiovelle." };
    }
    if (heightRanges(korkeus).potkuMax < KICK_MIN) {
        return {
            state: "invalid",
            message: "Oviaukko on liian matala valoaukolle ja potkupellille.",
            shortHeight: complete[2].length < 2
        };
    }
    const handName = complete[3] === "v" ? "vasen" : complete[3] === "o" ? "oikea" : null;
    const canonical = wMod + "x" + hMod + (handName === "vasen" ? "v" : handName === "oikea" ? "o" : "");
    return { state: "ok", wMod, hMod, leveys, korkeus, pair, hand: handName, canonical };
}

function splitPair(leveys) {
    const wr = widthRanges(leveys);
    let kaynti = num("kaynti");
    let lisa = num("lisa");
    if (kaynti != null && inRange(kaynti, wr.kayntiMin, wr.kayntiMax)) {
        kaynti = Math.round(kaynti);
        lisa = leveys - W_PARI - kaynti;
    } else if (lisa != null && inRange(Math.round(lisa), wr.lisaMin, wr.lisaMax)) {
        lisa = Math.round(lisa);
        kaynti = leveys - W_PARI - lisa;
    } else {
        if (kaynti == null) kaynti = wr.kayntiMin;
        kaynti = Math.round(clamp(kaynti, wr.kayntiMin, wr.kayntiMax));
        lisa = leveys - W_PARI - kaynti;
    }
    return { kaynti, lisa };
}

function applyOpening(parsed) {
    const hr = heightRanges(parsed.korkeus);
    setDoorType(parsed.pair ? "pariovi" : "kayntiovi");
    if (parsed.hand) setHand(parsed.hand);
    let kaynti;
    if (parsed.pair) {
        const split = splitPair(parsed.leveys);
        kaynti = split.kaynti;
        setNum("lisa", split.lisa);
    } else {
        kaynti = parsed.leveys - W_KAYNTI;
    }

    let potku = num("potku");
    if (potku == null) potku = KICK_MIN;
    potku = Math.round(potku);
    if (potku < KICK_MIN) potku = KICK_MIN;
    let valoH = parsed.korkeus - potku - H_POTKU;
    if (valoH < GLASS_MIN) {
        potku = hr.potkuMax;
        valoH = GLASS_MIN;
    }

    setNum("leveys", parsed.leveys);
    setNum("korkeus", parsed.korkeus);
    setNum("kaynti", kaynti);
    setNum("potku", potku);
    setNum("valoH", valoH);
    openingLock = {
        wMod: parsed.wMod,
        hMod: parsed.hMod,
        leveys: parsed.leveys,
        korkeus: parsed.korkeus
    };
    setLockedBounds(true);
}

function clearLock() {
    openingLock = null;
    setLockedBounds(false);
}

function applyOpeningInput(commit) {
    const parsed = parseOpening($("oviaukko").value);
    typeError = "";
    if (parsed.state === "empty") {
        openingError = "";
        typeError = "";
        clearLock();
        return;
    }
    if (parsed.state === "partial") {
        openingError = "";
        return;
    }
    if (parsed.state === "invalid") {
        if (!commit && parsed.shortHeight) {
            openingError = "";
            return;
        }
        openingError = parsed.message;
        return;
    }
    openingError = "";
    typeError = "";
    if ($("oviaukko").value !== parsed.canonical) $("oviaukko").value = parsed.canonical;
    applyOpening(parsed);
}

function applyTypeChange() {
    if (isPair() && openingLock && openingLock.wMod < MIN_PAIR_MODULE) {
        setDoorType("kayntiovi");
        typeError = "Parioven oviaukon leveys on vähintään 13 (1300 mm).";
        return;
    }
    typeError = "";
    syncLisa();
    if (openingLock) {
        applyOpening({
            wMod: openingLock.wMod,
            hMod: openingLock.hMod,
            leveys: openingLock.leveys,
            korkeus: openingLock.korkeus,
            pair: isPair()
        });
        return;
    }
    const kaynti = num("kaynti");
    if (!isPair()) {
        if (kaynti != null) setNum("leveys", kaynti + W_KAYNTI);
    } else {
        const lisa = num("lisa");
        if (kaynti != null && lisa != null) setNum("leveys", kaynti + lisa + W_PARI);
    }
    setLockedBounds(false);
}

function applyLockedSync(source) {
    const hr = heightRanges(openingLock.korkeus);
    setNum("leveys", openingLock.leveys);
    setNum("korkeus", openingLock.korkeus);
    if (!isPair()) {
        setNum("kaynti", openingLock.leveys - W_KAYNTI);
        if (source === "potku") {
            const potku = num("potku");
            if (!inRange(potku, hr.potkuMin, hr.potkuMax)) return;
            setNum("valoH", openingLock.korkeus - potku - H_POTKU);
        }
        if (source === "valoH") {
            const valoH = num("valoH");
            if (!inRange(valoH, hr.valoMin, hr.valoMax)) return;
            setNum("potku", openingLock.korkeus - valoH - H_POTKU);
        }
        return;
    }
    const wr = widthRanges(openingLock.leveys);
    if (source === "kaynti") {
        const kaynti = num("kaynti");
        if (!inRange(kaynti, wr.kayntiMin, wr.kayntiMax)) return;
        setNum("lisa", openingLock.leveys - W_PARI - kaynti);
    }
    if (source === "lisa") {
        const lisa = num("lisa");
        if (!inRange(lisa, wr.lisaMin, wr.lisaMax)) return;
        setNum("kaynti", openingLock.leveys - W_PARI - lisa);
    }
    if (source === "potku") {
        const potku = num("potku");
        if (!inRange(potku, hr.potkuMin, hr.potkuMax)) return;
        setNum("valoH", openingLock.korkeus - potku - H_POTKU);
    }
    if (source === "valoH") {
        const valoH = num("valoH");
        if (!inRange(valoH, hr.valoMin, hr.valoMax)) return;
        setNum("potku", openingLock.korkeus - valoH - H_POTKU);
    }
}

function applySync(source) {
    if (openingLock) {
        applyLockedSync(source);
        return;
    }
    const kaynti = num("kaynti");
    const lisa = num("lisa");
    const valoH = num("valoH");
    const leveys = num("leveys");
    const korkeus = num("korkeus");
    const potku = num("potku");

    if (!isPair()) {
        if (source === "leveys" && leveys != null) setNum("kaynti", leveys - W_KAYNTI);
        if (source === "kaynti" && kaynti != null) setNum("leveys", kaynti + W_KAYNTI);
    } else {
        if (source === "leveys" && leveys != null && lisa != null) {
            setNum("kaynti", leveys - W_PARI - lisa);
        }
        if ((source === "kaynti" || source === "lisa") && kaynti != null && lisa != null) {
            setNum("leveys", kaynti + lisa + W_PARI);
        }
    }
    if (source === "korkeus" && korkeus != null && potku != null && potku >= KICK_MIN) {
        setNum("valoH", korkeus - potku - H_POTKU);
    }
    if ((source === "valoH" || source === "potku") && valoH != null && potku != null && potku >= KICK_MIN) {
        setNum("korkeus", valoH + potku + H_POTKU);
    }
}

function readSpec() {
    return {
        kaynti: num("kaynti"),
        lisa: num("lisa"),
        valoH: num("valoH"),
        leveys: num("leveys"),
        korkeus: num("korkeus"),
        potku: num("potku"),
        pair: isPair(),
        vasen: hand() === "vasen",
        vari: $("vari").value
    };
}

function rangeMessage(label, min, max) {
    return label + " on " + min + "–" + max + " mm.";
}

function validate(s) {
    if (openingError) return openingError;
    if (typeError) return typeError;
    const dims = s.pair
        ? [s.kaynti, s.lisa, s.valoH, s.leveys, s.korkeus, s.potku]
        : [s.kaynti, s.valoH, s.leveys, s.korkeus, s.potku];
    if (dims.some((v) => v == null)) return "Täytä kaikki mittakentät.";
    if (openingLock) {
        const hr = heightRanges(openingLock.korkeus);
        if (s.pair) {
            const wr = widthRanges(openingLock.leveys);
            if (s.kaynti < wr.kayntiMin || s.kaynti > wr.kayntiMax) {
                return rangeMessage("Käyntioven valoaukko", wr.kayntiMin, wr.kayntiMax);
            }
            if (s.lisa < wr.lisaMin || s.lisa > wr.lisaMax) {
                return rangeMessage("Lisäoven valoaukko", wr.lisaMin, wr.lisaMax);
            }
        }
        if (s.potku < hr.potkuMin || s.potku > hr.potkuMax) {
            return rangeMessage("Potkupellin korkeus", hr.potkuMin, hr.potkuMax);
        }
        if (s.valoH < hr.valoMin || s.valoH > hr.valoMax) {
            return rangeMessage("Valoaukon korkeus", hr.valoMin, hr.valoMax);
        }
    }
    if (s.pair) {
        if (Math.abs(s.kaynti + s.lisa + W_PARI - s.leveys) > 1) return "Leveys ei täsmää valoaukkoihin.";
        if (s.lisa < GLASS_MIN) return "Valoaukko on liian pieni.";
    } else if (Math.abs(s.kaynti + W_KAYNTI - s.leveys) > 1) {
        return "Leveys ei täsmää valoaukkoon.";
    }
    if (s.potku >= KICK_MIN && Math.abs(s.valoH + s.potku + H_POTKU - s.korkeus) > 1) {
        return "Korkeus ei täsmää valoaukkoon ja potkuun.";
    }
    if (s.kaynti < GLASS_MIN || s.valoH < GLASS_MIN) return "Valoaukko on liian pieni.";
    if (s.potku < KICK_MIN) return "Potkupellin korkeus on vähintään 40 mm.";
    return "";
}

function miterHit(ox, oy, ix, iy) {
    const dx = ix - ox;
    const dy = iy - oy;
    const m = Math.min(Math.abs(dx), Math.abs(dy));
    const sx = dx >= 0 ? 1 : -1;
    const sy = dy >= 0 ? 1 : -1;
    return [ix - sx * m, iy - sy * m];
}

function near(a, b) {
    return Math.abs(a[0] - b[0]) < 1e-4 && Math.abs(a[1] - b[1]) < 1e-4;
}

function dedupe(pts) {
    const out = [];
    pts.forEach((p) => {
        if (!out.length || !near(out[out.length - 1], p)) out.push(p);
    });
    if (out.length > 1 && near(out[0], out[out.length - 1])) out.pop();
    return out;
}

function miteredFrame(ox, oy, ow, oh, left, right, bottom, top) {
    const obl = [ox, oy];
    const obr = [ox + ow, oy];
    const otr = [ox + ow, oy + oh];
    const otl = [ox, oy + oh];
    const ibl = [ox + left, oy + bottom];
    const ibr = [ox + ow - right, oy + bottom];
    const itr = [ox + ow - right, oy + oh - top];
    const itl = [ox + left, oy + oh - top];
    const hbl = miterHit(obl[0], obl[1], ibl[0], ibl[1]);
    const hbr = miterHit(obr[0], obr[1], ibr[0], ibr[1]);
    const htr = miterHit(otr[0], otr[1], itr[0], itr[1]);
    const htl = miterHit(otl[0], otl[1], itl[0], itl[1]);
    const onLeft = (p) => Math.abs(p[0] - ox) < 1e-4;
    const onRight = (p) => Math.abs(p[0] - (ox + ow)) < 1e-4;
    const onBottom = (p) => Math.abs(p[1] - oy) < 1e-4;
    const onTop = (p) => Math.abs(p[1] - (oy + oh)) < 1e-4;
    const piece = (ha, ia, ib, hb, extraB, condB, extraA, condA) => {
        const pts = [ha, ia, ib, hb];
        if (condB) pts.push(extraB);
        if (condA) pts.push(extraA);
        return dedupe(pts);
    };
    return [
        piece(hbl, ibl, itl, htl, otl, onTop(htl) && !onLeft(htl), obl, onBottom(hbl) && !onLeft(hbl)),
        piece(hbr, ibr, itr, htr, otr, onTop(htr) && !onRight(htr), obr, onBottom(hbr) && !onRight(hbr)),
        piece(htl, itl, itr, htr, otr, onRight(htr) && !onTop(htr), otl, onLeft(htl) && !onTop(htl)),
        piece(hbl, ibl, ibr, hbr, obr, onRight(hbr) && !onBottom(hbr), obl, onLeft(hbl) && !onBottom(hbl))
    ];
}

function leafGeom(spec, gx, gw, leftW, rightW) {
    const glassTop = spec.korkeus - KARMI - RAKO - PUITE;
    const gy = glassTop - spec.valoH;
    const outerBottom = Math.min(KARMI + RAKO, gy);
    const bottomRail = Math.min(PUITE, Math.max(0, gy - outerBottom));
    const ox = gx - leftW;
    const oy = outerBottom;
    const ow = gw + leftW + rightW;
    const oh = glassTop + PUITE - outerBottom;
    return {
        bars: miteredFrame(ox, oy, ow, oh, leftW, rightW, bottomRail, PUITE),
        plate: [ox + 5, oy, ow - 10, gy - oy],
        glass: [gx, gy, gw, spec.valoH],
        outer: [ox, oy, ow, oh]
    };
}

function shapeFrom(pts) {
    const shape = new THREE.Shape();
    shape.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
    return shape;
}

function addExtrude(group, pts, zFront, depth, material, bevel) {
    const bevelT = bevel ? 0.7 : 0;
    const geom = new THREE.ExtrudeGeometry(shapeFrom(pts), {
        depth: Math.max(depth - bevelT * 2, 0.4),
        bevelEnabled: !!bevel,
        bevelThickness: bevelT,
        bevelSize: bevel ? 0.6 : 0,
        bevelSegments: bevel ? 2 : 0,
        curveSegments: 1
    });
    geom.computeBoundingBox();
    geom.translate(0, 0, zFront - geom.boundingBox.max.z);
    const mesh = new THREE.Mesh(geom, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
}

function addBox(group, x, y, w, h, zFront, depth, material, bevel) {
    addExtrude(group, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], zFront, depth, material, bevel);
}

function addMesh(group, geometry, material, x, y, z) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
}

function addBarrelHinge(group, x, yCenter, body, silver, brass) {
    const radius = 10;
    const z = radius + 1;
    const lower = 64;
    const gap = 8;
    const upper = 64;
    const total = lower + gap + upper;
    const base = yCenter - total / 2;
    addMesh(group, new THREE.CylinderGeometry(radius, radius, lower, 24), body, x, base + lower / 2, z);
    addMesh(group, new THREE.SphereGeometry(radius, 24, 16), body, x, base, z);
    addMesh(group, new THREE.CylinderGeometry(radius + 1.6, radius + 1.6, 4.6, 28), silver, x, base + lower + gap / 2, z);
    addMesh(group, new THREE.CylinderGeometry(radius, radius, upper, 24), body, x, base + lower + gap + upper / 2, z);
    const top = base + total;
    addMesh(group, new THREE.CylinderGeometry(3.3, 4.8, 6, 16), brass, x, top + 3, z);
    addMesh(group, new THREE.SphereGeometry(2.2, 16, 12), brass, x, top + 7.1, z);
}

function addHinges(group, height, width, body, silver, brass, bothSides) {
    [200, height / 2, height - 200].forEach((y) => {
        const inset = KARMI + RAKO / 2;
        if (bothSides) addBarrelHinge(group, inset, y, body, silver, brass);
        addBarrelHinge(group, width - inset, y, body, silver, brass);
    });
}

function addBead(group, gx, gy, gw, gh, material) {
    const b = 12;
    const o = 2;
    const zFront = -0.35;
    const depth = 4.2;
    addBox(group, gx - b + o, gy + gh - o, gw + (b - o) * 2, b, zFront, depth, material, true);
    addBox(group, gx - b + o, gy - b + o, gw + (b - o) * 2, b, zFront, depth, material, true);
    addBox(group, gx - b + o, gy, b, gh, zFront, depth, material, true);
    addBox(group, gx + gw - o, gy, b, gh, zFront, depth, material, true);
}

function addShadowGaps(group, spec, material) {
    const zFront = -1.5;
    const depth = 8;
    const innerW = spec.leveys - 2 * KARMI - 2 * RAKO;
    const innerH = spec.korkeus - 2 * KARMI - 2 * RAKO;
    addBox(group, KARMI, KARMI + RAKO, RAKO, innerH, zFront, depth, material);
    addBox(group, spec.leveys - KARMI - RAKO, KARMI + RAKO, RAKO, innerH, zFront, depth, material);
    addBox(group, KARMI + RAKO, KARMI, innerW, RAKO, zFront, depth, material);
    addBox(group, KARMI + RAKO, spec.korkeus - KARMI - RAKO, innerW, RAKO, zFront, depth, material);
    if (!spec.pair) return;
    const meetX = spec.lisa + 195;
    const glassTop = spec.korkeus - KARMI - RAKO - PUITE;
    const gy = glassTop - spec.valoH;
    const outerBottom = Math.min(KARMI + RAKO, gy);
    const oh = glassTop + PUITE - outerBottom;
    addBox(group, meetX, outerBottom, RAKO, oh, zFront, depth, material);
}

class FacePullCurve extends THREE.Curve {
    constructor(x0, xBar, y0, y1, z0, zPlane, radius) {
        super();
        this.x0 = x0;
        this.xBar = xBar;
        this.y0 = y0;
        this.y1 = y1;
        this.z0 = z0;
        this.zPlane = zPlane;
        this.radius = radius;
        this.neck = zPlane - z0;
        this.leg = xBar - radius - x0;
        this.arc = radius * Math.PI / 2;
        this.grip = y1 - y0 - 2 * radius;
        this.total = this.neck * 2 + this.leg * 2 + this.arc * 2 + this.grip;
    }

    getPoint(t, target = new THREE.Vector3()) {
        let d = t * this.total;
        const R = this.radius;
        const xElbow = this.xBar - R;
        const yLo = this.y0 + R;
        const yHi = this.y1 - R;
        if (d <= this.neck) {
            return target.set(this.x0, this.y0, this.z0 + d);
        }
        d -= this.neck;
        if (d <= this.leg) {
            return target.set(this.x0 + d, this.y0, this.zPlane);
        }
        d -= this.leg;
        if (d <= this.arc) {
            const a = d / R;
            return target.set(xElbow + Math.sin(a) * R, yLo - Math.cos(a) * R, this.zPlane);
        }
        d -= this.arc;
        if (d <= this.grip) {
            return target.set(this.xBar, yLo + d, this.zPlane);
        }
        d -= this.grip;
        if (d <= this.arc) {
            const a = d / R;
            return target.set(xElbow + Math.cos(a) * R, yHi + Math.sin(a) * R, this.zPlane);
        }
        d -= this.arc;
        if (d <= this.leg) {
            return target.set(xElbow - d, this.y1, this.zPlane);
        }
        d -= this.leg;
        return target.set(this.x0, this.y1, this.zPlane - d);
    }
}

function addPullAndLock(group, leaf, pull, dark) {
    const ox = leaf.outer[0];
    const face = -1.4;
    const xMount = ox + 28;
    const xLock = ox + 24;
    const yLock = 1000;
    const half = 200;
    const y0 = yLock - half;
    const y1 = yLock + half;
    const tube = 10;
    const bend = 32;
    const roseT = 2.5;
    const z0 = face + roseT + tube;
    const zPlane = face + 36;
    const xBar = xMount + 74;
    const curve = new FacePullCurve(xMount, xBar, y0, y1, z0, zPlane, bend);
    addMesh(group, new THREE.TubeGeometry(curve, 140, tube, 20, false), pull, 0, 0, 0);
    [y0, y1].forEach((y) => {
        const rose = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, roseT, 24), pull);
        rose.rotation.x = Math.PI / 2;
        rose.position.set(xMount, y, face + roseT / 2);
        rose.castShadow = true;
        rose.receiveShadow = true;
        group.add(rose);
        addMesh(group, new THREE.SphereGeometry(tube, 24, 16), pull, xMount, y, z0);
    });
    const plate = 10;
    const pw = 28;
    const ph = 64;
    const r = 8;
    const x = xLock - pw / 2;
    const y = yLock - ph / 2;
    const shape = new THREE.Shape();
    shape.moveTo(x + r, y);
    shape.lineTo(x + pw - r, y);
    shape.absarc(x + pw - r, y + r, r, -Math.PI / 2, 0, false);
    shape.lineTo(x + pw, y + ph - r);
    shape.absarc(x + pw - r, y + ph - r, r, 0, Math.PI / 2, false);
    shape.lineTo(x + r, y + ph);
    shape.absarc(x + r, y + ph - r, r, Math.PI / 2, Math.PI, false);
    shape.lineTo(x, y + r);
    shape.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
    const bevelT = 1.2;
    const geom = new THREE.ExtrudeGeometry(shape, {
        depth: plate - bevelT * 2,
        bevelEnabled: true,
        bevelThickness: bevelT,
        bevelSize: 1.1,
        bevelSegments: 3,
        curveSegments: 10
    });
    geom.computeBoundingBox();
    geom.translate(0, 0, face + plate - geom.boundingBox.max.z);
    addMesh(group, geom, pull, 0, 0, 0);
    addBox(group, xLock - 1.4, yLock - 8, 2.8, 16, face + plate + 0.8, 1.1, dark, false);
}

function addPanicLatch(group, leaf, chrome, dark) {
    const ox = leaf.outer[0];
    const ow = leaf.outer[2];
    const cx = ox + ow - PUITE_LISA / 2;
    const y = 1400;
    const face = -SYVYYS;
    const bodyW = 28;
    const bodyH = 214;
    const bodyD = 3.2;
    const zFront = face - 0.35;
    const room = zFront - bodyD;

    const plate = (x, y0, w, h, z, depth, radius) => {
        const r = Math.min(radius, w / 2 - 0.1, h / 2 - 0.1);
        const shape = new THREE.Shape();
        const x1 = x + w;
        const y1 = y0 + h;
        shape.moveTo(x + r, y0);
        shape.lineTo(x1 - r, y0);
        shape.absarc(x1 - r, y0 + r, r, -Math.PI / 2, 0, false);
        shape.lineTo(x1, y1 - r);
        shape.absarc(x1 - r, y1 - r, r, 0, Math.PI / 2, false);
        shape.lineTo(x + r, y1);
        shape.absarc(x + r, y1 - r, r, Math.PI / 2, Math.PI, false);
        shape.lineTo(x, y0 + r);
        shape.absarc(x + r, y0 + r, r, Math.PI, Math.PI * 1.5, false);
        const bevel = 0.22;
        const geom = new THREE.ExtrudeGeometry(shape, {
            depth: Math.max(depth - bevel * 2, 0.35),
            bevelEnabled: true,
            bevelThickness: bevel,
            bevelSize: 0.18,
            bevelSegments: 2,
            curveSegments: 8
        });
        geom.computeBoundingBox();
        geom.translate(0, 0, z - geom.boundingBox.max.z);
        addMesh(group, geom, chrome, 0, 0, 0);
    };

    const slot = (x, y0, w, h) => {
        const r = w / 2;
        const depth = 1.5;
        const z = room - 0.15;
        addBox(group, x, y0 + r, w, h - w, z, depth, dark, false);
        [y0 + r, y0 + h - r].forEach((cy) => {
            const cap = new THREE.Mesh(new THREE.CylinderGeometry(r, r, depth, 18), dark);
            cap.rotation.x = Math.PI / 2;
            cap.position.set(x + r, cy, z - depth / 2);
            group.add(cap);
        });
    };

    plate(cx - bodyW / 2, y - bodyH / 2, bodyW, bodyH, zFront, bodyD, 1.6);
    plate(cx - 2.4, y - 36, 4.8, 118, room - 0.02, 1.15, 0.7);
    slot(cx - 9.4, y - 32, 3.2, 112);
    slot(cx + 6.2, y - 32, 3.2, 112);

    [-7.2, 7.2].forEach((dx) => {
        const sz = room - 0.7;
        const head = new THREE.Mesh(new THREE.CylinderGeometry(2.05, 2.05, 0.85, 20), chrome);
        head.rotation.x = Math.PI / 2;
        head.position.set(cx + dx, y - bodyH / 2 + 9, sz);
        head.castShadow = true;
        group.add(head);
        const across = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.32, 0.28), dark);
        across.position.set(cx + dx, y - bodyH / 2 + 9, sz - 0.45);
        group.add(across);
        const down = new THREE.Mesh(new THREE.BoxGeometry(0.32, 2.5, 0.28), dark);
        down.position.set(cx + dx, y - bodyH / 2 + 9, sz - 0.45);
        group.add(down);
    });

    const hingeY = y + bodyH / 2 - 34;
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, bodyW - 8, 12), chrome);
    pin.rotation.z = Math.PI / 2;
    pin.position.set(cx, hingeY, room - 0.6);
    pin.castShadow = true;
    group.add(pin);

    const pw = 24;
    const ph = 36;
    const pr = 0.7;
    const paddleShape = new THREE.Shape();
    paddleShape.moveTo(-pw / 2 + pr, 0);
    paddleShape.lineTo(pw / 2 - pr, 0);
    paddleShape.absarc(pw / 2 - pr, pr, pr, -Math.PI / 2, 0, false);
    paddleShape.lineTo(pw / 2, ph - pr);
    paddleShape.absarc(pw / 2 - pr, ph - pr, pr, 0, Math.PI / 2, false);
    paddleShape.lineTo(-pw / 2 + pr, ph);
    paddleShape.absarc(-pw / 2 + pr, ph - pr, pr, Math.PI / 2, Math.PI, false);
    paddleShape.lineTo(-pw / 2, pr);
    paddleShape.absarc(-pw / 2 + pr, pr, pr, Math.PI, Math.PI * 1.5, false);
    const paddleGeom = new THREE.ExtrudeGeometry(paddleShape, {
        depth: 1.35,
        bevelEnabled: true,
        bevelThickness: 0.08,
        bevelSize: 0.06,
        bevelSegments: 1,
        curveSegments: 4
    });
    paddleGeom.computeBoundingBox();
    paddleGeom.translate(0, 0, -paddleGeom.boundingBox.max.z);
    const paddle = new THREE.Mesh(paddleGeom, chrome);
    paddle.rotation.x = -0.07;
    paddle.position.set(cx, hingeY, room + 0.15);
    paddle.castShadow = true;
    paddle.receiveShadow = true;
    group.add(paddle);
}

function addLeaf(group, leaf, steel, kick, glassMat) {
    const leafFront = -1.4;
    leaf.bars.forEach((pts) => addExtrude(group, pts, leafFront, SYVYYS - 1.4, steel, true));
    const [px, py, pw, ph] = leaf.plate;
    addBox(group, px, py, pw, ph, 2.6, 2.4, kick, true);
    addBox(group, px, py, pw, ph, -SYVYYS - 0.2, 2.4, kick, true);
    const [gx, gy, gw, gh] = leaf.glass;
    addBox(group, gx, gy, gw, gh, -22, LASI_T, glassMat);
    addBead(group, gx, gy, gw, gh, steel);
}

function buildDoor(spec, steel, kick, glassMat, gapMat, silver, brass, pull) {
    const group = new THREE.Group();
    miteredFrame(0, 0, spec.leveys, spec.korkeus, KARMI, KARMI, KARMI, KARMI).forEach((pts) => {
        addExtrude(group, pts, 0, SYVYYS, steel, true);
    });
    addShadowGaps(group, spec, gapMat);
    const sidePad = W_KAYNTI / 2;
    if (spec.pair) {
        const meet = W_PARI - W_KAYNTI;
        const left = leafGeom(spec, sidePad, spec.lisa, PUITE, PUITE_LISA);
        const right = leafGeom(spec, sidePad + spec.lisa + meet, spec.kaynti, PUITE, PUITE);
        addLeaf(group, left, steel, kick, glassMat);
        addLeaf(group, right, steel, kick, glassMat);
        addHinges(group, spec.korkeus, spec.leveys, steel, silver, brass, true);
        addPullAndLock(group, right, pull, gapMat);
        addPanicLatch(group, left, chrome, gapMat);
    } else {
        const leaf = leafGeom(spec, sidePad, spec.kaynti, PUITE, PUITE);
        addLeaf(group, leaf, steel, kick, glassMat);
        addHinges(group, spec.korkeus, spec.leveys, steel, silver, brass, false);
        addPullAndLock(group, leaf, pull, gapMat);
    }
    if (spec.vasen) {
        group.scale.set(-0.001, 0.001, 0.001);
        group.position.x = spec.leveys * 0.001;
    } else {
        group.scale.setScalar(0.001);
    }
    return group;
}

const host = $("nakyma");
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
host.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = null;
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.28;
pmrem.dispose();

const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 20);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0.74, 1.15, 0);

scene.add(new THREE.AmbientLight(0xffffff, 0.16));
const key = new THREE.DirectionalLight(0xfff4e8, 1.35);
key.position.set(1.6, 3.1, 3.4);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = 0.4;
key.shadow.camera.far = 12;
key.shadow.camera.left = -1.6;
key.shadow.camera.right = 1.6;
key.shadow.camera.top = 2.2;
key.shadow.camera.bottom = -0.4;
key.shadow.bias = -0.00015;
scene.add(key);
scene.add(key.target);
const fill = new THREE.DirectionalLight(0xd5e2ee, 0.28);
fill.position.set(-2.4, 1.4, 2.2);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xffffff, 0.3);
rim.position.set(-0.4, 2.2, -2.6);
scene.add(rim);

const steel = new THREE.MeshPhysicalMaterial({
    color: $("vari").value,
    roughness: 0.55,
    metalness: 0.02,
    clearcoat: 0.08,
    clearcoatRoughness: 0.55,
    envMapIntensity: 0.22
});
const kick = new THREE.MeshPhysicalMaterial({
    color: 0xc5c8c4,
    roughness: 0.22,
    metalness: 0.06,
    clearcoat: 0.4,
    clearcoatRoughness: 0.2,
    envMapIntensity: 0.55
});
const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xe7eef2,
    roughness: 0.04,
    metalness: 0,
    transmission: 0.55,
    thickness: 0.018,
    ior: 1.5,
    transparent: true,
    envMapIntensity: 1.1
});
const gapMat = new THREE.MeshStandardMaterial({ color: 0x07080a, roughness: 1, metalness: 0 });
const silver = new THREE.MeshPhysicalMaterial({
    color: 0xe8ebef,
    roughness: 0.16,
    metalness: 1,
    envMapIntensity: 1
});
const chrome = new THREE.MeshPhysicalMaterial({
    color: 0xf7f8fa,
    roughness: 0.08,
    metalness: 1,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    envMapIntensity: 0.72
});
const pull = new THREE.MeshPhysicalMaterial({
    color: 0xd5d8dc,
    roughness: 0.32,
    metalness: 1,
    envMapIntensity: 0.85
});
const brass = new THREE.MeshPhysicalMaterial({
    color: 0xc6a15a,
    roughness: 0.28,
    metalness: 1,
    envMapIntensity: 0.9
});
[steel, kick, glassMat, gapMat, silver, chrome, pull, brass].forEach((material) => {
    material.side = THREE.DoubleSide;
});

let door = null;

function frameCamera() {
    const s = readSpec();
    const cx = (s.leveys || 1480) * 0.0005;
    const cy = (s.korkeus || 2310) * 0.0005;
    controls.target.set(cx, cy, -0.03);
    camera.position.set(cx - 0.55, cy * 0.58, 3.55);
    key.target.position.set(cx, cy, 0);
    controls.update();
}

function rebuild() {
    const spec = readSpec();
    const dim = validate(spec);
    const msg = [ralError, dim].filter(Boolean).join(" ");
    $("virhe").hidden = !msg;
    $("virhe").textContent = msg;
    if (dim) return;
    steel.color.set(spec.vari);
    if (door) {
        scene.remove(door);
        door.traverse((obj) => {
            if (obj.geometry) obj.geometry.dispose();
        });
    }
    door = buildDoor(spec, steel, kick, glassMat, gapMat, silver, brass, pull);
    scene.add(door);
}

function resize() {
    const w = host.clientWidth;
    const h = host.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
}

document.getElementById("mitat").addEventListener("input", (event) => {
    if (syncing) return;
    syncing = true;
    if (event.target.id === "ral") applyRal();
    else if (event.target.id === "vari") matchRalFromColor();
    else if (event.target.id === "oviaukko") applyOpeningInput(false);
    else if (event.target.name === "tyyppi") applyTypeChange();
    else if (event.target.name === "katisyys") syncOpeningHand();
    else {
        typeError = "";
        applySync(event.target.id);
    }
    syncing = false;
    rebuild();
});

$("oviaukko").addEventListener("blur", () => {
    if (syncing) return;
    syncing = true;
    applyOpeningInput(true);
    syncing = false;
    rebuild();
});

window.addEventListener("resize", resize);
rebuild();
frameCamera();
resize();

renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
});
