// Oma julkisivu: loading an ARK drawing (PDF or image), marking door openings on it and
// persisting the result. Rectangles are in preview pixels, y pointing down. A PDF preview is
// rendered once for marking; the area around an opening is rendered again from the PDF in detail.

const MAX_SIDE = 4800;
const MAX_AREA = 12e6;
const CROP_MAX = 2560;
const DETAIL_MAX = 8;
const HANDLE = 7;
const MIN_DRAG = 6;
const DB_NAME = "ovi-julkisivu";
const DB_STORE = "tila";
const DB_KEY = "nykyinen";

const $ = (id) => document.getElementById(id);

let pdfjs = null;

async function loadPdfjs() {
    if (!pdfjs) {
        pdfjs = await import("pdfjs");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdfjs/pdf.worker.min.js", import.meta.url).href;
    }
    return pdfjs;
}

function isPdf(file) {
    return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Large sheets can exhaust the browser's canvas memory during rendering, which leaves the canvas
// fully transparent without an error. The render is checked and retried smaller.
function isBlank(canvas) {
    const probe = document.createElement("canvas");
    probe.width = 32;
    probe.height = 32;
    const ctx = probe.getContext("2d");
    ctx.drawImage(canvas, 0, 0, 32, 32);
    const data = ctx.getImageData(0, 0, 32, 32).data;
    for (let i = 3; i < data.length; i += 4) {
        if (data[i] !== 0) return false;
    }
    return true;
}

async function renderPdf(page, width, height, viewportOf) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: viewportOf() }).promise;
    return canvas;
}

async function renderPdfPage(doc, pageNo) {
    const page = await doc.getPage(pageNo);
    const base = page.getViewport({ scale: 1 });
    let scale = Math.min(
        MAX_SIDE / Math.max(base.width, base.height),
        Math.sqrt(MAX_AREA / (base.width * base.height))
    );
    for (let attempt = 0; attempt < 4; attempt++) {
        const canvas = await renderPdf(page, base.width * scale, base.height * scale, () => page.getViewport({ scale }));
        if (!isBlank(canvas)) {
            page.cleanup();
            return { canvas, scale };
        }
        scale *= 0.75;
    }
    throw new Error("PDF-sivun piirto epäonnistui.");
}

let pdfCache = { blob: null, doc: null };

async function pdfFor(blob) {
    if (pdfCache.blob !== blob) {
        if (pdfCache.doc) pdfCache.doc.destroy();
        const lib = await loadPdfjs();
        pdfCache = { blob, doc: null };
        pdfCache.doc = await lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
    }
    return pdfCache.doc;
}

function canvasBlob(canvas) {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob"))), "image/png");
    });
}

function openDb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function dbRequest(mode, run) {
    return openDb().then((db) => new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, mode);
        const req = run(tx.objectStore(DB_STORE));
        tx.oncomplete = () => {
            db.close();
            resolve(req.result);
        };
        tx.onerror = () => {
            db.close();
            reject(tx.error);
        };
    }));
}

const DRAWING_FIELDS = ["kind", "blob", "page", "scale", "preview"];

function drawingOf(facade) {
    return Object.fromEntries(DRAWING_FIELDS.map((key) => [key, facade[key]]));
}

export function clearFacade() {
    if (pdfCache.doc) pdfCache.doc.destroy();
    pdfCache = { blob: null, doc: null };
    return dbRequest("readwrite", (store) => store.delete(DB_KEY));
}

export function saveFacade(facade) {
    const record = { ...drawingOf(facade), rects: facade.rects, active: facade.active };
    return dbRequest("readwrite", (store) => store.put(record, DB_KEY));
}

export async function loadFacade() {
    const record = await dbRequest("readonly", (store) => store.get(DB_KEY));
    if (!record || !record.preview || !record.rects || !record.rects.length) return null;
    const source = await createImageBitmap(record.preview);
    const active = Math.min(Math.max(record.active | 0, 0), record.rects.length - 1);
    return { ...drawingOf(record), source, rects: record.rects, active };
}

// The piece of the drawing shown around one opening: wider at the sides than above, a little below.
function cropBounds(source, r) {
    const x0 = Math.max(0, Math.floor(r.x - r.w * 2.5));
    const x1 = Math.min(source.width, Math.ceil(r.x + r.w * 3.5));
    const y0 = Math.max(0, Math.floor(r.y - r.h * 1.5));
    const y1 = Math.min(source.height, Math.ceil(r.y + r.h * 1.35));
    return { x0, y0, x1, y1 };
}

