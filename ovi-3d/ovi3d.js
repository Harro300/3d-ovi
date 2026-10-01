import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import { computeSurface } from "./pinnat.js?v=40";

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
const HANDOFF_KEY = "ovi-siirto";
let syncing = false;
let ralError = "";
let openingError = "";
let typeError = "";
let openingLock = null;
let viewMode = "studio";
let wallType = "betoni";
const WALL_TYPES = ["betoni", "rappaus", "kerrostalo"];

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

function readHandoff() {
    try {
        const raw = sessionStorage.getItem(HANDOFF_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (err) {
        return null;
    }
}

function writeHandoff(data) {
    sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(data));
}

function captureRestore() {
    return {
        oviaukko: $("oviaukko").value,
        tyyppi: doorType(),
        katisyys: hand(),
        kaynti: $("kaynti").value,
        lisa: $("lisa").value,
        valoH: $("valoH").value,
        leveys: $("leveys").value,
        korkeus: $("korkeus").value,
        potku: $("potku").value,
        vari: $("vari").value,
        ral: $("ral").value,
        nakyma: viewMode,
        seina: wallType
    };
}

function setRadio(name, value) {
    const input = document.querySelector('input[name="' + name + '"][value="' + value + '"]');
    if (input) input.checked = true;
}

function specFor2d() {
    const s = readSpec();
    const ral = $("ral").value.replace(/\D/g, "");
    return {
        tyyppi: $("oviaukko").value.trim(),
        ovityyppi: s.pair ? "pariovi" : "kayntiovi",
        saranapuoli: s.vasen ? "vasen" : "oikea",
        leveys: s.leveys,
        korkeus: s.korkeus,
        potkulevy_h: s.potku,
        valoaukko_w: s.kaynti,
        valoaukko_h: s.valoH,
        lisaovi_valoaukko_w: s.pair ? s.lisa : 0,
        lukko_h: 1000,
        lasi: { paksuus: LASI_T, enabled: true },
        vari: RAL[ral] ? "RAL " + ral : ""
    };
}

function siirra() {
    const dim = validate(readSpec());
    const msg = [ralError, dim].filter(Boolean).join(" ");
    $("virhe").hidden = !msg;
    $("virhe").textContent = msg;
    if (dim) return;
    const prev = readHandoff() || {};
    writeHandoff({
        spec: specFor2d(),
        restore3d: captureRestore(),
        extras: prev.extras || null
    });
    location.href = "../index.html";
}

function restore3dIfAny() {
    const data = readHandoff();
    const saved = data && data.restore3d;
    if (!saved) return;
    syncing = true;
    $("oviaukko").value = saved.oviaukko || "";
    $("kaynti").value = saved.kaynti ?? "";
    $("lisa").value = saved.lisa ?? "";
    $("valoH").value = saved.valoH ?? "";
    $("leveys").value = saved.leveys ?? "";
    $("korkeus").value = saved.korkeus ?? "";
    $("potku").value = saved.potku ?? "";
    if (saved.vari) $("vari").value = saved.vari;
    $("ral").value = saved.ral || "";
    setDoorType(saved.tyyppi === "kayntiovi" ? "kayntiovi" : "pariovi");
    setHand(saved.katisyys === "vasen" ? "vasen" : "oikea");
    viewMode = saved.nakyma === "seina" ? "seina" : "studio";
    const savedWall = saved.seina === "tiili" ? "kerrostalo" : saved.seina;
    if (WALL_TYPES.includes(savedWall)) wallType = savedWall;
    setRadio("nakymatila", viewMode);
    setRadio("seina", wallType);
    const parsed = parseOpening($("oviaukko").value);
    if (parsed.state === "ok") {
        openingLock = {
            wMod: parsed.wMod,
            hMod: parsed.hMod,
            leveys: parsed.leveys,
            korkeus: parsed.korkeus
        };
        setLockedBounds(true);
    } else {
        clearLock();
    }
    syncLisa();
    const ral = $("ral").value.replace(/\D/g, "");
    ralError = ral.length === 4 && !RAL[ral] ? "RAL " + ral + " ei ole tuettu." : "";
    syncing = false;
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
        bevelSegments: bevel ? 4 : 0,
        curveSegments: 1
    });
    geom.computeBoundingBox();
    geom.translate(0, 0, zFront - geom.boundingBox.max.z);
    const mesh = new THREE.Mesh(geom, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
}

function addBox(group, x, y, w, h, zFront, depth, material, bevel) {
    return addExtrude(group, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], zFront, depth, material, bevel);
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

function addGlassSpacer(group, gx, gy, gw, gh, material) {
    const s = 6;
    const zFront = -27;
    const depth = 8;
    addBox(group, gx, gy + gh - s, gw, s, zFront, depth, material);
    addBox(group, gx, gy, gw, s, zFront, depth, material);
    addBox(group, gx, gy + s, s, gh - 2 * s, zFront, depth, material);
    addBox(group, gx + gw - s, gy + s, s, gh - 2 * s, zFront, depth, material);
}

