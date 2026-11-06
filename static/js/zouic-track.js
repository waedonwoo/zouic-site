/*!
 * ZouIC 埋点 SDK v2（页面事件 + 点击热力）
 *
 * 站点用法（全站唯一入口，base.html 引用）：
 *   <script defer src="/static/js/zouic-track.js"
 *           data-api="{{ monitor_api }}" data-site="zouic"></script>
 *
 * 站外复用（中台 /tracker.js 端点）时不需要 data-api，自动按脚本来源推断。
 *
 * 采集边界：
 *   - 不采输入内容、不采鼠标轨迹、不做跨站追踪、不读设备指纹。
 *   - 访客标识是 localStorage 里的随机 32 位十六进制串，180 天轮换，
 *     服务端只存 HMAC 哈希；DNT / GPC / 拒绝存储时不生成标识。
 *   - 上报全部异步，失败静默丢弃，绝不阻塞页面。
 */
(function () {
    'use strict';

    var script = document.currentScript;
    var api = ((script && script.getAttribute('data-api')) || window.MONITOR_API || '');
    if (!api && script && script.src) {
        try { api = new URL(script.src).origin; } catch (e) { api = ''; }
    }
    api = String(api).replace(/\/$/, '');
    if (!api) return;
    var site = (script && script.getAttribute('data-site')) || window.MONITOR_SITE || 'zouic';
    var VID_TTL = 180 * 86400000;
    var CLICK_BATCH = 20;
    var FLUSH_MS = 15000;

    /* ---------------- 访客标识 ---------------- */
    function dnt() {
        return navigator.doNotTrack === '1' || window.doNotTrack === '1' ||
            navigator.msDoNotTrack === '1' || navigator.globalPrivacyControl === true;
    }

    function genVid() {
        var bytes = new Uint8Array(16);
        var c = window.crypto || window.msCrypto;
        if (!c || !c.getRandomValues) return '';
        c.getRandomValues(bytes);
        var out = '';
        for (var i = 0; i < bytes.length; i++) {
            out += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
        }
        return out;
    }

    var vid = '';
    try {
        if (!dnt()) {
            var now = Date.now();
            var stored = localStorage.getItem('zouic_vid');
            var born = parseInt(localStorage.getItem('zouic_vid_ts') || '0', 10);
            if (/^[0-9a-f]{32}$/.test(stored || '') && now - born < VID_TTL) {
                vid = stored;
            } else {
                vid = genVid();
                if (vid) {
                    localStorage.setItem('zouic_vid', vid);
                    localStorage.setItem('zouic_vid_ts', String(now));
                }
            }
        }
    } catch (e) { vid = ''; }

    /* ---------------- 通用上报 ---------------- */
    function post(path, payload) {
        var body = JSON.stringify(payload);
        try {
            if (navigator.sendBeacon &&
                navigator.sendBeacon(api + path, new Blob([body], { type: 'text/plain;charset=UTF-8' }))) {
                return;
            }
        } catch (e) { /* 走兜底 */ }
        try {
            fetch(api + path, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
                body: body,
                keepalive: true,
                credentials: 'omit'
            }).catch(function () {});
        } catch (e) { /* 静默 */ }
    }

    function scr() {
        var s = window.screen || {};
        return (s.width > 0 && s.height > 0) ? s.width + 'x' + s.height : '';
    }

    function vp() {
        return window.innerWidth + 'x' + window.innerHeight;
    }

    function navPerf() {
        try {
            var n = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
            if (n && n.loadEventEnd > 0) return Math.round(n.loadEventEnd);
        } catch (e) { /* ignore */ }
        return 0;
    }

    function errFlag() {
        if (window.ZOUIC_ERR) return 1;
        var el = document.documentElement;
        return el && el.getAttribute('data-err') ? 1 : 0;
    }

    function pagePath() {
        return (location.pathname + location.search + (location.hash || '')).slice(0, 300);
    }

    /* ---------------- 页面事件（每页一次） ---------------- */
    var pageSent = false;

    function sendPage() {
        if (pageSent) return;
        pageSent = true;
        post('/collect', {
            v: 2,
            site: site,
            path: pagePath(),
            title: (document.title || '').slice(0, 200),
            ref: document.referrer || '',
            lang: navigator.language || '',
            tz: (function () {
                try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; }
                catch (e) { return ''; }
            })(),
            scr: scr(),
            vp: vp(),
            dpr: window.devicePixelRatio || 1,
            vid: vid,
            perf: navPerf(),
            err: errFlag()
        });
    }

    /* ---------------- 点击 + 滚动热力（批量） ---------------- */
    var clicks = [];
    var maxDepth = 0;
    var sentDepth = -1;
    var timer = null;

    function docBox() {
        var el = document.documentElement;
        return {
            w: Math.max(el.scrollWidth || 0, window.innerWidth || 0, 1),
            h: Math.max(el.scrollHeight || 0, window.innerHeight || 0, 1)
        };
    }

    function clamp999(v) {
        v = Math.round(v);
        return v < 0 ? 0 : (v > 999 ? 999 : v);
    }

    function measureDepth() {
        var h = docBox().h;
        var seen = (window.scrollY || window.pageYOffset || 0) + (window.innerHeight || 0);
        var pct = h > 1 ? Math.min(100, Math.max(0, Math.round(seen / h * 100))) : 100;
        if (pct > maxDepth) maxDepth = pct;
    }

    function flush() {
        if (timer) { clearTimeout(timer); timer = null; }
        measureDepth();
        if (!clicks.length && maxDepth <= sentDepth) return;
        var box = docBox();
        post('/collect/clicks', {
            v: 2,
            site: site,
            page: location.pathname.slice(0, 200),
            vid: vid,
            scr: scr(),
            doc: [box.w, box.h],
            depth: maxDepth,
            cls: clicks.slice(0, 40)
        });
        clicks = [];
        sentDepth = maxDepth;
    }

    function schedule() {
        if (!timer) timer = setTimeout(flush, FLUSH_MS);
    }

    function onClick(e) {
        if (!e.isTrusted) return;             // 忽略脚本合成的事件
        var box = docBox();
        var x = ((window.scrollX || window.pageXOffset || 0) + e.clientX) / box.w * 999;
        var y = ((window.scrollY || window.pageYOffset || 0) + e.clientY) / box.h * 999;
        clicks.push([clamp999(x), clamp999(y)]);
        if (clicks.length >= CLICK_BATCH) flush();
        else schedule();
    }

    function boot() {
        sendPage();
        measureDepth();
        sentDepth = maxDepth;
        document.addEventListener('click', onClick, true);
        window.addEventListener('scroll', measureDepth, { passive: true });
        window.addEventListener('resize', measureDepth, { passive: true });
    }

    if (document.readyState === 'complete') setTimeout(boot, 0);
    else window.addEventListener('load', function () { setTimeout(boot, 120); });

    window.addEventListener('pagehide', function () {
        if (!pageSent) sendPage();
        flush();
    });
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') flush();
    });
})();