export function previewCrop(facade, r) {
    const b = cropBounds(facade.source, r);
    const w = b.x1 - b.x0;
    const h = b.y1 - b.y0;
    const k = Math.min(1, CROP_MAX / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * k));
    canvas.height = Math.max(1, Math.round(h * k));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(facade.source, b.x0, b.y0, w, h, 0, 0, canvas.width, canvas.height);
    return { ...b, canvas };
}

// Same bounds as previewCrop, rendered from the PDF at up to DETAIL_MAX times the preview scale.
export async function detailCrop(facade, r) {
    const b = cropBounds(facade.source, r);
    const w = b.x1 - b.x0;
    const h = b.y1 - b.y0;
    const doc = await pdfFor(facade.blob);
    const page = await doc.getPage(facade.page);
    let k = Math.min(DETAIL_MAX, CROP_MAX / Math.max(w, h));
    for (let attempt = 0; attempt < 3; attempt++) {
        const scale = facade.scale * k;
        const offsetX = -b.x0 * k;
        const offsetY = -b.y0 * k;
        const canvas = await renderPdf(page, w * k, h * k, () => page.getViewport({ scale, offsetX, offsetY }));
        if (!isBlank(canvas)) return { ...b, canvas };
        k *= 0.7;
    }
    throw new Error("Aukon piirto epäonnistui.");
}