function addBead(group, gx, gy, gw, gh, material, zFront, depth) {
    const b = 12;
    const o = 2;
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

function addLeaf(group, leaf, m) {
    const leafFront = -1.4;
    const glassFront = -22;
    leaf.bars.forEach((pts) => addExtrude(group, pts, leafFront, SYVYYS - 1.4, m.steel, true));
    const [px, py, pw, ph] = leaf.plate;
    addBox(group, px, py, pw, ph, 2.6, 2.4, m.kick, true);
    addBox(group, px, py, pw, ph, -SYVYYS - 0.2, 2.4, m.kick, true);
    const [gx, gy, gw, gh] = leaf.glass;
    addBox(group, gx, gy, gw, gh, glassFront, LASI_T, m.glass).castShadow = false;
    addGlassSpacer(group, gx, gy, gw, gh, m.spacer);
    addBead(group, gx, gy, gw, gh, m.steel, -0.35, -0.35 - glassFront);
    addBead(group, gx, gy, gw, gh, m.steel, glassFront - LASI_T, SYVYYS - 0.6 + glassFront - LASI_T);
}

function buildDoor(spec, m) {
    const group = new THREE.Group();
    miteredFrame(0, 0, spec.leveys, spec.korkeus, KARMI, KARMI, KARMI, KARMI).forEach((pts) => {
        addExtrude(group, pts, 0, SYVYYS, m.steel, true);
    });
    addShadowGaps(group, spec, m.gap);
    const sidePad = W_KAYNTI / 2;
    if (spec.pair) {
        const meet = W_PARI - W_KAYNTI;
        const left = leafGeom(spec, sidePad, spec.lisa, PUITE, PUITE_LISA);
        const right = leafGeom(spec, sidePad + spec.lisa + meet, spec.kaynti, PUITE, PUITE);
        addLeaf(group, left, m);
        addLeaf(group, right, m);
        addHinges(group, spec.korkeus, spec.leveys, m.hinge, m.silver, m.brass, true);
        addPullAndLock(group, right, m.pull, m.gap);
        addPanicLatch(group, left, m.chrome, m.gap);
    } else {
        const leaf = leafGeom(spec, sidePad, spec.kaynti, PUITE, PUITE);
        addLeaf(group, leaf, m);
        addHinges(group, spec.korkeus, spec.leveys, m.hinge, m.silver, m.brass, false);
        addPullAndLock(group, leaf, m.pull, m.gap);
    }
    if (spec.vasen) {
        group.scale.set(-0.001, 0.001, 0.001);
        group.position.x = spec.leveys * 0.001;
    } else {
        group.scale.setScalar(0.001);
    }
    return group;
}

function dataTexture(data, w, h, srgb) {
    const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = maxAniso;
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
}

// Surface maps are computed in a worker (pinnat.js) and cached; `surface(name)` is synchronous
// and only valid after `loadSurfaces` has resolved for that name.
const surfaces = {};
const surfaceJobs = {};
let surfaceWorker = null;
let surfaceJobId = 0;
const surfaceReplies = new Map();
try {
    surfaceWorker = new Worker(new URL("./pinnat-tyo.js?v=40", import.meta.url), { type: "module" });
    surfaceWorker.onmessage = (event) => {
        surfaceReplies.get(event.data.id)?.resolve(event.data.result);
        surfaceReplies.delete(event.data.id);
    };
    surfaceWorker.onerror = () => {
        surfaceWorker = null;
        surfaceReplies.forEach((job) => job.fallback());
        surfaceReplies.clear();
    };
} catch {
    surfaceWorker = null;
}

function computeInWorker(name, args) {
    const local = () => computeSurface(name, args);
    if (!surfaceWorker) return Promise.resolve().then(local);
    return new Promise((resolve) => {
        const id = ++surfaceJobId;
        surfaceReplies.set(id, { resolve, fallback: () => resolve(local()) });
        surfaceWorker.postMessage({ id, name, args });
    });
}

function toMaps(raw) {
    const maps = {
        normalMap: dataTexture(raw.normal, raw.w, raw.h, false),
        roughnessMap: dataTexture(raw.rough, raw.w, raw.h, false)
    };
    if (raw.color) maps.map = dataTexture(raw.color, raw.w, raw.h, true);
    Object.values(maps).forEach((tex) => tex.repeat.set(raw.repeat[0], raw.repeat[1]));
    return maps;
}

function loadSurfaces(names) {
    return Promise.all(names.map((name) => {
        if (!surfaceJobs[name]) {
            const args = name === "lattia" ? [FLOOR_SIZE] : [];
            surfaceJobs[name] = computeInWorker(name, args).then((raw) => {
                surfaces[name] = toMaps(raw);
            });
        }
        return surfaceJobs[name];
    }));
}

function surface(name) {
    return surfaces[name];
}

const doorSurfaces = loadSurfaces(["pulveri", "harjattu"]);

function textTexture(text, w, h, font, color, background) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (background) {
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, w, h);
    }
    ctx.fillStyle = color;
    ctx.font = font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, w / 2, h / 2 + h * 0.03);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAniso;
    return tex;
}

// Warm room glow seen through a window: brighter towards the ceiling lamp, darker at the sill.
function litWindowTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    const v = ctx.createLinearGradient(0, 0, 0, 128);
    v.addColorStop(0, "#ffffff");
    v.addColorStop(0.55, "#a8a8a8");
    v.addColorStop(1, "#4a4a4a");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, 128, 128);
    const r = ctx.createRadialGradient(80, 20, 4, 80, 20, 110);
    r.addColorStop(0, "rgba(255,255,255,0.55)");
    r.addColorStop(1, "rgba(0,0,0,0.35)");
    ctx.fillStyle = r;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

