/* 站内硬件计算器（/tools/…）：浏览器里算，输入不上传、不写库、无埋点。
 *
 * 这个文件和 app/services/calc_tools.py 是同一套公式的两个实现：
 * Python 负责服务端渲染的默认结果与算例，本文件负责你改动输入后的实时结果。
 * 常量与阈值都从页面内嵌的 #calcConfig 读，不在这儿抄第二份。
 * 改任何一边之前先跑 tools/check_calc_tools.py —— 它用 node 跑这个文件，
 * 把结果和 Python 的输出逐条比对，不一致就红。
 */
(function () {
    'use strict';

    var host = document.getElementById('calcConfig');
    var root = document.getElementById('calcTool');
    if (!host || !root) { return; }

    var cfg;
    try { cfg = JSON.parse(host.textContent); } catch (e) { return; }
    var C = cfg.constants;
    var TH = cfg.thresholds || {};
    var DASH = '—';

    var labels = {};
    var labelHost = document.getElementById('calcLabels');
    if (labelHost) {
        try { labels = JSON.parse(labelHost.textContent) || {}; } catch (e2) { labels = {}; }
    }
    function L(key, fallback) {
        var v = labels[key];
        return (v === undefined || v === null || v === '') ? (fallback || '') : String(v);
    }

    // ---------------------------------------------------------------- 数字格式

    /* 在「最短可往返的十进制串」上做四舍五入，和 Python 端
       Decimal(repr(v)).quantize(..., ROUND_HALF_UP) 完全一致。
       直接用 toFixed 会按二进制真值进位（2.675 → 2.67），两边就会打架。 */
    function roundHalfUp(absStr, dp) {
        var dot = absStr.indexOf('.');
        var int = dot < 0 ? absStr : absStr.slice(0, dot);
        var frac = dot < 0 ? '' : absStr.slice(dot + 1);
        if (frac.length <= dp) {
            while (frac.length < dp) { frac += '0'; }
            return int + (dp ? '.' + frac : '');
        }
        var keep = frac.slice(0, dp);
        var carry = parseInt(frac.charAt(dp), 10) >= 5 ? 1 : 0;
        var digits = (int + keep).split('');
        var i = digits.length - 1;
        while (carry) {
            if (i < 0) { digits.unshift('1'); break; }
            var d = parseInt(digits[i], 10) + 1;
            if (d === 10) { digits[i] = '0'; i -= 1; } else { digits[i] = String(d); carry = 0; }
        }
        var merged = digits.join('');
        if (dp === 0) { return merged; }
        var oi = merged.length - dp;
        return (oi > 0 ? merged.slice(0, oi) : '0') + '.' +
            (oi > 0 ? merged.slice(oi) : merged);
    }

    function fmt(v, dp) {
        if (typeof v !== 'number' || !isFinite(v)) { return DASH; }
        if (Math.abs(v) < 1e-7) { return (0).toFixed(dp); }
        var s = String(Math.abs(v));
        if (s.indexOf('e') >= 0) { return v.toFixed(dp); }
        var r = roundHalfUp(s, dp);
        return (v < 0 && parseFloat(r, 10) !== 0 ? '-' : '') + r;
    }

    function num(v) {
        var n = parseFloat(v);
        return isFinite(n) ? n : 0;
    }

    // ---------------------------------------------------------------- 公式

    function copperMil(oz) { return oz * C.milPerOz; }

    function currentForArea(areaMil2, rise, layer) {
        return C.k[layer] * Math.pow(rise, C.b) * Math.pow(areaMil2, C.c);
    }

    function widthForCurrent(cur, rise, oz, layer) {
        var area = Math.pow(cur / (C.k[layer] * Math.pow(rise, C.b)), 1 / C.c);
        return area / copperMil(oz);
    }

    function areaForCurrent(cur, rise, layer) {
        return Math.pow(cur / (C.k[layer] * Math.pow(rise, C.b)), 1 / C.c);
    }

    function resistanceOhm(lengthMm, areaMil2) {
        if (lengthMm <= 0 || areaMil2 <= 0) { return 0; }
        return C.cuRhoOhmMm2PerM * (lengthMm / 1000) / (areaMil2 * C.mmPerMil * C.mmPerMil);
    }

    function viaAreaMil2(drillMil, platingMil) {
        return Math.PI * (drillMil + platingMil) * platingMil;
    }

    function effOf(load, vIn) {
        if (load.kind === 'ldo') {
            if (vIn <= 0) { return 1; }
            return Math.min(1, load.v / vIn);
        }
        if (load.kind === 'dcdc') {
            var e = load.eff / 100;
            return e > 0 ? e : 1;
        }
        return 1;
    }

    function calcTrace(inp) {
        var cur = num(inp.current), rise = num(inp.temp_rise);
        var oz = num(inp.oz), layer = inp.layer || 'external', length = num(inp.length);
        var flags = [];
        if (rise <= 0) { flags.push('no_rise'); }
        if (cur <= 0) { flags.push('no_current'); }
        if (layer === 'internal') { flags.push('internal_layer'); }
        if (length <= 0) { flags.push('no_length'); }
        if (rise <= 0 || cur <= 0 || oz <= 0) { return {out: {}, flags: flags}; }
        var w = widthForCurrent(cur, rise, oz, layer);
        var area = w * copperMil(oz);
        var res = resistanceOhm(length, area);
        if (w < TH.processMinWidthMil) { flags.push('below_process'); }
        return {
            out: {
                thickness_mil: copperMil(oz),
                width_mil: w,
                width_mm: w * C.mmPerMil,
                area_mil2: area,
                area_mm2: area * C.mmPerMil * C.mmPerMil,
                res_ohm: res,
                vdrop_mv: res * cur * 1000,
                ploss_w: res * cur * cur
            },
            flags: flags
        };
    }

    function calcVia(inp) {
        var drillMm = num(inp.drill_mm), platingUm = num(inp.plating_um);
        var rise = num(inp.temp_rise), layer = inp.layer || 'external';
        var count = Math.max(0, num(inp.count)), board = num(inp.board_mm);
        var flags = [];
        if (rise <= 0) { flags.push('no_rise'); }
        if (drillMm <= 0 || platingUm <= 0) { flags.push('bad_geom'); }
        if (platingUm > 0 && platingUm < TH.platingMinUm) { flags.push('thin_plating'); }
        if (count > 1) { flags.push('not_derated'); }
        if (rise <= 0 || drillMm <= 0 || platingUm <= 0) { return {out: {}, flags: flags}; }
        var area = viaAreaMil2(drillMm / C.mmPerMil, platingUm / C.umPerMil);
        var iSingle = currentForArea(area, rise, layer);
        var res = resistanceOhm(board, area);
        return {
            out: {
                area_mil2: area,
                area_mm2: area * C.mmPerMil * C.mmPerMil,
                i_single: iSingle,
                i_total: iSingle * count,
                res_mohm: res * 1000,
                vdrop_mv: res * iSingle * 1000,
                ploss_mw: res * iSingle * iSingle * 1000,
                plating_mil: platingUm / C.umPerMil
            },
            flags: flags
        };
    }

    function calcPower(inp) {
        var vIn = num(inp.v_in);
        if (vIn <= 0) { return {out: {}, flags: ['bad_vin']}; }
        var loads = inp.loads || [];
        var pOut = 0, pIn = 0, ldoWorst = 0, flags = [];
        var i;
        for (i = 0; i < loads.length; i += 1) {
            var ld = loads[i];
            var po = ld.v * ld.a;
            var eff = effOf(ld, vIn);
            var pi = eff > 0 ? po / eff : po;
            pOut += po;
            pIn += pi;
            if (ld.kind === 'ldo' && vIn > ld.v) {
                var loss = (vIn - ld.v) * ld.a;
                if (loss > ldoWorst) { ldoWorst = loss; }
            }
        }
        if (!loads.length) { flags.push('empty_loads'); }
        for (i = 0; i < loads.length; i += 1) {
            if (loads[i].kind === 'ldo' && loads[i].v > vIn) { flags.push('ldo_above_rail'); break; }
        }
        if (num(inp.batt_mah) <= 0 || num(inp.batt_v) <= 0) { flags.push('no_battery'); }
        if (ldoWorst > TH.ldoHotW) { flags.push('ldo_hot'); }
        var iIn = pIn / vIn;
        var iDesign = iIn * (1 + num(inp.margin_pct) / 100);
        var wh = num(inp.batt_mah) / 1000 * num(inp.batt_v) * (num(inp.dod_pct) / 100);
        var runtime = (pIn > 0 && num(inp.batt_mah) > 0) ? wh / pIn : 0;
        return {
            out: {
                p_out_w: pOut,
                p_in_w: pIn,
                i_in_a: iIn,
                i_design_a: iDesign,
                ldo_loss_w: ldoWorst,
                energy_wh: wh,
                runtime_h: runtime,
                runtime_min: runtime * 60
            },
            flags: flags
        };
    }

    var ENGINE = {'trace-width': calcTrace, 'via-current': calcVia, 'power-budget': calcPower};

    // ---------------------------------------------------------------- DOM 绑定

    function readInputs() {
        var inp = {};
        var nodes = root.querySelectorAll('[data-calc-field]');
        for (var i = 0; i < nodes.length; i += 1) {
            var node = nodes[i];
            var id = node.getAttribute('data-calc-field');
            if (node.hasAttribute('data-calc-rows')) {
                var rows = [];
                var rs = node.querySelectorAll('[data-calc-row]');
                for (var r = 0; r < rs.length; r += 1) {
                    var row = {};
                    var cs = rs[r].querySelectorAll('[data-calc-col]');
                    for (var c = 0; c < cs.length; c += 1) {
                        var col = cs[c].getAttribute('data-calc-col');
                        var raw = cs[c].value;
                        row[col] = (col === 'name' || col === 'kind') ? raw : num(raw);
                    }
                    rows.push(row);
                }
                inp[id] = rows;
            } else {
                var field = node.querySelector('[data-calc-input]');
                if (field) { inp[id] = field.value; }
            }
        }
        return inp;
    }

    function fill(tpl, vars) {
        return String(tpl).replace(/\{(\w+)\}/g, function (m, k) {
            return (vars && vars[k] !== undefined && vars[k] !== null) ? String(vars[k]) : m;
        });
    }

    function render(out, flags) {
        var known = {};
        var i;
        for (i = 0; i < cfg.results.length; i += 1) {
            known[cfg.results[i].id] = cfg.results[i];
        }
        var outs = root.querySelectorAll('[data-calc-out]');
        for (i = 0; i < outs.length; i += 1) {
            var key = outs[i].getAttribute('data-calc-out');
            if (!known.hasOwnProperty(key)) { continue; }
            var v = out[key];
            outs[i].textContent = (v === undefined) ? DASH : fmt(v, known[key].dp);
        }
        var noteIds = {};
        for (i = 0; i < flags.length; i += 1) { noteIds[flags[i]] = true; }
        var notes = root.querySelectorAll('[data-calc-note]');
        for (i = 0; i < notes.length; i += 1) {
            var on = !!noteIds[notes[i].getAttribute('data-calc-note')];
            if (on) { notes[i].removeAttribute('hidden'); } else { notes[i].setAttribute('hidden', 'hidden'); }
            notes[i].setAttribute('aria-hidden', on ? 'false' : 'true');
        }
        var badge = document.getElementById('calcState');
        if (badge) {
            badge.textContent = flags.length === 0
                ? L('calc_state_ok', '已按当前输入计算')
                : fill(L('calc_state_notes', '已计算 · {n} 条提示'), {n: flags.length});
        }
    }

    function syncRowColumns() {
        var rows = root.querySelectorAll('[data-calc-row]');
        for (var i = 0; i < rows.length; i += 1) {
            var kindNode = rows[i].querySelector('[data-calc-col="kind"]');
            var effNode = rows[i].querySelector('[data-calc-col="eff"]');
            if (!kindNode || !effNode) { continue; }
            var usable = kindNode.value === 'dcdc';
            effNode.disabled = !usable;
            effNode.parentNode.classList.toggle('calc-col-off', !usable);
        }
    }

    function update() {
        var engine = ENGINE[cfg.slug];
        if (!engine) { return; }
        syncRowColumns();
        var res = engine(readInputs());
        render(cfg, res.out, res.flags);
    }

    function addRow() {
        var box = root.querySelector('[data-calc-rows]');
        if (!box) { return; }
        var spec = null;
        for (var i = 0; i < cfg.fields.length; i += 1) {
            if (cfg.fields[i].kind === 'rows') { spec = cfg.fields[i]; }
        }
        if (!spec) { return; }
        var row = document.createElement('div');
        row.className = 'calc-row';
        row.setAttribute('data-calc-row', '');
        for (var c = 0; c < spec.columns.length; c += 1) {
            var col = spec.columns[c];
            if (col.kind === 'select') {
                var sel = document.createElement('select');
                sel.setAttribute('data-calc-col', col.id);
                sel.setAttribute('aria-label', L('calc_' + col.id, col.label || col.id));
                var opts = (window.CALC_OPTIONS || {})[col.id] || [];
                for (var o = 0; o < opts.length; o += 1) {
                    var op = document.createElement('option');
                    op.value = opts[o].value;
                    op.textContent = opts[o].label;
                    sel.appendChild(op);
                }
                sel.value = col.def;
                row.appendChild(wrap(sel, ''));
            } else {
                var input = document.createElement('input');
                input.setAttribute('data-calc-col', col.id);
                input.type = col.kind === 'number' ? 'number' : 'text';
                if (col.kind === 'number') {
                    if (col.min !== undefined) { input.min = col.min; }
                    if (col.max !== undefined) { input.max = col.max; }
                    if (col.step !== undefined) { input.step = col.step; }
                }
                input.value = col.kind === 'number' ? col.def : L('calc_row_new_name', '新负载');
                input.setAttribute('aria-label', L('calc_' + col.id, col.label || col.id));
                row.appendChild(wrap(input, col.unit || ''));
            }
        }
        var del = document.createElement('button');
        del.type = 'button';
        del.className = 'btn-zouic btn-zouic-secondary btn-zouic-sm';
        del.setAttribute('data-calc-del', '');
        del.textContent = L('calc_row_del', '删除');
        row.appendChild(wrap(del, ''));
        box.appendChild(row);
        update();
    }

    function wrap(node, unit) {
        var cell = document.createElement('span');
        cell.className = 'calc-cell';
        cell.appendChild(node);
        if (unit) {
            var u = document.createElement('span');
            u.className = 'calc-unit';
            u.textContent = unit;
            cell.appendChild(u);
        }
        return cell;
    }

    root.addEventListener('input', update);
    root.addEventListener('change', update);
    root.addEventListener('click', function (ev) {
        var t = ev.target;
        if (!t || !t.getAttribute) { return; }
        if (t.hasAttribute('data-calc-add')) { ev.preventDefault(); addRow(); }
        else if (t.hasAttribute('data-calc-del')) {
            ev.preventDefault();
            var row = t.closest ? t.closest('[data-calc-row]') : null;
            if (row && row.parentNode) { row.parentNode.removeChild(row); }
            update();
        } else if (t.hasAttribute('data-calc-reset')) {
            ev.preventDefault();
            location.reload();
        }
    });

    update();
})();
