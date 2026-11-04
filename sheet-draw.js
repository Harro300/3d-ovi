/**
 * A4-vaaka-arkki: speksi vasemmalle, naamakuva oikealle.
 * window.DoorSheet
 */
(function (root) {
    'use strict';

    var SHEET_W = 297;
    var SHEET_H = 210;
    var DENOMS = [10, 15, 20, 25, 30];
    var DOOR_X = 108;
    var DOOR_Y = 10;
    var DOOR_W = SHEET_W - DOOR_X - 10;
    var DOOR_H = SHEET_H - 20;

    function scaleDenom(layout) {
        for (var i = 0; i < DENOMS.length; i++) {
            var size = root.DoorDraw.sizeMm(layout, 1 / DENOMS[i]);
            if (size.w <= DOOR_W && size.h <= DOOR_H) return DENOMS[i];
        }
        return DENOMS[DENOMS.length - 1];
    }

    function esc(s) {
        return root.DoorDraw.esc(s);
    }

    function wrapLine(line, maxChars) {
        var words = String(line || '').split(/\s+/).filter(Boolean);
        var rows = [];
        var cur = '';
        words.forEach(function (w) {
            var next = cur ? cur + ' ' + w : w;
            if (next.length > maxChars && cur) {
                rows.push(cur);
                cur = w;
            } else {
                cur = next;
            }
        });
        if (cur) rows.push(cur);
        return rows.length ? rows : [line];
    }

    function specLines(spec) {
        var lines = [];
        function add(v) {
            if (v) lines.push(v);
        }
        add(spec.jarjestelma);
        add(spec.kynnys);
        spec.lisat.forEach(add);
        if (spec.lasi && spec.lasi.enabled) {
            var lasi = 'LASI';
            if (spec.lasi.paksuus) lasi += ' ' + spec.lasi.paksuus + 'mm';
            add(lasi);
        }
        add(spec.vari);
        add(String(spec.leveys));
        add(String(spec.korkeus));
        add(String(spec.potkulevy_h));
        add(String(spec.lukko_h));
        return lines;
    }

    function titleLines(spec) {
        var katselu = spec.katselu === 'ulkoa' ? 'Ulkoa katsottuna' : spec.katselu;
        return [
            'Määrä: ' + spec.maara,
            spec.tyyppi || (spec.ovityyppi === 'pariovi' ? 'Pariovi' : 'Käyntiovi'),
            spec.tyo ? 'Työ: ' + spec.tyo : '',
            spec.tyonumero ? 'Työnumero: ' + spec.tyonumero : '',
            katselu
        ].filter(Boolean);
    }

    function leftColumn(spec) {
        var x = 12;
        var y = 22;
        var parts = [];
        titleLines(spec).forEach(function (line) {
            parts.push('<text x="' + x + '" y="' + y +
                '" font-size="4.4" font-weight="700" font-family="Arial, Helvetica, sans-serif" fill="#111">' +
                esc(line) + '</text>');
            y += 6;
        });
        var specRows = [];
        specLines(spec).forEach(function (line) {
            wrapLine(line, 34).forEach(function (row) {
                specRows.push(row);
            });
        });
        var rowH = 5.8;
        var lastY = SHEET_H - 17;
        var startY = lastY - Math.max(0, specRows.length - 1) * rowH;
        var minY = y + 12;
        if (startY < minY) startY = minY;
        specRows.forEach(function (row, i) {
            var rowY = startY + i * rowH;
            parts.push('<text x="' + x + '" y="' + rowY +
                '" font-size="4.2" font-family="Arial, Helvetica, sans-serif" fill="#111">' +
                esc(row) + '</text>');
        });
        return parts.join('');
    }

    function svg(layout) {
        var spec = layout.spec;
        var scale = 1 / scaleDenom(layout);
        var doorSize = root.DoorDraw.sizeMm(layout, scale);
        var ox = DOOR_X + Math.max(0, (DOOR_W - doorSize.w) / 2);
        var oy = DOOR_Y + Math.max(0, (DOOR_H - doorSize.h) / 2);
        var door = root.DoorDraw.group(layout, ox, oy, scale);
        var body = '<rect x="0" y="0" width="' + SHEET_W + '" height="' + SHEET_H +
            '" fill="#fff"/>' +
            '<rect x="2" y="2" width="' + (SHEET_W - 4) + '" height="' + (SHEET_H - 4) +
            '" fill="none" stroke="#bbb" stroke-width="0.4"/>' +
            '<line x1="100" y1="8" x2="100" y2="' + (SHEET_H - 8) +
            '" stroke="#ddd" stroke-width="0.3"/>' +
            leftColumn(spec) +
            door;
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' +
            SHEET_W + ' ' + SHEET_H + '" width="100%" height="100%" role="img" aria-label="Oven naamakuva">' +
            body + '</svg>';
    }

    function documentSvg(layout) {
        return '<?xml version="1.0" encoding="UTF-8"?>\n' + svg(layout);
    }

    root.DoorSheet = {
        SHEET_W: SHEET_W,
        SHEET_H: SHEET_H,
        scaleDenom: scaleDenom,
        svg: svg,
        documentSvg: documentSvg,
        specLines: specLines
    };
})(typeof window !== 'undefined' ? window : this);