// Intercom face: colour layer and a glow layer for the display and key backlights.
function intercomTextures() {
    const w = 256;
    const h = 512;
    const face = document.createElement("canvas");
    const glow = document.createElement("canvas");
    face.width = glow.width = w;
    face.height = glow.height = h;
    const f = face.getContext("2d");
    const g = glow.getContext("2d");
    const metal = f.createLinearGradient(0, 0, w, h);
    metal.addColorStop(0, "#b9bdc1");
    metal.addColorStop(0.5, "#d2d5d8");
    metal.addColorStop(1, "#aeb2b6");
    f.fillStyle = metal;
    f.fillRect(0, 0, w, h);
    g.fillStyle = "#000";
    g.fillRect(0, 0, w, h);
    f.fillStyle = "#1c1f22";
    for (let r = 0; r < 6; r++) {
        for (let c = 0; c < 7; c++) {
            f.beginPath();
            f.arc(56 + c * 24, 44 + r * 18, 4, 0, Math.PI * 2);
            f.fill();
        }
    }
    f.fillStyle = "#0b0e12";
    f.fillRect(40, 172, 176, 92);
    g.fillStyle = "#3d6f9e";
    g.fillRect(44, 176, 168, 84);
    g.fillStyle = "#cfe6ff";
    g.font = "600 22px Segoe UI, sans-serif";
    g.textAlign = "center";
    g.fillText("TERVETULOA", w / 2, 212);
    g.font = "400 16px Segoe UI, sans-serif";
    g.fillText("Valitse asukas", w / 2, 240);
    const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];
    keys.forEach((label, k) => {
        const cx = 72 + (k % 3) * 56;
        const cy = 304 + Math.floor(k / 3) * 46;
        f.fillStyle = "#9fa4a9";
        f.beginPath();
        f.arc(cx, cy, 17, 0, Math.PI * 2);
        f.fill();
        f.strokeStyle = "#7c8186";
        f.lineWidth = 2;
        f.stroke();
        f.fillStyle = "#2a2d31";
        f.font = "600 16px Segoe UI, sans-serif";
        f.textAlign = "center";
        f.textBaseline = "middle";
        f.fillText(label, cx, cy + 1);
        g.strokeStyle = "#5a86b0";
        g.lineWidth = 2;
        g.beginPath();
        g.arc(cx, cy, 17, 0, Math.PI * 2);
        g.stroke();
    });
    const map = new THREE.CanvasTexture(face);
    map.colorSpace = THREE.SRGBColorSpace;
    const emissiveMap = new THREE.CanvasTexture(glow);
    emissiveMap.colorSpace = THREE.SRGBColorSpace;
    return { map, emissiveMap };
}

function studioEnvironment() {
    const env = new THREE.Scene();
    const room = new THREE.Mesh(
        new THREE.BoxGeometry(24, 12, 24),
        new THREE.MeshBasicMaterial({ color: 0x141518, side: THREE.BackSide })
    );
    room.position.y = 4;
    env.add(room);
    const panel = (w, h, intensity, x, y, z, tint) => {
        const material = new THREE.MeshBasicMaterial({
            color: new THREE.Color(tint).multiplyScalar(intensity),
            side: THREE.DoubleSide
        });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
        mesh.position.set(x, y, z);
        mesh.lookAt(0, 1.2, 0);
        env.add(mesh);
    };
    panel(4.2, 2.6, 7, -3.2, 4.6, 4.4, 0xfffaf4);
    panel(1.1, 5, 3.2, 5.2, 2.4, 2.2, 0xeef3ff);
    panel(1, 5, 2, -6, 2.6, -1.5, 0xffffff);
    panel(9, 9, 0.45, 0, 7.8, 0, 0xffffff);
    panel(7, 2.2, 0.55, 0.6, 0.9, 7, 0xf2efe9);
    panel(0.22, 5, 4.5, 1.4, 2.2, 5.8, 0xffffff);
    panel(14, 14, 0.2, 0, -1.5, 0, 0xd8d2c8);
    return env;
}

const host = $("nakyma");
const kehys = $("kehys");
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;
renderer.shadowMap.autoUpdate = false;
host.appendChild(renderer.domElement);
const maxAniso = renderer.capabilities.getMaxAnisotropy();

const BG = 0x101114;
const scene = new THREE.Scene();
scene.background = new THREE.Color(BG);
scene.fog = new THREE.Fog(BG, 9, 22);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(studioEnvironment(), 0.012).texture;
scene.environmentIntensity = 0.85;
pmrem.dispose();

const camera = new THREE.PerspectiveCamera(26, 1, 0.02, 60);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.rotateSpeed = 0.7;
controls.minDistance = 0.35;
controls.maxDistance = 14;
controls.maxPolarAngle = 1.72;

RectAreaLightUniformsLib.init();
const hemi = new THREE.HemisphereLight(0xeef1f4, 0x28282a, 0.3);
scene.add(hemi);
const softbox = new THREE.RectAreaLight(0xfffbf7, 5, 2.6, 1.8);
scene.add(softbox);
const key = new THREE.SpotLight(0xfffaf3, 60, 0, 0.52, 1, 2);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = 1;
key.shadow.camera.far = 14;
key.shadow.bias = -0.0001;
key.shadow.normalBias = 0.0008;
key.shadow.radius = 7;
key.shadow.blurSamples = 16;
key.shadow.intensity = 0.8;
scene.add(key, key.target);
const fill = new THREE.DirectionalLight(0xdde6f2, 0.32);
scene.add(fill, fill.target);
const rim = new THREE.DirectionalLight(0xffffff, 0.55);
scene.add(rim, rim.target);
const canopyLight = new THREE.SpotLight(0xffd9b0, 0, 0, 1.15, 0.9, 2);
scene.add(canopyLight, canopyLight.target);

const composerTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, composerTarget);
composer.addPass(new RenderPass(scene, camera));
const gtao = new GTAOPass(scene, camera, 1, 1);
gtao.blendIntensity = 1;
gtao.updateGtaoMaterial({ radius: 0.16, distanceExponent: 1.6, thickness: 1.5, distanceFallOff: 1, scale: 1.35, samples: 16 });
gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 16 });
composer.addPass(gtao);
composer.addPass(new OutputPass());

await doorSurfaces;
const peel = surface("pulveri");
const brushed = surface("harjattu");

const mats = {
    steel: new THREE.MeshPhysicalMaterial({
        color: $("vari").value,
        roughness: 1,
        roughnessMap: peel.roughnessMap,
        normalMap: peel.normalMap,
        normalScale: new THREE.Vector2(1.6, 1.6),
        metalness: 0,
        sheen: 0.18,
        sheenRoughness: 0.8,
        sheenColor: 0xffffff
    }),
    hinge: new THREE.MeshPhysicalMaterial({
        color: $("vari").value,
        roughness: 0.62,
        metalness: 0,
        sheen: 0.18,
        sheenRoughness: 0.8,
        sheenColor: 0xffffff
    }),
    kick: new THREE.MeshPhysicalMaterial({
        color: 0xc4c7ca,
        map: brushed.map,
        roughness: 1,
        roughnessMap: brushed.roughnessMap,
        metalness: 1,
        anisotropy: 0.7,
        anisotropyRotation: Math.PI / 2
    }),
    glass: new THREE.MeshPhysicalMaterial({
        color: 0xe2e9e6,
        roughness: 0,
        metalness: 0,
        transmission: 1,
        thickness: LASI_T,
        ior: 1.52,
        attenuationColor: 0xd4ebe0,
        attenuationDistance: 0.22,
        specularIntensity: 1
    }),
    spacer: new THREE.MeshStandardMaterial({ color: 0x1b1c1f, roughness: 0.55, metalness: 0.4 }),
    gap: new THREE.MeshStandardMaterial({ color: 0x0c0d0f, roughness: 0.9, metalness: 0 }),
    silver: new THREE.MeshPhysicalMaterial({ color: 0xdfe2e6, roughness: 0.22, metalness: 1 }),
    chrome: new THREE.MeshPhysicalMaterial({
        color: 0xf4f5f7,
        roughness: 0.07,
        metalness: 1,
        clearcoat: 1,
        clearcoatRoughness: 0.04
    }),
    pull: new THREE.MeshPhysicalMaterial({
        color: 0xcfd2d6,
        roughness: 0.3,
        metalness: 1,
        anisotropy: 0.55
    }),
    brass: new THREE.MeshPhysicalMaterial({ color: 0xc6a15a, roughness: 0.3, metalness: 1 })
};
Object.entries(mats).forEach(([name, material]) => {
    if (name !== "glass") material.side = THREE.DoubleSide;
});

// Cyclorama: floor sweeping up into a backdrop, profile in (z, y).
function sweepGeometry(width, front, back, radius, height, steps) {
    const profile = [[front, 0], [back + radius, 0]];
    for (let i = 1; i <= steps; i++) {
        const a = (i / steps) * Math.PI / 2;
        profile.push([back + radius - Math.sin(a) * radius, radius - Math.cos(a) * radius]);
    }
    profile.push([back, height]);
    const pos = [];
    const uv = [];
    const index = [];
    let run = 0;
    profile.forEach((p, i) => {
        if (i) run += Math.hypot(p[0] - profile[i - 1][0], p[1] - profile[i - 1][1]);
        pos.push(-width / 2, p[1], p[0], width / 2, p[1], p[0]);
        uv.push(0, run, 1, run);
    });
    for (let i = 0; i < profile.length - 1; i++) {
        const a = i * 2;
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geom.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geom.setIndex(index);
    geom.computeVertexNormals();
    return geom;
}

const studioSet = new THREE.Mesh(
    sweepGeometry(18, 9, -2.8, 1.8, 8, 32),
    new THREE.MeshStandardMaterial({ color: 0x3a3b3f, roughness: 0.9, metalness: 0, side: THREE.DoubleSide })
);
studioSet.receiveShadow = true;
scene.add(studioSet);

const V2 = (x, y) => new THREE.Vector2(x, y);
const WALL_UV = {
    generateTopUV(geometry, v, a, b, c) {
        return [a, b, c].map((k) => V2(v[k * 3], v[k * 3 + 1]));
    },
    generateSideWallUV(geometry, v, a, b, c, d) {
        const horizontal = Math.abs(v[a * 3 + 1] - v[b * 3 + 1]) < Math.abs(v[a * 3] - v[b * 3]);
        return [a, b, c, d].map((k) => horizontal
            ? V2(v[k * 3], v[k * 3 + 2])
            : V2(v[k * 3 + 2], v[k * 3 + 1]));
    }
};

function extrudeWorld(pts, zFront, depth, material) {
    const shape = Array.isArray(pts) ? shapeFrom(pts) : pts;
    const geom = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, UVGenerator: WALL_UV });
    geom.translate(0, 0, zFront - depth);
    const mesh = new THREE.Mesh(geom, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
}

const wallMats = {};
let floorMat = null;
let entranceMats = null;
const NIGHT_BG = 0x0a0d14;
const FLOOR_SIZE = 26;
const sealantMat = new THREE.MeshStandardMaterial({ color: 0x2a2b2e, roughness: 0.75, metalness: 0 });

function wallMaterial(type) {
    if (!wallMats[type]) {
        wallMats[type] = new THREE.MeshStandardMaterial({ ...surface(type), roughness: 1, metalness: 0 });
    }
    return wallMats[type];
}

