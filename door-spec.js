/**
 * Oven tietomalli: normalisointi ja tarkistus. Ei DOM:ia.
 * window.DoorSpec
 */
(function (root) {
    'use strict';

    var VALO = {
        W_KAYNTI: 265,
        W_PARI: 420,
        H: 240,
        H_POTKU: 135,
        KICK_MIN: 40
    };

    var FACE = {
        KARMI: 40,
        PUITE: 87.5,
        PUITE_LISA: 62.5,
        RAKO_NAAMA: 5
    };

    var DEFAULTS = {
        tyyppi: '',
        ovityyppi: 'kayntiovi',
        saranapuoli: 'oikea',
        katselu: 'ulkoa',
        leveys: 990,
        korkeus: 2090,
        potkulevy_h: 250,
        lukko_h: 1055,
        karmi: 50,
        puite: 52,
        syvyys: 60,
        rako: 5,
        lisaovi_leveys: 0,
        valoaukko_w: 0,
        valoaukko_h: 0,
        lisaovi_valoaukko_w: 0,
        lasi: { paksuus: 18, enabled: true },
        vari: '',
        kynnys: '',
        jarjestelma: '',
        lisat: [],
        maara: 1,
        tyo: '',
        tyonumero: ''
    };

    function isObj(v) {
        return v && typeof v === 'object' && !Array.isArray(v);
    }

    function num(v, fallback) {
        var n = Number(String(v == null ? '' : v).replace(',', '.'));
        return isFinite(n) ? n : fallback;
    }

    function str(v) {
        return String(v == null ? '' : v).trim();
    }

    function lines(v) {
        if (Array.isArray(v)) {
            return v.map(str).filter(Boolean);
        }
        return String(v || '').split(/\r?\n/).map(str).filter(Boolean);
    }

    function normalizeLasi(raw, fallbackEnabled) {
        if (raw === false || raw === null) {
            return { paksuus: 18, enabled: false };
        }
        if (raw === true) {
            return { paksuus: 18, enabled: true };
        }
        if (isObj(raw)) {
            var enabled = raw.enabled;
            if (enabled == null) enabled = true;
            return {
                paksuus: num(raw.paksuus, 18),
                enabled: !!enabled
            };
        }
        return { paksuus: 18, enabled: fallbackEnabled !== false };
    }

    function hasKick(s) {
        return num(s && s.potkulevy_h, 0) >= VALO.KICK_MIN;
    }

    function valoaukkoH(korkeus, potkulevy_h) {
        var H = num(korkeus, 0);
        var kick = num(potkulevy_h, 0);
        if (kick >= VALO.KICK_MIN) return H - kick - VALO.H_POTKU;
        return H - VALO.H;
    }

    function korkeusFromValoH(valo_h, potkulevy_h) {
        var vh = num(valo_h, 0);
        var kick = num(potkulevy_h, 0);
        if (kick >= VALO.KICK_MIN) return vh + kick + VALO.H_POTKU;
        return vh + VALO.H;
    }

    function defaultLisaValo(s) {
        var W = isObj(s) ? num(s.leveys, DEFAULTS.leveys) : num(s, DEFAULTS.leveys);
        return Math.max(0, Math.round((W - VALO.W_PARI) / 2));
    }

    function openingWidth(s) {
        return s.leveys - 2 * s.karmi - 2 * s.rako;
    }

    function defaultLisaovi(s) {
        return defaultLisaValo(s);
    }

    function fillValoaukko(out) {
        var pair = out.ovityyppi === 'pariovi';
        if (pair) {
            if (!(out.lisaovi_valoaukko_w > 0)) {
                out.lisaovi_valoaukko_w = defaultLisaValo(out);
            }
            if (!(out.valoaukko_w > 0)) {
                out.valoaukko_w = out.leveys - VALO.W_PARI - out.lisaovi_valoaukko_w;
            }
        } else if (!(out.valoaukko_w > 0)) {
            out.valoaukko_w = out.leveys - VALO.W_KAYNTI;
        }
        if (!(out.valoaukko_h > 0)) {
            out.valoaukko_h = valoaukkoH(out.korkeus, out.potkulevy_h);
        }
    }

    function normalize(raw) {
        var s = isObj(raw) ? raw : {};
        var out = {
            tyyppi: str(s.tyyppi),
            ovityyppi: str(s.ovityyppi) || DEFAULTS.ovityyppi,
            saranapuoli: str(s.saranapuoli) === 'vasen' ? 'vasen' : 'oikea',
            katselu: str(s.katselu) || DEFAULTS.katselu,
            leveys: num(s.leveys, DEFAULTS.leveys),
            korkeus: num(s.korkeus, DEFAULTS.korkeus),
            potkulevy_h: num(s.potkulevy_h, DEFAULTS.potkulevy_h),
            lukko_h: num(s.lukko_h, DEFAULTS.lukko_h),
            karmi: num(s.karmi, DEFAULTS.karmi),
            puite: num(s.puite, DEFAULTS.puite),
            syvyys: num(s.syvyys, DEFAULTS.syvyys),
            rako: num(s.rako, DEFAULTS.rako),
            lisaovi_leveys: Math.max(0, num(s.lisaovi_leveys, 0)),
            valoaukko_w: num(s.valoaukko_w, 0),
            valoaukko_h: num(s.valoaukko_h, 0),
            lisaovi_valoaukko_w: Math.max(0, num(s.lisaovi_valoaukko_w, 0)),
            lasi: normalizeLasi(s.lasi, true),
            vari: str(s.vari),
            kynnys: str(s.kynnys),
            jarjestelma: str(s.jarjestelma),
            lisat: lines(s.heloitus).concat(lines(s.lisat)),
            maara: Math.max(1, Math.round(num(s.maara, DEFAULTS.maara))),
            tyo: str(s.tyo),
            tyonumero: str(s.tyonumero)
        };
        if (out.ovityyppi !== 'pariovi') {
            out.ovityyppi = 'kayntiovi';
            out.lisaovi_leveys = 0;
            out.lisaovi_valoaukko_w = 0;
        }
        if (out.karmi <= 0) out.karmi = DEFAULTS.karmi;
        if (!(out.puite > 0)) out.puite = DEFAULTS.puite;
        if (out.syvyys <= 0) out.syvyys = DEFAULTS.syvyys;
        if (out.rako < 0) out.rako = DEFAULTS.rako;
        fillValoaukko(out);
        return out;
    }

    function empty() {
        return normalize({
            leveys: DEFAULTS.leveys,
            korkeus: DEFAULTS.korkeus,
            potkulevy_h: DEFAULTS.potkulevy_h,
            lukko_h: DEFAULTS.lukko_h,
            karmi: DEFAULTS.karmi,
            puite: DEFAULTS.puite,
            lasi: { paksuus: 18, enabled: true },
            ovityyppi: 'kayntiovi',
            saranapuoli: 'oikea',
            katselu: 'ulkoa',
            maara: 1
        });
    }

    function validate(spec) {
        var errors = [];
        var s = normalize(spec);
        var pair = s.ovityyppi === 'pariovi';
        var minW = pair ? 1000 : 500;
        var maxW = pair ? 3000 : 2500;
        if (s.ovityyppi !== 'kayntiovi' && s.ovityyppi !== 'pariovi') {
            errors.push('Ovityyppi on käyntiovi tai pariovi.');
        }
        if (s.leveys < minW || s.leveys > maxW) {
            errors.push(pair
                ? 'Parioven leveys pitää olla 1000–3000 mm.'
                : 'Leveys pitää olla 500–2500 mm.');
        }
        if (s.korkeus < 800 || s.korkeus > 3000) {
            errors.push('Korkeus pitää olla 800–3000 mm.');
        }
        if (s.karmi * 2 >= s.leveys) {
            errors.push('Karmi on liian leveä tähän oveen.');
        }
        if (s.karmi * 2 >= s.korkeus) {
            errors.push('Karmi on liian korkea tähän oveen.');
        }
        if (s.valoaukko_w < 80) {
            errors.push('Valoaukon leveys on liian pieni.');
        }
        if (s.valoaukko_h < 80) {
            errors.push('Valoaukon korkeus on liian pieni.');
        }
        if (pair && s.lisaovi_valoaukko_w < 80) {
            errors.push('Lisäoven valoaukko on liian pieni.');
        }
        if (pair && s.valoaukko_w + s.lisaovi_valoaukko_w + VALO.W_PARI > maxW + 1) {
            errors.push('Valoaukot eivät mahdu oven leveyteen.');
        }
        if (!pair && s.valoaukko_w + VALO.W_KAYNTI > maxW + 1) {
            errors.push('Valoaukko ei mahdu oven leveyteen.');
        }
        var leafH = s.korkeus - 2 * s.karmi;
        if (s.potkulevy_h < 0 || s.potkulevy_h > leafH - 80) {
            errors.push('Potkulevyn korkeus ei mahdu lehteen.');
        }
        if (s.lukko_h <= s.karmi || s.lukko_h >= s.korkeus - s.karmi) {
            errors.push('Lukkokorkeus pitää olla karmin sisäpuolella.');
        }
        return errors;
    }

    function hasPanic(spec) {
        var s = normalize(spec);
        return s.lisat.some(function (line) {
            return /3000|pikasalpa/i.test(line);
        });
    }

    root.DoorSpec = {
        VALO: VALO,
        FACE: FACE,
        DEFAULTS: DEFAULTS,
        normalize: normalize,
        validate: validate,
        empty: empty,
        openingWidth: openingWidth,
        defaultLisaovi: defaultLisaovi,
        defaultLisaValo: defaultLisaValo,
        hasKick: hasKick,
        valoaukkoH: valoaukkoH,
        korkeusFromValoH: korkeusFromValoH,
        hasPanic: hasPanic
    };
})(typeof window !== 'undefined' ? window : this);