// Opens the marking dialog. Resolves with the drawing fields, source and rects, or null when cancelled.
// Rectangles keep their id and door, so edits do not lose doors already made.
export function editFacade(current) {
    const root = $("julkisivu");
    const area = $("julkisivuAlue");
    const canvas = $("julkisivuPiirto");
    const fileInput = $("julkisivuTiedosto");
    const pageSelect = $("julkisivuSivu");
    const ctx = canvas.getContext("2d");

    let source = current ? current.source : null;
    let drawing = current ? drawingOf(current) : null;
    let rects = current ? current.rects.map((r) => ({ ...r })) : [];
    let selected = -1;
    let view = { s: 1, tx: 0, ty: 0 };
    let drag = null;
    let space = false;
    let busy = false;
    let pdfFile = null;
    let pdfDoc = null;
    let frame = 0;

    return new Promise((resolve) => {
        const finish = (result) => {
            root.hidden = true;
            window.removeEventListener("keydown", onKey, true);
            window.removeEventListener("keyup", onKeyUp, true);
            window.removeEventListener("resize", onResize);
            canvas.removeEventListener("pointerdown", onDown);
            canvas.removeEventListener("pointermove", onMove);
            canvas.removeEventListener("pointerup", onUp);
            canvas.removeEventListener("pointercancel", onUp);
            canvas.removeEventListener("wheel", onWheel);
            canvas.removeEventListener("contextmenu", prevent);
            area.removeEventListener("dragover", onDragOver);
            area.removeEventListener("drop", onDrop);
            fileInput.removeEventListener("change", onFile);
            pageSelect.removeEventListener("change", onPage);
            $("julkisivuPoista").removeEventListener("click", removeSelected);
            $("julkisivuPoistaPiirustus").removeEventListener("click", onRemoveDrawing);
            $("julkisivuPeruuta").removeEventListener("click", onCancel);
            $("julkisivuValmis").removeEventListener("click", onDone);
            resolve(result);
        };

        const toImage = (sx, sy) => [(sx - view.tx) / view.s, (sy - view.ty) / view.s];
        const toScreen = (r) => [r.x * view.s + view.tx, r.y * view.s + view.ty, r.w * view.s, r.h * view.s];

        const local = (event) => {
            const box = canvas.getBoundingClientRect();
            return [event.clientX - box.left, event.clientY - box.top];
        };

        const fit = () => {
            if (!source) return;
            const w = area.clientWidth;
            const h = area.clientHeight;
            const s = Math.min(w / source.width, h / source.height) * 0.94;
            view = { s, tx: (w - source.width * s) / 2, ty: (h - source.height * s) / 2 };
        };

        const sizeCanvas = () => {
            const dpr = window.devicePixelRatio || 1;
            canvas.width = Math.round(area.clientWidth * dpr);
            canvas.height = Math.round(area.clientHeight * dpr);
        };

        const draw = () => {
            frame = 0;
            const dpr = window.devicePixelRatio || 1;
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.fillStyle = "#16171a";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            if (!source) return;
            ctx.setTransform(dpr * view.s, 0, 0, dpr * view.s, dpr * view.tx, dpr * view.ty);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";
            ctx.drawImage(source, 0, 0);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            const shown = drag && drag.mode === "create" && drag.rect ? [...rects, drag.rect] : rects;
            shown.forEach((r, i) => {
                const [x, y, w, h] = toScreen(r);
                const active = i === selected;
                const draft = r === (drag && drag.rect);
                ctx.fillStyle = active ? "rgba(210, 191, 152, 0.24)" : "rgba(210, 191, 152, 0.14)";
                ctx.fillRect(x, y, w, h);
                ctx.lineWidth = active ? 2.4 : 1.8;
                ctx.strokeStyle = active ? "#f3dfb4" : "#c9a96a";
                ctx.setLineDash(draft ? [6, 4] : []);
                ctx.strokeRect(x, y, w, h);
                ctx.setLineDash([]);
                if (draft) return;
                const label = String(i + 1);
                ctx.font = "600 12px Segoe UI, sans-serif";
                const lw = Math.max(20, ctx.measureText(label).width + 10);
                ctx.fillStyle = active ? "#f3dfb4" : "#c9a96a";
                ctx.fillRect(x, y - 20, lw, 20);
                ctx.fillStyle = "#16171a";
                ctx.textBaseline = "middle";
                ctx.textAlign = "center";
                ctx.fillText(label, x + lw / 2, y - 10);
                if (!active) return;
                ctx.fillStyle = "#f3dfb4";
                corners(x, y, w, h).forEach(([cx, cy]) => ctx.fillRect(cx - 4, cy - 4, 8, 8));
            });
        };

        const redraw = () => {
            if (!frame) frame = requestAnimationFrame(draw);
        };

        const corners = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

        const updateUi = () => {
            const has = !!source;
            $("julkisivuTyhja").hidden = has || busy;
            $("julkisivuLataus").hidden = !busy;
            $("julkisivuVaihda").hidden = !has;
            $("julkisivuPoistaPiirustus").hidden = !has;
            $("julkisivuPoista").disabled = selected < 0;
            $("julkisivuValmis").disabled = !has || !rects.length || busy;
            $("julkisivuValmis").textContent = rects.length ? "Valmis (" + rects.length + ")" : "Valmis";
            $("julkisivuOhje").textContent = has
                ? "Vedä suorakaide jokaisen oviaukon päälle karmin ulkoreunaa myöten. Rulla zoomaa, oikea painike tai välilyönti pohjassa siirtää, Delete poistaa valitun."
                : "Valitse julkisivun ARK-piirustus. PDF:stä avataan valittu sivu.";
            canvas.style.cursor = !has ? "default" : space ? "grab" : "crosshair";
        };

        const clampRect = (r) => {
            const x0 = Math.max(0, Math.min(r.x, r.x + r.w));
            const y0 = Math.max(0, Math.min(r.y, r.y + r.h));
            const x1 = Math.min(source.width, Math.max(r.x, r.x + r.w));
            const y1 = Math.min(source.height, Math.max(r.y, r.y + r.h));
            r.x = x0;
            r.y = y0;
            r.w = x1 - x0;
            r.h = y1 - y0;
            return r;
        };

        const hitHandle = (sx, sy) => {
            if (selected < 0) return -1;
            const [x, y, w, h] = toScreen(rects[selected]);
            return corners(x, y, w, h).findIndex(([cx, cy]) => Math.abs(sx - cx) <= HANDLE && Math.abs(sy - cy) <= HANDLE);
        };

        const hitRect = (sx, sy) => {
            for (let i = rects.length - 1; i >= 0; i--) {
                const [x, y, w, h] = toScreen(rects[i]);
                if (sx >= x && sx <= x + w && sy >= y && sy <= y + h) return i;
            }
            return -1;
        };

        const setDrawing = (nextSource, nextDrawing) => {
            source = nextSource;
            drawing = nextDrawing;
            rects = [];
            selected = -1;
            fit();
            updateUi();
            redraw();
        };

        const showPage = async (pageNo) => {
            busy = true;
            updateUi();
            try {
                const { canvas: pageCanvas, scale } = await renderPdfPage(pdfDoc, pageNo);
                const [bitmap, png] = await Promise.all([createImageBitmap(pageCanvas), canvasBlob(pageCanvas)]);
                setDrawing(bitmap, { kind: "pdf", blob: pdfFile, page: pageNo, scale, preview: png });
            } finally {
                busy = false;
                updateUi();
            }
        };

        const openFile = async (file) => {
            if (!file) return;
            if (rects.length && !window.confirm("Uusi piirustus poistaa merkityt oviaukot. Jatketaanko?")) return;
            busy = true;
            updateUi();
            try {
                pdfDoc = null;
                if (isPdf(file)) {
                    pdfFile = file;
                    pdfDoc = await pdfFor(file);
                    pageSelect.replaceChildren();
                    for (let i = 1; i <= pdfDoc.numPages; i++) {
                        const option = document.createElement("option");
                        option.value = String(i);
                        option.textContent = "Sivu " + i + " / " + pdfDoc.numPages;
                        pageSelect.append(option);
                    }
                    pageSelect.hidden = pdfDoc.numPages < 2;
                    await showPage(1);
                } else {
                    pageSelect.hidden = true;
                    setDrawing(await createImageBitmap(file), { kind: "image", blob: file, page: 1, scale: 1, preview: file });
                }
            } catch (err) {
                window.alert("Piirustusta ei voitu avata. Tuetut muodot ovat PDF, PNG ja JPG.");
            } finally {
                busy = false;
                updateUi();
                redraw();
            }
        };

        function onFile() {
            const file = fileInput.files[0];
            fileInput.value = "";
            openFile(file);
        }

        function onPage() {
            if (!pdfDoc) return;
            if (rects.length && !window.confirm("Sivun vaihto poistaa merkityt oviaukot. Jatketaanko?")) return;
            showPage(Number(pageSelect.value));
        }

        function onDragOver(event) {
            event.preventDefault();
        }

        function onDrop(event) {
            event.preventDefault();
            openFile(event.dataTransfer.files[0]);
        }

        function prevent(event) {
            event.preventDefault();
        }

        function onDown(event) {
            if (!source || busy) return;
            const [sx, sy] = local(event);
            try {
                canvas.setPointerCapture(event.pointerId);
            } catch {
                // Pointer already released; the drag still ends on pointerup.
            }
            if (event.button === 1 || event.button === 2 || (event.button === 0 && space)) {
                drag = { mode: "pan", sx, sy, tx: view.tx, ty: view.ty };
                canvas.style.cursor = "grabbing";
                return;
            }
            if (event.button !== 0) return;
            const handle = hitHandle(sx, sy);
            if (handle >= 0) {
                const r = rects[selected];
                const pts = [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
                drag = { mode: "resize", fixed: pts[(handle + 2) % 4] };
                return;
            }
            const hit = hitRect(sx, sy);
            if (hit >= 0) {
                selected = hit;
                const [ix, iy] = toImage(sx, sy);
                drag = { mode: "move", dx: ix - rects[hit].x, dy: iy - rects[hit].y };
            } else {
                selected = -1;
                drag = { mode: "create", sx, sy, rect: null };
            }
            updateUi();
            redraw();
        }

        function onMove(event) {
            if (!source) return;
            const [sx, sy] = local(event);
            if (!drag) {
                if (space) return;
                const over = hitHandle(sx, sy);
                canvas.style.cursor = over === 0 || over === 2 ? "nwse-resize"
                    : over === 1 || over === 3 ? "nesw-resize"
                    : hitRect(sx, sy) >= 0 ? "move" : "crosshair";
                return;
            }
            const [ix, iy] = toImage(sx, sy);
            if (drag.mode === "pan") {
                view.tx = drag.tx + sx - drag.sx;
                view.ty = drag.ty + sy - drag.sy;
            } else if (drag.mode === "move") {
                const r = rects[selected];
                r.x = Math.min(Math.max(ix - drag.dx, 0), source.width - r.w);
                r.y = Math.min(Math.max(iy - drag.dy, 0), source.height - r.h);
            } else if (drag.mode === "resize") {
                const r = rects[selected];
                r.x = drag.fixed[0];
                r.y = drag.fixed[1];
                r.w = ix - drag.fixed[0];
                r.h = iy - drag.fixed[1];
                clampRect(r);
            } else if (drag.mode === "create") {
                if (Math.abs(sx - drag.sx) < MIN_DRAG && Math.abs(sy - drag.sy) < MIN_DRAG) return;
                const [ox, oy] = toImage(drag.sx, drag.sy);
                drag.rect = clampRect({ x: ox, y: oy, w: ix - ox, h: iy - oy });
            }
            redraw();
        }

        function onUp(event) {
            if (!drag) return;
            if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
            if (drag.mode === "create" && drag.rect) {
                const [, , w, h] = toScreen(drag.rect);
                if (w >= MIN_DRAG && h >= MIN_DRAG) {
                    rects.push({ id: newId(), ...drag.rect, door: null });
                    selected = rects.length - 1;
                }
            }
            if (drag.mode === "resize") {
                const r = rects[selected];
                if (r.w * view.s < MIN_DRAG || r.h * view.s < MIN_DRAG) {
                    rects.splice(selected, 1);
                    selected = -1;
                }
            }
            drag = null;
            updateUi();
            redraw();
        }

        function onWheel(event) {
            if (!source) return;
            event.preventDefault();
            const [sx, sy] = local(event);
            const fitScale = Math.min(area.clientWidth / source.width, area.clientHeight / source.height);
            const next = Math.min(Math.max(view.s * Math.exp(-event.deltaY * 0.0015), fitScale * 0.5), 8);
            const k = next / view.s;
            view.tx = sx - (sx - view.tx) * k;
            view.ty = sy - (sy - view.ty) * k;
            view.s = next;
            redraw();
        }

        function removeSelected() {
            if (selected < 0) return;
            rects.splice(selected, 1);
            selected = -1;
            updateUi();
            redraw();
        }

        function onKey(event) {
            if (event.target instanceof HTMLSelectElement) return;
            if (event.key === "Escape") {
                event.preventDefault();
                if (drag) drag = null;
                else if (selected >= 0) selected = -1;
                else onCancel();
                updateUi();
                redraw();
            } else if (event.key === "Delete" || event.key === "Backspace") {
                event.preventDefault();
                removeSelected();
            } else if (event.key === " ") {
                event.preventDefault();
                space = true;
                updateUi();
            } else if (event.key === "Enter" && !$("julkisivuValmis").disabled) {
                event.preventDefault();
                onDone();
            }
        }

        function onKeyUp(event) {
            if (event.key !== " ") return;
            space = false;
            updateUi();
        }

        function onResize() {
            sizeCanvas();
            fit();
            redraw();
        }

        function onCancel() {
            finish(null);
        }

        function onRemoveDrawing() {
            if (!source || busy) return;
            const marked = rects.length
                ? "Piirustus ja " + rects.length + " merkittyä oviaukkoa poistetaan."
                : "Piirustus poistetaan.";
            if (!window.confirm(marked + " Jatketaanko?")) return;
            finish({ removed: true });
        }

        function onDone() {
            if (!source || !rects.length) return;
            finish({ ...drawing, source, rects: rects.map((r) => ({ ...r })) });
        }

        root.hidden = false;
        window.addEventListener("keydown", onKey, true);
        window.addEventListener("keyup", onKeyUp, true);
        window.addEventListener("resize", onResize);
        canvas.addEventListener("pointerdown", onDown);
        canvas.addEventListener("pointermove", onMove);
        canvas.addEventListener("pointerup", onUp);
        canvas.addEventListener("pointercancel", onUp);
        canvas.addEventListener("wheel", onWheel, { passive: false });
        canvas.addEventListener("contextmenu", prevent);
        area.addEventListener("dragover", onDragOver);
        area.addEventListener("drop", onDrop);
        fileInput.addEventListener("change", onFile);
        pageSelect.addEventListener("change", onPage);
        $("julkisivuPoista").addEventListener("click", removeSelected);
        $("julkisivuPoistaPiirustus").addEventListener("click", onRemoveDrawing);
        $("julkisivuPeruuta").addEventListener("click", onCancel);
        $("julkisivuValmis").addEventListener("click", onDone);
        pageSelect.hidden = true;
        sizeCanvas();
        fit();
        updateUi();
        redraw();
    });
}