function floorMaterial() {
    if (!floorMat) floorMat = new THREE.MeshStandardMaterial({ ...surface("lattia"), roughness: 1, metalness: 0 });
    return floorMat;
}

function isEntrance() {
    return viewMode === "seina" && wallType === "kerrostalo";
}

function neededSurfaces() {
    if (viewMode !== "seina") return [];
    return wallType === "kerrostalo" ? ["rappaus", "paneeli"] : [wallType, "lattia"];
}

function texturesPending() {
    return neededSurfaces().some((name) => !surfaces[name]);
}

function entranceHeight(H) {
    return Math.max(H + 0.55, 2.7);
}

function entranceMaterials() {
    if (entranceMats) return entranceMats;
    const intercom = intercomTextures();
    entranceMats = {
        panel: new THREE.MeshStandardMaterial({ ...surface("paneeli"), roughness: 1, metalness: 0 }),
        canopy: new THREE.MeshStandardMaterial({ color: 0x232528, roughness: 0.55, metalness: 0.5 }),
        slab: new THREE.MeshStandardMaterial({ color: 0x8c8984, roughness: 0.88, metalness: 0 }),
        ground: new THREE.MeshStandardMaterial({ color: 0x2a2b2d, roughness: 0.95, metalness: 0 }),
        doormat: new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 1, metalness: 0 }),
        plinth: new THREE.MeshStandardMaterial({ color: 0x4c4e51, roughness: 0.9, metalness: 0 }),
        frame: new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.5, metalness: 0.4 }),
        window: new THREE.MeshPhysicalMaterial({ color: 0x151a22, roughness: 0.04, metalness: 0, specularIntensity: 1 }),
        windowLit: new THREE.MeshStandardMaterial({
            color: 0x1a140e,
            emissive: 0xffd2a0,
            emissiveMap: litWindowTexture(),
            emissiveIntensity: 0.42,
            roughness: 0.3
        }),
        lamp: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe2bd).multiplyScalar(4) }),
        room: new THREE.MeshStandardMaterial({ color: 0xd2cabd, roughness: 0.92, emissive: 0x6e5840, side: THREE.BackSide }),
        stair: new THREE.MeshStandardMaterial({ color: 0xa39d93, roughness: 0.8, emissive: 0x3a2e20 }),
        steelPlate: new THREE.MeshPhysicalMaterial({ color: 0xcfd2d5, roughness: 0.32, metalness: 1 }),
        intercom: new THREE.MeshStandardMaterial({
            map: intercom.map,
            emissiveMap: intercom.emissiveMap,
            emissive: 0xffffff,
            emissiveIntensity: 1.2,
            roughness: 0.35,
            metalness: 0.6
        }),
        letter: new THREE.MeshStandardMaterial({ color: 0xe6e4df, roughness: 0.45, metalness: 0.1, emissive: 0x24211c }),
        number: new THREE.MeshStandardMaterial({
            map: textTexture("12", 256, 128, "600 84px Segoe UI, sans-serif", "#e9e7e2", "#202225"),
            roughness: 0.5,
            metalness: 0.3
        })
    };
    return entranceMats;
}

function worldBox(group, x0, y0, z0, x1, y1, z1, material, castShadow = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), material);
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
}

function worldPlane(group, w, h, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
}

function addLamp(group, x, y, z, material) {
    const disk = new THREE.Mesh(new THREE.CircleGeometry(0.045, 24), material);
    disk.rotation.x = Math.PI / 2;
    disk.position.set(x, y - 0.002, z);
    group.add(disk);
}

