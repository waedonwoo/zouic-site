/* 色环电阻识别挑战 — 纯前端实现，无后端依赖 */
(function () {
    'use strict';

    var I18N = JSON.parse(document.getElementById('rz-i18n').textContent);

    // 色环颜色定义：数字 0-9 + 金/银（只做倍率和误差）
    var COLORS = [
        '#1a1a1a', '#7b4a2b', '#d32f2f', '#f57c00', '#fbc02d',
        '#388e3c', '#1976d2', '#7b1fa2', '#757575', '#f5f5f5'
    ];
    var HEX = { gold: '#c9a227', silver: '#bdbdbd' };
    var E24 = [10, 11, 12, 13, 15, 16, 18, 20, 22, 24, 27, 30, 33, 36, 39, 43, 47, 51, 56, 62, 68, 75, 82, 91];
    var TOLS4 = [['±5%', 'gold'], ['±10%', 'silver']];
    var TOLS5 = [['±1%', 'brown'], ['±2%', 'red'], ['±0.5%', 'green']];

    var score = 0, streak = 0, bestStreak = 0, correctCount = 0, timeLeft = 60, timerId = null;
    var current = null, lock = false;

    var $ = function (id) { return document.getElementById(id); };
    var body = $('rzBody'), answers = $('rzAnswers');

    function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

    function fmt(ohms, tol) {
        var v, u;
        if (ohms >= 1e6) { v = ohms / 1e6; u = ' MΩ'; }
        else if (ohms >= 1e3) { v = ohms / 1e3; u = ' kΩ'; }
        else { v = ohms; u = ' Ω'; }
        v = Math.round(v * 100) / 100;
        return v + u + ' ' + tol;
    }

    function bandHex(b) {
        if (b === 'gold') return HEX.gold;
        if (b === 'silver') return HEX.silver;
        return COLORS[b];
    }

    function makeQuestion() {
        // 连击 >=5 后 40% 概率出五环
        var five = streak >= 5 && Math.random() < 0.4;
        var bands, value, tolText, digits, multDigit;

        if (!five) {
            var mant = rand(E24);
            var decade = Math.floor(Math.random() * 6); // ×10^0 .. ×10^5
            value = mant * Math.pow(10, decade);
            digits = [Math.floor(mant / 10), mant % 10];
            multDigit = decade;
            var t = rand(TOLS4);
            tolText = t[0];
            bands = [digits[0], digits[1], multDigit, t[1]];
        } else {
            var mant3 = 100 + Math.floor(Math.random() * 900);
            var dec5 = Math.floor(Math.random() * 4); // ×10^0 .. ×10^3
            value = mant3 * Math.pow(10, dec5);
            digits = [Math.floor(mant3 / 100), Math.floor(mant3 / 10) % 10, mant3 % 10];
            multDigit = dec5;
            var t5 = rand(TOLS5);
            tolText = t5[0];
            bands = [digits[0], digits[1], digits[2], multDigit, t5[1]];
        }

        // 干扰项：倍率看错、数字对调、±100 倍
        var opts = [value];
        var cands = five
            ? [value * 10, value / 10, value * 100, (digits[0] * 10 + digits[1]) * Math.pow(10, multDigit)]
            : [value * 10, value / 10, (digits[1] * 10 + digits[0]) * Math.pow(10, multDigit), value * 100];
        for (var i = 0; i < cands.length && opts.length < 4; i++) {
            var c = Math.round(cands[i]);
            if (c >= 1 && c < 1e9 && opts.indexOf(c) === -1) opts.push(c);
        }
        while (opts.length < 4) { // 兜底：±20%~40% 随机值
            var f = Math.round(value * (1 + (Math.random() < 0.5 ? -1 : 1) * (0.2 + Math.random() * 0.2)));
            if (f >= 1 && opts.indexOf(f) === -1) opts.push(f);
        }
        for (var j = opts.length - 1; j > 0; j--) { // 洗牌
            var k = Math.floor(Math.random() * (j + 1));
            var tmp = opts[j]; opts[j] = opts[k]; opts[k] = tmp;
        }
        current = { value: value, tol: tolText, bands: bands, five: five, options: opts };
        render();
    }

    function render() {
        body.innerHTML = '';
        var pos4 = [20, 36, 52, 76], pos5 = [14, 27, 40, 53, 76];
        var pos = current.five ? pos5 : pos4;
        current.bands.forEach(function (b, i) {
            var d = document.createElement('div');
            d.className = 'rz-band';
            d.style.left = pos[i] + '%';
            d.style.background = bandHex(b);
            body.appendChild(d);
        });
        $('rzMode').textContent = current.five ? I18N.bands5 : I18N.bands4;
        answers.innerHTML = '';
        current.options.forEach(function (v) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = fmt(v, current.tol);
            btn.addEventListener('click', function () { answer(v, btn); });
            answers.appendChild(btn);
        });
        lock = false;
    }

    function answer(v, btn) {
        if (lock) return;
        lock = true;
        var btns = answers.querySelectorAll('button');
        btns.forEach(function (b) { b.disabled = true; });
        if (v === current.value) {
            btn.classList.add('rz-right');
            streak++;
            if (streak > bestStreak) bestStreak = streak;
            correctCount++;
            score += 10 + Math.min(streak - 1, 5) * 2;
            $('rzScore').textContent = score;
            $('rzStreak').textContent = streak;
            setTimeout(makeQuestion, 220);
        } else {
            btn.classList.add('rz-wrong');
            btns.forEach(function (b) {
                if (b.textContent === fmt(current.value, current.tol)) b.classList.add('rz-right');
            });
            streak = 0;
            $('rzStreak').textContent = 0;
            setTimeout(makeQuestion, 650);
        }
    }

    function tier(s) {
        if (s >= 200) return I18N.tier4;
        if (s >= 120) return I18N.tier3;
        if (s >= 60) return I18N.tier2;
        return I18N.tier1;
    }

    function tick() {
        timeLeft -= 0.1;
        if (timeLeft <= 0) { endGame(); return; }
        $('rzTime').textContent = Math.ceil(timeLeft);
        $('rzBar').style.width = (timeLeft / 60 * 100) + '%';
    }

    function startGame() {
        score = 0; streak = 0; bestStreak = 0; correctCount = 0; timeLeft = 60;
        $('rzScore').textContent = '0';
        $('rzStreak').textContent = '0';
        $('rzTime').textContent = '60';
        $('rzBar').style.width = '100%';
        $('rzStart').style.display = 'none';
        $('rzEnd').style.display = 'none';
        $('rzPlay').style.display = 'block';
        makeQuestion();
        clearInterval(timerId);
        timerId = setInterval(tick, 100);
    }

    function endGame() {
        clearInterval(timerId);
        $('rzPlay').style.display = 'none';
        $('rzEnd').style.display = 'block';
        $('rzFinal').textContent = score;
        var tr = tier(score);
        $('rzTier').textContent = tr;
        $('rzSummary').textContent = I18N.summaryTpl.replace('{n}', correctCount).replace('{s}', bestStreak);
        var best = parseInt(localStorage.getItem('zouic_resistor_best') || '0', 10);
        if (score > best) {
            localStorage.setItem('zouic_resistor_best', String(score));
            $('rzNewBest').style.display = 'block';
            best = score;
        } else {
            $('rzNewBest').style.display = 'none';
        }
        window._rzShare = I18N.shareTpl.replace('{score}', score).replace('{tier}', tr);
    }

    function share() {
        var text = window._rzShare || '';
        var btn = $('rzShareBtn');
        function done() {
            btn.textContent = I18N.copied;
            setTimeout(function () { btn.textContent = btn.dataset.label; }, 1600);
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done, fallback);
        } else { fallback(); }
        function fallback() {
            var ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); done(); } catch (e) { }
            document.body.removeChild(ta);
        }
    }

    // 速查表（与题目共用同一套颜色数据，不会抄错）
    function renderTable() {
        var names = I18N.colorNames.split(',');
        var tols = ['—', '±1%', '±2%', '—', '—', '±0.5%', '±0.25%', '±0.1%', '±0.05%', '—'];
        var rows = [];
        for (var i = 0; i < 10; i++) {
            rows.push('<tr><td><span class="rz-chip" style="background:' + COLORS[i] + '"></span>' + names[i] +
                '</td><td>' + i + '</td><td>×10<sup>' + i + '</sup></td><td>' + tols[i] + '</td></tr>');
        }
        rows.push('<tr><td><span class="rz-chip" style="background:' + HEX.gold + '"></span>' + names[10] + '</td><td>—</td><td>×0.1</td><td>±5%</td></tr>');
        rows.push('<tr><td><span class="rz-chip" style="background:' + HEX.silver + '"></span>' + names[11] + '</td><td>—</td><td>×0.01</td><td>±10%</td></tr>');
        $('rzTableBody').innerHTML = rows.join('');
    }

    var shareBtn = $('rzShareBtn');
    shareBtn.dataset.label = shareBtn.textContent;

    var best = parseInt(localStorage.getItem('zouic_resistor_best') || '0', 10);
    if (best > 0) { $('rzBestRow').style.display = 'block'; $('rzBest').textContent = best; }

    $('rzStartBtn').addEventListener('click', startGame);
    $('rzAgainBtn').addEventListener('click', startGame);
    shareBtn.addEventListener('click', share);
    renderTable();
})();
