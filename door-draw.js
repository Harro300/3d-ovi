/**
 * Logikal / Jansen Janisol 2 -viivapiirustus.
 * Jiiriprofiilit, limisauma, potkuviivoitus, 60 mm sivu- ja pohjaleikkaus.
 * window.DoorDraw
 */
(function (root) {
    'use strict';

    var SCALE = 0.1;
    var SW = 2.6;
    var SW_OUTER = 3.2;
    var SW_THIN = 1.35;
    var SW_HATCH = 1.15;
    var SW_GLASS = 1.6;
    var SW_DIM = 1.7;
    var INK = '#1a1a1a';
    var KICK_DX = 58;
    var HEIGHT_DX = 175;
    var SIDE_DX = 340;
    var WIDTH_DY = -78;
    var PLAN_DY = -210;

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function stroke(sw) {
        return 'fill="none" stroke="' + INK + '" stroke-width="' + (sw || SW) + '" stroke-linejoin="miter"';
    }

    function rect(r, extra) {
        extra = extra || stroke(SW);
        return '<rect x="' + r.x + '" y="' + r.y + '" width="' + r.w +
            '" height="' + r.h + '" ' + extra + '/>';
    }

    function line(x1, y1, x2, y2, extra) {
        extra = extra || stroke(SW);
        return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 +
            '" y2="' + y2 + '" ' + extra + '/>';
    }

    function circle(cx, cy, r, extra) {
        extra = extra || stroke(SW);
        return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" ' + extra + '/>';
    }

    function text(x, y, s, extra) {
        extra = extra || '';
        return '<g transform="translate(' + x + ',' + y + ') scale(1,-1)">' +
            '<text x="0" y="0" ' + extra + '>' + esc(s) + '</text></g>';
    }

    var DIM_FONT = 80;

    function tickH(x, y, t) {
        t = t || 12;
        return line(x, y - t, x, y + t, stroke(SW_DIM));
    }

    function tickV(x, y, t) {
        t = t || 12;
        return line(x - t, y, x + t, y, stroke(SW_DIM));
    }

    function dimLabel(x, y, s, vertical) {
        var rot = vertical ? ' transform="rotate(90)"' : '';
        return '<g transform="translate(' + x + ',' + y + ') scale(1,-1)">' +
            '<text x="0" y="0"' + rot +
            ' text-anchor="middle" dominant-baseline="central" font-size="' + DIM_FONT +
            '" font-family="Arial, sans-serif" fill="' + INK + '">' + esc(s) + '</text></g>';
    }

    function labelHalf(label) {
        return String(label).length * DIM_FONT * 0.31 + 12;
    }

    function brokenH(x1, x2, y, label) {
        var mid = (x1 + x2) / 2;
        var half = labelHalf(label);
        var lo = Math.min(x1, x2);
        var hi = Math.max(x1, x2);
        var parts = '';
        if (mid - half > lo + 1) parts += line(lo, y, mid - half, y, stroke(SW_DIM));
        if (mid + half < hi - 1) parts += line(mid + half, y, hi, y, stroke(SW_DIM));
        return parts + dimLabel(mid, y, label, false);
    }

    function brokenV(x, y1, y2, label) {
        var mid = (y1 + y2) / 2;
        var half = labelHalf(label);
        var lo = Math.min(y1, y2);
        var hi = Math.max(y1, y2);
        var parts = '';
        if (mid - half > lo + 1) parts += line(x, lo, x, mid - half, stroke(SW_DIM));
        if (mid + half < hi - 1) parts += line(x, mid + half, x, hi, stroke(SW_DIM));
        return parts + dimLabel(x, mid, label, true);
    }

    function dimH(x1, x2, y, label, fromY) {
        var textLabel = String(label);
        var ext = '';
        if (fromY != null) {
            ext = line(x1, fromY, x1, y, stroke(SW_DIM)) +
                line(x2, fromY, x2, y, stroke(SW_DIM));
        }
        return ext + brokenH(x1, x2, y, textLabel) + tickH(x1, y) + tickH(x2, y);
    }

    function dimV(x, y1, y2, label, fromX) {
        var textLabel = String(label);
        var lo = Math.min(y1, y2);
        var hi = Math.max(y1, y2);
        var ext = '';
        if (fromX != null) {
            ext = line(fromX, lo, x, lo, stroke(SW_DIM)) +
                line(fromX, hi, x, hi, stroke(SW_DIM));
        }
        return ext + brokenV(x, lo, hi, textLabel) + tickV(x, lo) + tickV(x, hi);
    }

    function dimInsideH(g, label) {
        var y = g.y + g.h - 70;
        var pad = Math.min(18, g.w * 0.08);
        var x1 = g.x + pad;
        var x2 = g.x + g.w - pad;
        return brokenH(x1, x2, y, String(label)) + tickH(x1, y, 9) + tickH(x2, y, 9);
    }

    function dimInsideV(g, label) {
        var x = g.x + g.w - Math.min(42, g.w * 0.18);
        var y1 = g.y + 28;
        var y2 = g.y + g.h - 28;
        return brokenV(x, y1, y2, String(label)) + tickV(x, y1, 9) + tickV(x, y2, 9);
    }

    function miterCorner(ox, oy, ix, iy) {
        var dx = ix - ox;
        var dy = iy - oy;
        var adx = Math.abs(dx);
        var ady = Math.abs(dy);
        var thin = stroke(SW_THIN);
        if (Math.abs(adx - ady) < 0.6) {
            return line(ox, oy, ix, iy, thin);
        }
        var m = Math.min(adx, ady);
        var sx = dx < 0 ? -1 : 1;
        var sy = dy < 0 ? -1 : 1;
        var mx = ix - sx * m;
        var my = iy - sy * m;
        return line(ix, iy, mx, my, thin);
    }

    function miterFrame(outer, inner, outerSw) {
        var parts = [];
        parts.push(rect(outer, stroke(outerSw || SW)));
        parts.push(rect(inner, stroke(SW)));
        parts.push(miterCorner(outer.x, outer.y, inner.x, inner.y));
        parts.push(miterCorner(outer.x + outer.w, outer.y, inner.x + inner.w, inner.y));
        parts.push(miterCorner(outer.x, outer.y + outer.h, inner.x, inner.y + inner.h));
        parts.push(miterCorner(outer.x + outer.w, outer.y + outer.h, inner.x + inner.w, inner.y + inner.h));
        return parts.join('');
    }

    function hatch45(r, step) {
        if (!r || r.w < 8 || r.h < 8) return '';
        var parts = [];
        var x0 = r.x;
        var y0 = r.y;
        var x1 = r.x + r.w;
        var y1 = r.y + r.h;
        var c0 = y0 - x1;
        var c1 = y1 - x0;
        var c = Math.ceil(c0 / step) * step;
        for (; c <= c1 + 0.01; c += step) {
            var pts = [];
            function push(px, py) {
                if (px < x0 - 0.05 || px > x1 + 0.05 || py < y0 - 0.05 || py > y1 + 0.05) return;
                var i;
                for (i = 0; i < pts.length; i++) {
                    if (Math.abs(pts[i][0] - px) < 0.3 && Math.abs(pts[i][1] - py) < 0.3) return;
                }
                pts.push([px, py]);
            }
            push(x0, x0 + c);
            push(x1, x1 + c);
            push(y0 - c, y0);
            push(y1 - c, y1);
            if (pts.length >= 2) {
                parts.push(line(pts[0][0], pts[0][1], pts[1][0], pts[1][1], stroke(SW_HATCH)));
            }
        }
        return parts.join('');
    }

    function hingeMark(h) {
        return rect({ x: h.x, y: h.y - h.h / 2, w: h.w, h: h.h },
            stroke(SW) + ' rx="1.5"');
    }

    function handMark(g, hingeSide) {
        var letter = hingeSide === 'vasen' ? 'L' : 'R';
        var cx = g.x + g.w / 2;
        var cy = g.y + g.h / 2;
        return text(cx, cy, letter,
            'text-anchor="middle" dominant-baseline="central" font-size="140" font-family="Arial, sans-serif" fill="' + INK + '"');
    }

    function glassBend(g, hingeSide) {
        var hingeX = hingeSide === 'vasen' ? g.x : g.x + g.w;
        var meetX = hingeSide === 'vasen' ? g.x + g.w : g.x;
        var top = g.y + g.h;
        var mid = g.y + g.h / 2;
        var thin = stroke(SW_GLASS);
        return line(hingeX, top, meetX, mid, thin) +
            line(meetX, mid, hingeX, g.y, thin);
    }

    function drawLeaf(leaf, layout) {
        var inner = leaf.inner || leaf.glass || leaf.panel;
        if (!inner) return '';
        var parts = [];
        parts.push(miterFrame(leaf.outer, inner, SW));
        if (leaf.panel && leaf.glass) {
            parts.push(line(inner.x, leaf.glass.y, inner.x + inner.w, leaf.glass.y, stroke(SW)));
            if (leaf.kickRail) {
                parts.push(line(leaf.kickRail.x, leaf.kickRail.y,
                    leaf.kickRail.x + leaf.kickRail.w, leaf.kickRail.y, stroke(SW)));
            }
            parts.push(hatch45(leaf.panel, 18));
        }
        if (leaf.glass) {
            parts.push(glassBend(leaf.glass, leaf.hingeSide));
            if (leaf.active) parts.push(handMark(leaf.glass, leaf.hingeSide));
            parts.push(dimInsideH(leaf.glass, Math.round(leaf.glass.w)));
            if (leaf.active) parts.push(dimInsideV(leaf.glass, Math.round(leaf.glass.h)));
        }
        return parts.join('');
    }

    function kickOf(layout) {
        var h = layout.dims.kickH;
        var g = layout.glass;
        var minKick = root.DoorSpec.VALO.KICK_MIN;
        if (!(h >= minKick) || !g) return null;
        var y = Math.max(0, g.y - h);
        return { y: y, h: g.y - y };
    }

    function elevation(layout) {
        var f = layout.frameOuter;
        var parts = [];
        parts.push(miterFrame(layout.frameOuter, layout.frameInner, SW_OUTER));
        (layout.leaves || []).forEach(function (leaf) {
            parts.push(drawLeaf(leaf, layout));
        });
        (layout.hinges || []).forEach(function (h) {
            parts.push(hingeMark(h));
        });

        parts.push(dimH(f.x, f.x + f.w, WIDTH_DY, layout.dims.overallW, f.y));
        var kick = kickOf(layout);
        var heightX = f.x + f.w + HEIGHT_DX;
        if (kick) {
            parts.push(dimV(f.x + f.w + KICK_DX, kick.y, kick.y + kick.h,
                layout.dims.kickH, f.x + f.w));
        }
        parts.push(dimV(heightX, f.y, f.y + f.h, layout.dims.overallH, f.x + f.w));
        return parts.join('');
    }

    function endBlock(x, y, w, h) {
        var thin = stroke(SW_THIN);
        var parts = [];
        parts.push(rect({ x: x, y: y, w: w, h: h }, thin));
        parts.push(line(x, y + h * 0.38, x + w, y + h * 0.38, thin));
        parts.push(line(x, y + h * 0.62, x + w, y + h * 0.62, thin));
        parts.push(line(x + w * 0.42, y + 3, x + w * 0.42, y + h - 3, thin));
        parts.push(line(x + w * 0.58, y + 3, x + w * 0.58, y + h - 3, thin));
        return parts.join('');
    }

    function sideView(layout) {
        var d = layout.depth || 60;
        var H = layout.frameOuter.h;
        var head = 86;
        var sill = 72;
        var parts = [];
        var thin = stroke(SW_THIN);
        parts.push(rect({ x: 0, y: 0, w: d, h: H }, stroke(SW_OUTER)));
        parts.push(endBlock(3, H - head, d - 6, head - 3));
        parts.push(endBlock(3, 3, d - 6, sill - 3));
        var y0 = sill;
        var y1 = H - head;
        parts.push(line(4, y0, 4, y1, stroke(SW)));
        parts.push(line(d - 4, y0, d - 4, y1, stroke(SW)));
        if (layout.glass) {
            var gy0 = Math.max(layout.glass.y, y0);
            var gy1 = Math.min(layout.glass.y + layout.glass.h, y1);
            var gt = Math.min(layout.glassT || 12, d * 0.22);
            var gx = (d - gt) / 2;
            parts.push(line(gx, gy0, gx, gy1, stroke(SW_GLASS)));
            parts.push(line(gx + gt, gy0, gx + gt, gy1, stroke(SW_GLASS)));
        }
        var sideLeaf = (layout.leaves || []).filter(function (l) { return l.active; })[0];
        var hinges = (sideLeaf && sideLeaf.hinges) || [];
        hinges.forEach(function (h) {
            parts.push(circle(-8, h.y, 6, stroke(SW)));
            parts.push(line(-2, h.y - 11, 8, h.y - 11, thin));
            parts.push(line(-2, h.y + 11, 8, h.y + 11, thin));
        });
        return parts.join('');
    }

    function jambPlan(x, d) {
        var w = 58;
        var thin = stroke(SW_THIN);
        return rect({ x: x, y: 0, w: w, h: d }, stroke(SW)) +
            rect({ x: x + 6, y: 6, w: w - 12, h: d - 12 }, thin) +
            line(x + 6, d * 0.42, x + w - 6, d * 0.42, thin) +
            line(x + 6, d * 0.58, x + w - 6, d * 0.58, thin);
    }

    function planView(layout) {
        var W = layout.frameOuter.w;
        var d = layout.depth || 60;
        var jamb = 58;
        var yLeaf = d / 2;
        var parts = [];
        parts.push(jambPlan(0, d));
        parts.push(jambPlan(W - jamb, d));
        var x0 = jamb;
        var x1 = W - jamb;
        var heavy = stroke(SW_OUTER);
        if (layout.meeting) {
            var mx = layout.meeting.x;
            parts.push(line(x0, yLeaf, mx - 7, yLeaf, heavy));
            parts.push(line(mx - 7, yLeaf, mx - 7, yLeaf + 9, stroke(SW)));
            parts.push(line(mx - 7, yLeaf + 9, mx + 7, yLeaf + 9, stroke(SW)));
            parts.push(line(mx + 7, yLeaf + 9, mx + 7, yLeaf, stroke(SW)));
            parts.push(line(mx + 7, yLeaf, x1, yLeaf, heavy));
        } else {
            parts.push(line(x0, yLeaf, x1, yLeaf, heavy));
        }
        var seen = {};
        (layout.hinges || []).forEach(function (h) {
            if (seen[h.side]) return;
            seen[h.side] = true;
            if (h.side === 'vasen') {
                parts.push(rect({ x: -8, y: d - 14, w: 10, h: 10 }, stroke(SW)));
            } else {
                parts.push(rect({ x: W - 2, y: d - 14, w: 10, h: 10 }, stroke(SW)));
            }
        });
        return parts.join('');
    }

    function assembly(layout) {
        var sideX = layout.frameOuter.w + SIDE_DX;
        return elevation(layout) +
            '<g class="door-side" transform="translate(' + sideX + ',0)">' + sideView(layout) + '</g>' +
            '<g class="door-plan" transform="translate(0,' + PLAN_DY + ')">' + planView(layout) + '</g>';
    }

    function group(layout, originX, originY) {
        var h = layout.frame.h * SCALE;
        var extraLeft = 3;
        var tx = originX + extraLeft;
        var ty = originY + h;
        return '<g class="door-elevation" transform="translate(' + tx + ',' + ty +
            ') scale(' + SCALE + ',' + (-SCALE) + ')">' + assembly(layout) + '</g>';
    }

    function sizeMm(layout) {
        var d = layout.depth || 60;
        return {
            w: (layout.frame.w + SIDE_DX + d + 70) * SCALE,
            h: (layout.frame.h - PLAN_DY + d + 12) * SCALE
        };
    }

    root.DoorDraw = {
        SCALE: SCALE,
        elevation: elevation,
        assembly: assembly,
        group: group,
        sizeMm: sizeMm,
        esc: esc
    };
})(typeof window !== 'undefined' ? window : this);