// Apartment building entrance: the door sits at the back of a clad recess under a canopy.
// Facade face is at z = D, the door front at z = 0, the landing top at the threshold (y = 0).
function buildEntranceSet(spec) {
    const m = entranceMaterials();
    const L = spec.leveys / 1000;
    const H = spec.korkeus / 1000;
    const cx = L / 2;
    const j = 0.01;
    const D = 1.2;
    const F = 0.3;
    const rx0 = -0.8;
    const rx1 = L + 0.8;
    const RH = entranceHeight(H);
    const G = -0.15;
    const fx0 = cx - 7.5;
    const fx1 = cx + 7.5;
    const FH = 6.8;
    const group = new THREE.Group();

    const facade = shapeFrom([[fx0, G], [rx0, G], [rx0, RH], [rx1, RH], [rx1, G], [fx1, G], [fx1, FH], [fx0, FH]]);
    const wl = rx0 - 2.7;
    const wr = rx1 + 1.0;
    const windows = [
        [wl, 0.85, false], [wr, 0.85, true], [wl - 2.6, 0.85, false], [wr + 2.6, 0.85, false],
        [wl, 3.75, true], [wr, 3.75, false], [wl - 2.6, 3.75, false], [wr + 2.6, 3.75, true]
    ].map(([x, y, lit]) => [x, y, 1.7, 1.5, lit]);
    windows.push([cx - 0.55, RH + 0.75, 1.1, 2.6, true]);
    windows.forEach(([x, y, w, h]) => {
        facade.holes.push(new THREE.Path([V2(x, y), V2(x + w, y), V2(x + w, y + h), V2(x, y + h)]));
    });
    group.add(extrudeWorld(facade, D, F, wallMaterial("rappaus")));
    windows.forEach(([x, y, w, h, lit]) => {
        const zf = D - 0.08;
        const t = 0.06;
        worldBox(group, x, y, zf - 0.08, x + w, y + t, zf, m.frame, false);
        worldBox(group, x, y + h - t, zf - 0.08, x + w, y + h, zf, m.frame, false);
        worldBox(group, x, y + t, zf - 0.08, x + t, y + h - t, zf, m.frame, false);
        worldBox(group, x + w - t, y + t, zf - 0.08, x + w, y + h - t, zf, m.frame, false);
        if (w > 1.5) worldBox(group, x + w / 2 - t / 2, y + t, zf - 0.08, x + w / 2 + t / 2, y + h - t, zf, m.frame, false);
        worldPlane(group, w - 2 * t, h - 2 * t, x + w / 2, y + h / 2, zf - 0.05, lit ? m.windowLit : m.window);
    });
    worldBox(group, fx0, G, D, rx0, 0.35, D + 0.02, m.plinth, false);
    worldBox(group, rx1, G, D, fx1, 0.35, D + 0.02, m.plinth, false);

    worldBox(group, rx0 - 0.15, 0, 0, rx0, RH, D - F, m.panel);
    worldBox(group, rx1, 0, 0, rx1 + 0.15, RH, D - F, m.panel);
    worldBox(group, rx0, RH, 0, rx1, RH + 0.3, D - F, m.panel);
    group.add(extrudeWorld(
        [[rx0, 0], [-j, 0], [-j, H + j], [L + j, H + j], [L + j, 0], [rx1, 0], [rx1, RH], [rx0, RH]],
        0, 0.2, m.panel
    ));
    group.add(extrudeWorld(
        [[-j, 0], [-j, H + j], [L + j, H + j], [L + j, 0], [L, 0], [L, H], [0, H], [0, 0]],
        -0.004, 0.192, sealantMat
    ));

    worldBox(group, rx0 - 0.6, RH, D, rx1 + 0.6, RH + 0.22, D + 1.5, m.canopy);
    worldBox(group, rx0 - 0.6, G, -0.2, rx1 + 0.6, 0, D + 1.5, m.slab, false);
    worldBox(group, -0.1, 0, 0.12, L + 0.1, 0.008, 1.0, m.doormat, false);
    const ground = worldPlane(group, 30, 30, cx, G, D + 4, m.ground);
    ground.rotation.x = -Math.PI / 2;

    addLamp(group, cx, RH, 0.42, m.lamp);
    addLamp(group, cx - 0.9, RH, D + 0.8, m.lamp);
    addLamp(group, cx + 0.9, RH, D + 0.8, m.lamp);

    const roomX0 = -1.2;
    const roomX1 = L + 1.2;
    const room = worldBox(group, roomX0, 0, -4, roomX1, 3, -0.21, m.room, false);
    room.receiveShadow = false;
    for (let i = 0; i < 9; i++) {
        const x = roomX0 + 0.4 + i * 0.28;
        worldBox(group, x, 0, -3.95, x + 0.28, (i + 1) * 0.17, -2.75, m.stair, false);
    }
    addLamp(group, cx, 3, -2.2, m.lamp);

    const lockSide = spec.pair ? (spec.vasen ? -1 : 1) : (spec.vasen ? 1 : -1);
    const ix = lockSide > 0 ? L + 0.4 : -0.4;
    worldBox(group, ix - 0.065, 1.22, 0, ix + 0.065, 1.48, 0.014, m.steelPlate);
    worldPlane(group, 0.122, 0.244, ix, 1.35, 0.0145, m.intercom);

    const ax = rx1 + 0.35;
    const ay = RH - 0.7;
    const s = 0.42;
    const letter = shapeFrom([[0, 0], [0.11, 0], [0.16, 0.14], [0.34, 0.14], [0.39, 0], [0.5, 0], [0.31, 0.5], [0.19, 0.5]]
        .map(([x, y]) => [ax + x * s * 2, ay + y * s * 2]));
    letter.holes.push(new THREE.Path([[0.19, 0.24], [0.31, 0.24], [0.25, 0.41]]
        .map(([x, y]) => V2(ax + x * s * 2, ay + y * s * 2))));
    const letterMesh = extrudeWorld(letter, D + 0.025, 0.025, m.letter);
    letterMesh.receiveShadow = false;
    group.add(letterMesh);
    worldBox(group, rx0 - 0.68, RH - 0.5, D, rx0 - 0.32, RH - 0.32, D + 0.012, m.number, false);
    return group;
}

// Door front is flush with the wall face; 10 mm installation joint on sides and top.
function buildWallSet(spec) {
    const L = spec.leveys / 1000;
    const H = spec.korkeus / 1000;
    const j = 0.01;
    const T = 0.2;
    const W = 11;
    const WH = 4.8;
    const x0 = L / 2 - W / 2;
    const x1 = L / 2 + W / 2;
    const group = new THREE.Group();
    group.add(extrudeWorld(
        [[x0, 0], [-j, 0], [-j, H + j], [L + j, H + j], [L + j, 0], [x1, 0], [x1, WH], [x0, WH]],
        0, T, wallMaterial(wallType)
    ));
    group.add(extrudeWorld(
        [[-j, 0], [-j, H + j], [L + j, H + j], [L + j, 0], [L, 0], [L, H], [0, H], [0, 0]],
        -0.004, T - 0.008, sealantMat
    ));
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE), floorMaterial());
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(L / 2, 0, 0);
    floor.receiveShadow = true;
    group.add(floor);
    return group;
}

function disposeGeometry(object) {
    object.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
    });
}

let wallSet = null;
let stageKey = "";

