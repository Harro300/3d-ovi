(function () {
    'use strict';

    var HANDOFF_KEY = 'ovi-siirto';
    var lastSpec = null;
    var lastLayout = null;
    var lastSvg = '';
    var syncing = false;

    var DIM_SYNC = {
        leveysInput: true,
        korkeusInput: true,
        valoLeveysInput: true,
        valoKorkeusInput: true,
        lisaValoInput: true,
        potkulevyInput: true,
        ovityyppiInput: true
    };

    function $(id) {
        return document.getElementById(id);
    }

    function val(id) {
        var el = $(id);
        return el ? el.value : '';
    }

    function setVal(id, v) {
        var el = $(id);
        if (el) el.value = v == null ? '' : v;
    }

    function parseNum(id) {
        var v = val(id);
        if (v === '' || v == null) return null;
        var n = Number(String(v).replace(',', '.'));
        return isFinite(n) ? n : null;
    }

    function setIfFinite(id, n) {
        if (n == null || !isFinite(n)) return;
        setVal(id, Math.round(n));
    }

    function showError(msg) {
        var el = $('drawerError');
        if (!el) return;
        if (!msg) {
            el.style.display = 'none';
            el.textContent = '';
            return;
        }
        el.style.display = '';
        el.textContent = msg;
    }

    function setStatus(text, kind) {
        var el = $('previewStatus');
        if (!el) return;
        el.textContent = text || '';
        el.classList.remove('is-ok', 'is-err');
        if (kind) el.classList.add(kind);
    }

    function readForm() {
        return {
            tyyppi: val('tyyppiInput'),
            ovityyppi: val('ovityyppiInput') || 'kayntiovi',
            saranapuoli: val('saranapuoliInput'),
            katselu: val('katseluInput') || 'ulkoa',
            leveys: val('leveysInput'),
            korkeus: val('korkeusInput'),
            valoaukko_w: val('valoLeveysInput'),
            valoaukko_h: val('valoKorkeusInput'),
            lisaovi_valoaukko_w: val('lisaValoInput'),
            potkulevy_h: val('potkulevyInput'),
            lukko_h: val('lukkoInput'),
            lasi: {
                enabled: $('lasiInput') ? $('lasiInput').checked : true,
                paksuus: val('lasiPaksuusInput')
            },
            vari: val('variInput'),
            kynnys: val('kynnysInput'),
            jarjestelma: val('jarjestelmaInput'),
            lisat: val('lisatInput'),
            maara: val('maaraInput'),
            tyo: val('tyoInput'),
            tyonumero: val('tyonumeroInput')
        };
    }

    function writeForm(spec) {
        var s = DoorSpec.normalize(spec);
        setVal('tyyppiInput', s.tyyppi);
        setVal('ovityyppiInput', s.ovityyppi);
        setVal('saranapuoliInput', s.saranapuoli);
        setVal('katseluInput', s.katselu);
        setVal('leveysInput', s.leveys);
        setVal('korkeusInput', s.korkeus);
        setVal('valoLeveysInput', s.valoaukko_w);
        setVal('valoKorkeusInput', s.valoaukko_h);
        setVal('lisaValoInput', s.lisaovi_valoaukko_w || '');
        setVal('potkulevyInput', s.potkulevy_h);
        setVal('lukkoInput', s.lukko_h);
        if ($('lasiInput')) $('lasiInput').checked = !!s.lasi.enabled;
        setVal('lasiPaksuusInput', s.lasi.paksuus);
        setVal('variInput', s.vari);
        setVal('kynnysInput', s.kynnys);
        setVal('jarjestelmaInput', s.jarjestelma);
        setVal('lisatInput', s.lisat.join('\n'));
        setVal('maaraInput', s.maara);
        setVal('tyoInput', s.tyo);
        setVal('tyonumeroInput', s.tyonumero);
        syncPairUi();
    }

    function syncPairUi() {
        var pair = val('ovityyppiInput') === 'pariovi';
        var col = $('lisaValoCol');
        if (col) col.style.display = pair ? '' : 'none';
        if (pair && !(Number(val('lisaValoInput')) > 0)) {
            var W = parseNum('leveysInput');
            if (W != null) setVal('lisaValoInput', DoorSpec.defaultLisaValo({ leveys: W }));
        }
    }

    function applySync(sourceId) {
        var pair = val('ovityyppiInput') === 'pariovi';
        var kick = parseNum('potkulevyInput');
        if (kick == null) kick = 0;
        var C = DoorSpec.VALO;

        if (sourceId === 'leveysInput' || sourceId === 'ovityyppiInput') {
            var W = parseNum('leveysInput');
            if (W != null) {
                if (pair) {
                    var lisa = parseNum('lisaValoInput');
                    if (lisa == null || lisa <= 0) {
                        lisa = Math.round((W - C.W_PARI) / 2);
                        setIfFinite('lisaValoInput', lisa);
                    }
                    setIfFinite('valoLeveysInput', W - C.W_PARI - lisa);
                } else {
                    setIfFinite('valoLeveysInput', W - C.W_KAYNTI);
                }
            }
        }

        if (sourceId === 'valoLeveysInput') {
            var v = parseNum('valoLeveysInput');
            if (v != null) {
                if (pair) {
                    var lisaV = parseNum('lisaValoInput');
                    if (lisaV == null || lisaV <= 0) {
                        var outer = parseNum('leveysInput');
                        lisaV = outer != null
                            ? Math.round((outer - C.W_PARI) / 2)
                            : Math.round(v);
                        setIfFinite('lisaValoInput', lisaV);
                    }
                    setIfFinite('leveysInput', v + lisaV + C.W_PARI);
                } else {
                    setIfFinite('leveysInput', v + C.W_KAYNTI);
                }
            }
        }

        if (sourceId === 'lisaValoInput') {
            var kayntiV = parseNum('valoLeveysInput');
            var lisaW = parseNum('lisaValoInput');
            if (kayntiV != null && lisaW != null) {
                setIfFinite('leveysInput', kayntiV + lisaW + C.W_PARI);
            }
        }

        if (sourceId === 'korkeusInput' || sourceId === 'potkulevyInput') {
            var H = parseNum('korkeusInput');
            if (H != null) setIfFinite('valoKorkeusInput', DoorSpec.valoaukkoH(H, kick));
        }

        if (sourceId === 'valoKorkeusInput') {
            var vh = parseNum('valoKorkeusInput');
            if (vh != null) setIfFinite('korkeusInput', DoorSpec.korkeusFromValoH(vh, kick));
        }

        syncPairUi();
    }

    function filenameFor(spec) {
        var kind = spec.ovityyppi === 'pariovi' ? 'pariovi' : 'kayntiovi';
        var t = (spec.tyyppi || kind).replace(/[^\w.-]+/g, '_');
        return t + '_' + spec.leveys + 'x' + spec.korkeus + '.svg';
    }

    function render() {
        syncPairUi();
        var spec = DoorSpec.normalize(readForm());
        var errors = DoorSpec.validate(spec);
        lastSpec = spec;
        if (errors.length) {
            showError(errors.join(' '));
            lastLayout = null;
            lastSvg = '';
            $('previewHost').innerHTML = '';
            setStatus('Tarkista syötteet', 'is-err');
            return;
        }
        showError('');
        var layout = DoorLayout.compute(spec);
        lastLayout = layout;
        lastSvg = DoorSheet.svg(layout);
        $('previewHost').innerHTML = lastSvg;
        setStatus(spec.tyyppi || (spec.ovityyppi === 'pariovi' ? 'Pariovi' : 'Käyntiovi'), 'is-ok');
    }

    function downloadSvg() {
        if (!lastLayout) {
            showError('Ei ladattavaa kuvaa — korjaa syötteet.');
            return;
        }
        var blob = new Blob([DoorSheet.documentSvg(lastLayout)], { type: 'image/svg+xml' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filenameFor(lastSpec);
        document.body.appendChild(a);
        a.click();
        setTimeout(function () {
            URL.revokeObjectURL(a.href);
            a.remove();
        }, 500);
    }

    async function copyJson() {
        var spec = lastSpec || DoorSpec.normalize(readForm());
        var text = JSON.stringify(spec, null, 2);
        try {
            await navigator.clipboard.writeText(text);
            setStatus('JSON kopioitu', 'is-ok');
        } catch (err) {
            showError('JSON-kopiointi epäonnistui.');
        }
    }

    function readHandoff() {
        try {
            var raw = sessionStorage.getItem(HANDOFF_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (err) {
            return null;
        }
    }

    function writeHandoff(data) {
        sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(data));
    }

    function saveExtras() {
        var data = readHandoff();
        if (!data || !data.spec) return;
        var form = readForm();
        data.extras = {
            tyyppi: form.tyyppi,
            katselu: form.katselu,
            lukko_h: form.lukko_h,
            lasi: form.lasi,
            kynnys: form.kynnys,
            jarjestelma: form.jarjestelma,
            lisat: form.lisat,
            maara: form.maara,
            tyo: form.tyo,
            tyonumero: form.tyonumero
        };
        writeHandoff(data);
    }

    function clearExtras() {
        var data = readHandoff();
        if (!data) return;
        data.extras = null;
        writeHandoff(data);
    }

    function applyHandoff() {
        var data = readHandoff();
        if (!data || !data.spec) return false;
        var spec = Object.assign({}, data.spec);
        var extras = data.extras;
        if (extras) {
            spec.katselu = extras.katselu;
            spec.lukko_h = extras.lukko_h;
            spec.lasi = extras.lasi;
            spec.kynnys = extras.kynnys;
            spec.jarjestelma = extras.jarjestelma;
            spec.lisat = extras.lisat;
            spec.maara = extras.maara;
            spec.tyo = extras.tyo;
            spec.tyonumero = extras.tyonumero;
            if (!String(spec.tyyppi || '').trim() && extras.tyyppi) {
                spec.tyyppi = extras.tyyppi;
            }
        }
        writeForm(spec);
        render();
        setStatus('Tuotu 3D-piirtimestä', 'is-ok');
        return true;
    }

    function returnTo3d() {
        saveExtras();
        window.location.href = 'ovi-3d/index.html';
    }

    function clearForm() {
        clearExtras();
        writeForm(DoorSpec.empty());
        render();
        setStatus('');
    }

    function bind() {
        var ids = [
            'tyyppiInput', 'ovityyppiInput', 'saranapuoliInput', 'katseluInput',
            'leveysInput', 'korkeusInput', 'valoLeveysInput', 'valoKorkeusInput', 'lisaValoInput',
            'potkulevyInput', 'lukkoInput',
            'lasiInput', 'lasiPaksuusInput', 'variInput',
            'kynnysInput', 'jarjestelmaInput', 'lisatInput',
            'maaraInput', 'tyoInput', 'tyonumeroInput'
        ];
        ids.forEach(function (id) {
            var el = $(id);
            if (!el) return;
            var onChange = function () {
                if (syncing) return;
                if (DIM_SYNC[id]) {
                    syncing = true;
                    applySync(id);
                    syncing = false;
                }
                render();
                saveExtras();
            };
            el.addEventListener('input', onChange);
            el.addEventListener('change', onChange);
        });
        $('back3dBtn').addEventListener('click', returnTo3d);
        $('clearBtn').addEventListener('click', clearForm);
        $('downloadBtn').addEventListener('click', downloadSvg);
        $('downloadBtn2').addEventListener('click', downloadSvg);
        $('copyJsonBtn').addEventListener('click', function () {
            copyJson();
        });
    }

    bind();
    if (!applyHandoff()) {
        writeForm(DoorSpec.empty());
        render();
    }
})();
