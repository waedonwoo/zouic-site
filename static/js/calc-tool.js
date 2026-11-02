/* 站内硬件计算器（/tools/…）：浏览器里算，输入不上传、不写库、无埋点。
 *
 * 这个文件和 app/services/calc_tools.py 是同一套公式的两个实现：
 * Python 负责服务端渲染的默认结果与算例，本文件负责你改动输入后的实时结果。
 * 常量与阈值都从页面内嵌的 #calcConfig 读，不在这儿抄第二份。
 *
 * 纯计算部分（engine/fmt）不碰 DOM，并挂到 globalThis.ZouicCalc：
 * tools/check_calc_tools.py 用 node 直接调用它，把结果和 Python 逐条比对，
 * 两边不一致就红。改任何一边之前先跑那个闸门。
 */
(function (global) {
    'use strict';

    var DASH = '—';
    var doc = (typeof document !== 'undefined') ? document : null;

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
        return (oi > 0 ? merged.slice(0, oi) : '0') + '.' + merged.slice(Math.max(oi, 0));
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
        if (typeof v === 'number') { return isFinite(v) ? v : 0; }
        var n = parseFloat(v);
        return isFinite(n) ? n : 0;
    }

    // ---------------------------------------------------------------- 公式

    function copperMil(C, oz) { return oz * C.milPerOz; }

    function currentForArea(C, areaMil2, rise, layer) {
        return C.k[layer] * Math.pow(rise, C.b) * Math.pow(areaMil2, C.c);
    }

    function areaForCurrent(C, cur, rise, layer) {
        return Math.pow(cur / (C.k[layer] * Math.pow(rise, C.b)), 1 / C.c);
    }

    function resistanceOhm(C, lengthMm, areaMil2) {
        if (lengthMm <= 0 || areaMil2 <= 0) { return 0; }
        return C.cuRhoOhmMm2PerM * (lengthMm / 1000) / (areaMil2 * C.mmPerMil * C.mmPerMil);
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

    function calcTrace(C, TH, inp) {
        var cur = num(inp.current), rise = num(inp.temp_rise);
        var oz = num(inp.oz), layer = inp.layer || 'external', length = num(inp.length);
        var flags = [];
        if (rise <= 0) { flags.push('no_rise'); }
        if (cur <= 0) { flags.push('no_current'); }
        if (layer === 'internal') { flags.push('internal_layer'); }
        if (length <= 0) { flags.push('no_length'); }
        if (rise <= 0 || cur <= 0 || oz <= 0) { return {out: {}, flags: flags}; }
        var area = areaForCurrent(C, cur, rise, layer);
        var w = area / copperMil(C, oz);
        var res = resistanceOhm(C, length, area);
        if (w < TH.processMinWidthMil) { flags.push('below_process'); }
        return {
            out: {
                thickness_mil: copperMil(C, oz),
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

    function calcVia(C, TH, inp) {
        var drillMm = num(inp.drill_mm), platingUm = num(inp.plating_um);
        var rise = num(inp.temp_rise), layer = inp.layer || 'external';
        var count = Math.max(0, num(inp.count)), board = num(inp.board_mm);
        var flags = [];
        if (rise <= 0) { flags.push('no_rise'); }
        if (drillMm <= 0 || platingUm <= 0) { flags.push('bad_geom'); }
        if (platingUm > 0 && platingUm < TH.platingMinUm) { flags.push('thin_plating'); }
        if (count > 1) { flags.push('not_derated'); }
        if (rise <= 0 || drillMm <= 0 || platingUm <= 0) { return {out: {}, flags: flags}; }
        var drill = drillMm / C.mmPerMil, plating = platingUm / C.umPerMil;
        var area = Math.PI * (drill + plating) * plating;
        var iSingle = currentForArea(C, area, rise, layer);
        var res = resistanceOhm(C, board, area);
        return {
            out: {
                area_mil2: area,
                area_mm2: area * C.mmPerMil * C.mmPerMil,
                i_single: iSingle,
                i_total: iSingle * count,
                res_mohm: res * 1000,
                vdrop_mv: res * iSingle * 1000,
                ploss_mw: res * iSingle * iSingle * 1000,
                plating_mil: plating
            },
            flags: flags
        };
    }

    function calcPower(C, TH, inp) {
        var vIn = num(inp.v_in);
        if (vIn <= 0) { return {out: {}, flags: ['bad_vin']}; }
        var loads = inp.loads || [];
        var pOut = 0, pIn = 0, ldoWorst = 0, flags = [], i, ld, po, eff, pi;
        for (i = 0; i < loads.length; i += 1) {
            ld = loads[i];
            po = num(ld.v) * num(ld.a);
            // eff 缺省时按 90% 算，和 Python 的 load.get('eff', 90.0) 对齐
            eff = effOf({v: num(ld.v), kind: ld.kind,
                         eff: (ld.eff === undefined || ld.eff === null || ld.eff === '')
                             ? 90 : num(ld.eff)}, vIn);
            pi = eff > 0 ? po / eff : po;
            pOut += po;
            pIn += pi;
            if (ld.kind === 'ldo' && vIn > num(ld.v)) {
                var loss = (vIn - num(ld.v)) * num(ld.a);
                if (loss > ldoWorst) { ldoWorst = loss; }
            }
        }
        if (!loads.length) { flags.push('empty_loads'); }
        for (i = 0; i < loads.length; i += 1) {
            if (loads[i].kind === 'ldo' && num(loads[i].v) > vIn) { flags.push('ldo_above_rail'); break; }
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

    function compute(slug, inputs, C, TH) {
        var fn = ENGINE[slug];
        if (!fn) { return {out: {}, flags: []}; }
        return fn(C, TH || {}, inputs || {});
    }

    if (global) { global.ZouicCalc = {compute: compute, fmt: fmt}; }

    // ---------------------------------------------------------------- 以下是 DOM 部分

    if (!doc) { return; }
    var host = doc.getElementById('calcConfig');
    var root = doc.getElementById('calcTool');
    if (!host || !root) { return; }

    var cfg;
    try { cfg = JSON.parse(host.textContent); } catch (e) { return; }
    var CONST = cfg.constants;
    var THRESH = cfg.thresholds || {};

    var labels = {};
    var labelHost = doc.getElementById('calcLabels');
    if (labelHost) {
        try { labels = JSON.parse(labelHost.textContent) || {}; } catch (e2) { labels = {}; }
    }
    function L(key, fallback) {
        var v = labels[key];
        return (v === undefined || v === null || v === '') ? (fallback || '') : String(v);
    }
    function fill(tpl, vars) {
        return String(tpl).replace(/\{(\w+)\}/g, function (m, k) {
            return (vars && vars[k] !== undefined && vars[k] !== null) ? String(vars[k]) : m;
        });
    }

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
                        row[col] = (col === 'name' || col === 'kind')
                            ? cs[c].value : num(cs[c].value);
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

    function render(out, flags) {
        var known = {}, i;
        for (i = 0; i < cfg.results.length; i += 1) { known[cfg.results[i].id] = cfg.results[i]; }
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
        var badge = doc.getElementById('calcState');
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
            if (effNode.parentNode && effNode.parentNode.classList) {
                effNode.parentNode.classList.toggle('calc-col-off', !usable);
            }
        }
    }

    function update() {
        syncRowColumns();
        var res = compute(cfg.slug, readInputs(), CONST, THRESH);
        render(res.out, res.flags);
    }

    /* 新增一行 = 克隆服务端渲染的模板行。
       模板行里的选项文案、单位、默认值都跟着页面语言走，
       JS 不自己拼一套标签，否则德语页上会长出中文行。 */
    function addRow() {
        var box = root.querySelector('[data-calc-rows]');
        var tpl = doc.getElementById('calcRowTemplate');
        if (!box || !tpl || !tpl.content) { return; }
        box.appendChild(tpl.content.cloneNode(true));
        update();
    }

    function removeRow(node) {
        var row = node;
        while (row && row !== root && !(row.getAttribute && row.getAttribute('data-calc-row') !== null)) {
            row = row.parentNode;
        }
        if (row && row !== root && row.parentNode) { row.parentNode.removeChild(row); }
    }

    root.addEventListener('input', update);
    root.addEventListener('change', update);
    root.addEventListener('click', function (ev) {
        var t = ev.target;
        if (!t || !t.getAttribute) { return; }
        if (t.hasAttribute('data-calc-add')) { ev.preventDefault(); addRow(); }
        else if (t.hasAttribute('data-calc-del')) {
            ev.preventDefault();
            removeRow(t);
            update();
        }
    });

    update();
})(typeof globalThis !== 'undefined' ? globalThis : this);