function updateStage(spec) {
    const cx = spec.leveys / 2000;
    const cy = spec.korkeus / 2000;
    const keyNow = [viewMode, wallType, spec.leveys, spec.korkeus, spec.pair, spec.vasen].join("|");
    if (keyNow === stageKey) return false;
    stageKey = keyNow;
    studioSet.visible = viewMode === "studio";
    studioSet.position.x = cx;
    if (wallSet) {
        scene.remove(wallSet);
        disposeGeometry(wallSet);
        wallSet = null;
    }
    if (viewMode === "seina") {
        wallSet = isEntrance() ? buildEntranceSet(spec) : buildWallSet(spec);
        scene.add(wallSet);
    }
    const night = isEntrance();
    const bg = night ? NIGHT_BG : BG;
    scene.background.set(bg);
    scene.fog.color.set(bg);
    scene.fog.near = night ? 14 : 9;
    scene.fog.far = night ? 40 : 22;
    scene.environmentIntensity = night ? 0.16 : 0.85;
    renderer.toneMappingExposure = night ? 1.25 : 1.1;
    softbox.intensity = night ? 0 : 5;
    softbox.position.set(cx - 1.9, 2.9, 3.1);
    softbox.lookAt(cx, cy, 0);
    hemi.color.set(night ? 0x5d6d8c : 0xeef1f4);
    hemi.groundColor.set(night ? 0x0d0e10 : 0x28282a);
    hemi.intensity = night ? 0.14 : 0.3;
    rim.intensity = night ? 0 : 0.55;
    rim.position.set(cx - 1.6, 3.2, -3.6);
    rim.target.position.set(cx, cy, 0);
    if (night) {
        const RH = entranceHeight(spec.korkeus / 1000);
        key.color.set(0xffe2c4);
        key.intensity = 10;
        key.angle = 1.1;
        key.penumbra = 0.85;
        key.position.set(cx, RH - 0.03, 0.42);
        key.target.position.set(cx, 0, 0.55);
        key.shadow.camera.near = 0.05;
        key.shadow.radius = 4;
        fill.color.set(0x8ea4cc);
        fill.intensity = 0.22;
        fill.position.set(cx - 5, 7, 8);
        canopyLight.intensity = 8;
        canopyLight.position.set(cx, RH - 0.03, 2);
        canopyLight.target.position.set(cx, -0.15, 2.15);
    } else {
        canopyLight.intensity = 0;
        key.color.set(0xfffaf3);
        key.intensity = 60;
        key.angle = 0.52;
        key.penumbra = 1;
        key.position.set(cx - 2.3, 3.5, 3.6);
        key.target.position.set(cx, cy * 0.8, 0);
        key.shadow.camera.near = 1;
        key.shadow.radius = 7;
        fill.color.set(0xdde6f2);
        fill.intensity = 0.32;
        fill.position.set(cx + 3.6, 1.6, 3);
    }
    key.shadow.camera.updateProjectionMatrix();
    fill.target.position.set(cx, cy, 0);
    return true;
}

function updateInfo(spec) {
    const ral = $("ral").value.replace(/\D/g, "");
    const parts = [
        spec.pair ? "Pariovi" : "Käyntiovi",
        Math.round(spec.leveys) + " × " + Math.round(spec.korkeus) + " mm"
    ];
    if (RAL[ral]) parts.push("RAL " + ral);
    $("tieto").textContent = parts.join("  ·  ");
}

let door = null;
let doorKey = "";

let flight = null;
let dirty = true;

function invalidate() {
    dirty = true;
}

function cameraPose() {
    const s = readSpec();
    const L = (s.leveys || 1480) / 1000;
    const H = (s.korkeus || 2310) / 1000;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    if (isEntrance()) {
        const RH = entranceHeight(H);
        const target = new THREE.Vector3(L / 2, 1.75, 0.7);
        const fitEH = ((RH + 1.8) * 0.5) / tanHalf * 1.15;
        const fitEW = ((L + 5) * 0.5) / (tanHalf * camera.aspect) * 1.1;
        const dir = new THREE.Vector3(-0.22, 0.02, 1).normalize();
        return { target, position: target.clone().addScaledVector(dir, Math.max(fitEH, fitEW)) };
    }
    const fitH = (H * 0.5) / tanHalf * 1.34;
    const fitW = (L * 0.5) / (tanHalf * camera.aspect) * 1.45;
    const dist = Math.max(fitH, fitW) * (viewMode === "seina" ? 1.25 : 1);
    const target = new THREE.Vector3(L / 2, H * 0.47, -0.03);
    const dir = new THREE.Vector3(-0.2, -0.02, 1).normalize();
    return { target, position: target.clone().addScaledVector(dir, dist) };
}

function frameCamera(animate) {
    const pose = cameraPose();
    if (!animate) {
        flight = null;
        camera.position.copy(pose.position);
        controls.target.copy(pose.target);
        controls.update();
        return;
    }
    flight = {
        p0: camera.position.clone(),
        t0: controls.target.clone(),
        p1: pose.position,
        t1: pose.target,
        start: performance.now(),
        duration: 1100
    };
}

function stepFlight(now) {
    if (!flight) return;
    const k = Math.min(1, (now - flight.start) / flight.duration);
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    camera.position.lerpVectors(flight.p0, flight.p1, e);
    controls.target.lerpVectors(flight.t0, flight.t1, e);
    if (k >= 1) flight = null;
}

function rebuild() {
    const spec = readSpec();
    const dim = validate(spec);
    const msg = [ralError, dim].filter(Boolean).join(" ");
    $("virhe").hidden = !msg;
    $("virhe").textContent = msg;
    if (dim) return;
    mats.steel.color.set(spec.vari);
    mats.hinge.color.set(spec.vari);
    const keyNow = JSON.stringify({ ...spec, vari: null });
    let changed = false;
    if (keyNow !== doorKey) {
        doorKey = keyNow;
        if (door) {
            scene.remove(door);
            disposeGeometry(door);
        }
        door = buildDoor(spec, mats);
        scene.add(door);
        changed = true;
    }
    if (updateStage(spec)) changed = true;
    updateInfo(spec);
    if (changed) renderer.shadowMap.needsUpdate = true;
    invalidate();
}

