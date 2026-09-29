/**
 * Oven millimetri-geometria. Origon vasen alanurkka, Y ylös.
 * Janisol 2: valoaukko määrää lasiaukon; ulkomitta kaavoista 265 / 420 / 240 / 135.
 * window.DoorLayout
 */
(function (root) {
    'use strict';

    function box(x, y, w, h) {
        return { x: x, y: y, w: w, h: h };
    }

    function makeHinges(hingeX, side, leafOuter) {
        var hingeW = 10;
        var hingeH = 68;
        var yBottom = leafOuter.y + 250;
        var yTop = leafOuter.y + leafOuter.h - 250;
        var yMid = leafOuter.y + leafOuter.h / 2;
        return [yBottom, yMid, yTop].map(function (cy) {
            return { x: hingeX, y: cy, w: hingeW, h: hingeH, side: side };
        });
    }

    function makeLeaf(gx, gy, gw, gh, spec, edges, hingeSide, active) {
        var FACE = root.DoorSpec.FACE;
        var kickOn = spec.lasi.enabled && spec.potkulevy_h >= root.DoorSpec.VALO.KICK_MIN;
        var reveal = FACE.KARMI + FACE.RAKO_NAAMA;
        var glassTop = gy + gh;
        var outerBottom = Math.min(reveal, gy);
        var room = Math.max(0, gy - outerBottom);
        var bottomRail = Math.min(FACE.PUITE, room);
        var innerBottom = outerBottom + bottomRail;
        var outer = box(
            gx - edges.left,
            outerBottom,
            gw + edges.left + edges.right,
            (glassTop + FACE.PUITE) - outerBottom
        );
        var inner = box(gx, innerBottom, gw, Math.max(0, glassTop - innerBottom));
        var glass = null;
        var panel = null;
        var kickRail = null;
        var kickPutki = 72.5;
        if (spec.lasi.enabled) {
            glass = box(gx, gy, gw, gh);
            if (kickOn && gy > innerBottom + 0.5) {
                var gap = gy - innerBottom;
                if (gap > kickPutki + 8) {
                    kickRail = box(gx, gy - kickPutki, gw, kickPutki);
                    panel = box(gx, innerBottom, gw, gap - kickPutki);
                } else {
                    panel = box(gx, innerBottom, gw, gap);
                }
            }
        } else {
            panel = inner;
        }
        return {
            outer: outer,
            inner: inner,
            transom: null,
            panel: panel,
            kickRail: kickRail,
            glass: glass,
            hingeSide: hingeSide,
            active: active
        };
    }

    function stileEdges(meetingSide, thinMeet) {
        var FACE = root.DoorSpec.FACE;
        var meet = thinMeet ? FACE.PUITE_LISA : FACE.PUITE;
        return {
            left: meetingSide === 'vasen' ? meet : FACE.PUITE,
            right: meetingSide === 'oikea' ? meet : FACE.PUITE
        };
    }

    function compute(raw) {
        var spec = root.DoorSpec.normalize(raw);
        var VALO = root.DoorSpec.VALO;
        var W = spec.leveys;
        var H = spec.korkeus;
        var FACE = root.DoorSpec.FACE;
        var k = FACE.KARMI;
        var gap = spec.rako;
        var depth = spec.syvyys;
        var glassT = spec.lasi.paksuus || 18;
        var pair = spec.ovityyppi === 'pariovi';
        var hingeW = 10;
        var sidePad = VALO.W_KAYNTI / 2;
        var meet = VALO.W_PARI - VALO.W_KAYNTI;
        var gh = spec.valoaukko_h;
        var glassTop = H - FACE.KARMI - FACE.RAKO_NAAMA - FACE.PUITE;
        var gy = glassTop - gh;

        var frameOuter = box(0, 0, W, H);
        var frameInner = box(k, k, W - 2 * k, H - 2 * k);

        var leaves;
        var meeting = null;
        if (pair) {
            var walkV = spec.valoaukko_w;
            var lisaV = spec.lisaovi_valoaukko_w;
            var activeLeft = spec.saranapuoli === 'vasen';
            var leftW = activeLeft ? walkV : lisaV;
            var rightW = activeLeft ? lisaV : walkV;
            var leftGx = sidePad;
            var rightGx = sidePad + leftW + meet;
            leaves = [
                makeLeaf(leftGx, gy, leftW, gh, spec, stileEdges('oikea', !activeLeft), 'vasen', activeLeft),
                makeLeaf(rightGx, gy, rightW, gh, spec, stileEdges('vasen', activeLeft), 'oikea', !activeLeft)
            ];
            var gapL = leaves[0].outer.x + leaves[0].outer.w;
            var gapR = leaves[1].outer.x;
            meeting = { x: (gapL + gapR) / 2 };
        } else {
            var side = spec.saranapuoli === 'vasen' ? 'vasen' : 'oikea';
            leaves = [
                makeLeaf(sidePad, gy, spec.valoaukko_w, gh, spec, stileEdges(null, false), side, true)
            ];
        }

        var hinges = [];
        leaves.forEach(function (leaf) {
            var hx = leaf.hingeSide === 'vasen'
                ? -hingeW / 2
                : W - hingeW / 2;
            leaf.hinges = makeHinges(hx, leaf.hingeSide, leaf.outer);
            hinges = hinges.concat(leaf.hinges);
        });

        var first = leaves[0];
        var lockSide = spec.saranapuoli === 'vasen' ? 'oikea' : 'vasen';
        var lock = {
            x: spec.saranapuoli === 'vasen' ? frameOuter.x + frameOuter.w : frameOuter.x,
            y: spec.lukko_h,
            side: lockSide,
            w: 16,
            h: 90
        };

        var glassW = first.glass ? Math.round(first.glass.w) : 0;
        var glassH = first.glass ? Math.round(first.glass.h) : 0;

        return {
            spec: spec,
            frame: frameOuter,
            frameOuter: frameOuter,
            frameInner: frameInner,
            leaves: leaves,
            leaf: first.outer,
            leafOuter: first.outer,
            leafInner: first.inner,
            transom: first.transom,
            panel: first.panel,
            glass: first.glass,
            solid: spec.lasi.enabled ? null : first.panel,
            hinges: hinges,
            lock: lock,
            panic: null,
            sign: null,
            depth: depth,
            glassT: glassT,
            gap: gap,
            pair: pair,
            meeting: meeting,
            clear: { w: first.outer.w, h: first.outer.h },
            dims: {
                overallW: W,
                overallH: H,
                kickH: spec.potkulevy_h,
                lockH: spec.lukko_h,
                glassW: glassW,
                glassH: glassH
            }
        };
    }

    function assertTlo1214(layout) {
        var errors = [];
        function eq(name, got, want) {
            if (got !== want) errors.push(name + ': ' + got + ' ≠ ' + want);
        }
        if (!layout) {
            return ['layout puuttuu'];
        }
        eq('frame.w', layout.frame.w, 1480);
        eq('frame.h', layout.frame.h, 2310);
        eq('kick.h', layout.dims.kickH, 265);
        eq('lock.y', layout.lock.y, 1000);
        eq('leaves', layout.leaves.length, 1);
        eq('glass.w', layout.dims.glassW, 1215);
        eq('glass.h', layout.dims.glassH, 1910);
        if (layout.lock.side !== 'vasen') {
            errors.push('TLO-esimerkki: saranat oikealla, lukko vasemmalla (ulkoa)');
        }
        return errors;
    }

    root.DoorLayout = {
        compute: compute,
        assertTlo1214: assertTlo1214
    };
})(typeof window !== 'undefined' ? window : this);