let rebuildTimer = 0;

function scheduleRebuild() {
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(rebuild, 80);
}

// While the camera moves, frames are drawn without ambient occlusion; the full quality frame is
// drawn once the view has been still for SETTLE_MS. Resolution stays fixed because reallocating
// the multisampled targets mid-interaction stalls the GPU.
const SETTLE_MS = 160;
let lastMotion = -Infinity;
let draft = false;

function applySize() {
    const w = host.clientWidth;
    const h = host.clientHeight;
    const ratio = Math.min(Math.max(window.devicePixelRatio, 1.5), 2);
    renderer.setPixelRatio(ratio);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(ratio);
    composer.setSize(w, h);
}

function setDraft(on) {
    if (on === draft) return;
    draft = on;
    gtao.enabled = !on;
}

function markMotion() {
    lastMotion = performance.now();
    invalidate();
}

function resize() {
    applySize();
    camera.aspect = host.clientWidth / host.clientHeight;
    camera.updateProjectionMatrix();
    invalidate();
}

// Shader programs are compiled in parallel off the main thread; rendering waits until they are ready
// so the first draw does not block on synchronous compilation.
let compiling = true;
let compileRuns = 0;
const warmGeometry = new THREE.PlaneGeometry(0.001, 0.001);

function prepareScene() {
    const run = ++compileRuns;
    compiling = true;
    kehys.classList.add("lataa");
    const normals = new THREE.Mesh(warmGeometry, gtao.normalMaterial);
    const passes = new THREE.Scene();
    [gtao.gtaoMaterial, gtao.pdMaterial, gtao.blendMaterial].forEach((material) => {
        passes.add(new THREE.Mesh(warmGeometry, material));
    });
    scene.add(normals);
    renderer.setRenderTarget(composer.readBuffer);
    const ready = Promise.all([renderer.compileAsync(scene, camera), renderer.compileAsync(passes, camera)]);
    renderer.setRenderTarget(null);
    scene.remove(normals);
    ready.catch(() => {}).then(() => {
        if (run !== compileRuns) return;
        compiling = false;
        kehys.classList.remove("lataa");
        invalidate();
    });
}

function withTextures(fn) {
    if (!texturesPending()) {
        fn();
        prepareScene();
        return;
    }
    kehys.classList.add("lataa");
    loadSurfaces(neededSurfaces()).then(() => {
        fn();
        prepareScene();
    });
}

function setView(mode) {
    viewMode = mode;
    $("seinaValinta").hidden = mode !== "seina";
    withTextures(() => {
        rebuild();
        frameCamera(true);
    });
}

function setWall(type) {
    const wasEntrance = isEntrance();
    wallType = type;
    withTextures(() => {
        rebuild();
        if (wasEntrance !== isEntrance()) frameCamera(true);
    });
}

function saveImage() {
    const w = host.clientWidth;
    const h = host.clientHeight;
    const ratio = Math.min(4, Math.max(2, 3200 / w));
    draft = false;
    gtao.enabled = true;
    renderer.setPixelRatio(ratio);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(ratio);
    composer.setSize(w, h);
    composer.render();
    const url = renderer.domElement.toDataURL("image/png");
    resize();
    const s = readSpec();
    const ral = $("ral").value.replace(/\D/g, "");
    const link = document.createElement("a");
    link.download = "janisol-" + Math.round(s.leveys) + "x" + Math.round(s.korkeus) + (RAL[ral] ? "-ral" + ral : "") + ".png";
    link.href = url;
    link.click();
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
    if (event.target.type === "number" || event.target.id === "oviaukko") scheduleRebuild();
    else rebuild();
});

$("oviaukko").addEventListener("blur", () => {
    if (syncing) return;
    syncing = true;
    applyOpeningInput(true);
    syncing = false;
    clearTimeout(rebuildTimer);
    rebuild();
});

$("siirra").addEventListener("click", siirra);

document.querySelectorAll('input[name="nakymatila"]').forEach((input) => {
    input.addEventListener("change", () => setView(input.value));
});
document.querySelectorAll('input[name="seina"]').forEach((input) => {
    input.addEventListener("change", () => setWall(input.value));
});
$("palauta").addEventListener("click", () => frameCamera(true));
$("tallenna").addEventListener("click", saveImage);
controls.addEventListener("start", () => {
    flight = null;
});
controls.addEventListener("change", markMotion);

window.addEventListener("resize", resize);
restore3dIfAny();
$("seinaValinta").hidden = viewMode !== "seina";
resize();
withTextures(() => {
    rebuild();
    frameCamera(false);
});
setTimeout(() => loadSurfaces(["betoni", "rappaus", "lattia", "paneeli"]), 2500);

renderer.setAnimationLoop((now) => {
    if (flight) {
        stepFlight(now);
        markMotion();
    }
    controls.update();
    if (camera.position.y < 0.04) {
        camera.position.y = 0.04;
        invalidate();
    }
    const moving = now - lastMotion < SETTLE_MS;
    if (!moving && draft) {
        setDraft(false);
        dirty = true;
    }
    if (!dirty || compiling) return;
    if (moving) setDraft(true);
    dirty = false;
    composer.render();
    if (!kehys.classList.contains("valmis")) kehys.classList.add("valmis");
});
