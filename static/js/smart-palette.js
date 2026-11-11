/* ZouIC 智能命令面板（Ctrl/⌘ + K）
 *
 * 目标：任何页面一步到达目标，而不是先跳搜索页再筛。
 * - 输入即搜：调用 /api/v2/search（服务端 BM25 + 查询理解，毫秒级）
 * - 键盘优先：↑↓ 选择、↵ 打开、ESC 关闭
 * - 离线兜底：接口不可用（静态托管）时退回内置导航索引，并明确提示
 * - 不缓存敏感内容：最近浏览只存在 localStorage，可一键清除
 */
(function () {
    'use strict';

    var API = '/api/v2/search';
    var RECENT_KEY = 'zouic.recent';
    var MAX_RECENT = 5;

    var KIND = {
        board: '开发板',
        site: '站内项目',
        external: '收录项目',
        article: '文章'
    };

    // 静态兜底索引：接口不可用时至少能跳转
    var NAV = [
        { title: '开源开发板', url: '/boards/', kind: 'board' },
        { title: '开源项目总库', url: '/all-projects/', kind: 'site' },
        { title: '开发板对比', url: '/compare/', kind: 'board' },
        { title: '选型指南', url: '/board-guide/', kind: 'article' },
        { title: '开发板教程', url: '/tutorials/', kind: 'article' },
        { title: '技术文档', url: '/documentation/', kind: 'article' },
        { title: '技术文章', url: '/articles/', kind: 'article' },
        { title: '在线工具', url: '/online-tools/', kind: 'article' },
        { title: '硬件计算器', url: '/tools/', kind: 'article' },
        { title: '数据大屏', url: '/dashuju/', kind: 'article' },
        { title: '资源导航', url: '/resources/', kind: 'article' },
        { title: '创意树洞', url: '/ideas/', kind: 'article' },
        { title: '商务合作 · 元器件撮合', url: '/services/component-matching/', kind: 'site' },
        { title: '服务报价', url: '/pricing/', kind: 'site' },
        { title: '关于站长老周', url: '/about/', kind: 'site' }
    ];

    var state = {
        open: false,
        items: [],
        active: 0,
        token: 0,
        lastQuery: ''
    };

    var els = {
        root: null,
        input: null,
        body: null,
        trigger: null
    };

    function esc(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
        });
    }

    function readRecent() {
        try {
            var raw = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
            return Array.isArray(raw) ? raw.slice(0, MAX_RECENT) : [];
        } catch (e) {
            return [];
        }
    }

    function pushRecent(item) {
        if (!item || !item.url) { return; }
        try {
            var list = readRecent().filter(function (row) { return row.url !== item.url; });
            list.unshift({ title: item.title, url: item.url, kind: item.kind || '' });
            localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
        } catch (e) { /* 隐私模式下 localStorage 不可用，忽略 */ }
    }

    function renderRows(rows) {
        if (!rows.length) { return ''; }
        return rows.map(function (row, i) {
            var kind = row.kind && KIND[row.kind] ? '<span class="cmd-kind">' + KIND[row.kind] + '</span>' : '';
            var meta = row.meta ? '<span class="cmd-meta">' + esc(row.meta) + '</span>' : '';
            return '<a class="cmd-row' + (i === state.active ? ' is-active' : '') + '" href="' + esc(row.url) + '"' +
                ' data-cmd-index="' + i + '" data-cmd-url="' + esc(row.url) + '">' +
                '<span class="cmd-row-main"><span class="cmd-title">' + esc(row.title) + '</span>' + meta + '</span>' +
                kind + '</a>';
        }).join('');
    }

    function paint(groups, note) {
        var html = '';
        var flat = [];
        groups.forEach(function (group) {
            if (!group.rows.length) { return; }
            html += '<div class="cmd-group"><span class="cmd-group-label">' + esc(group.label) + '</span>' +
                renderRows(group.rows) + '</div>';
            group.rows.forEach(function (row) { flat.push(row); });
        });
        if (!html) {
            html = '<div class="cmd-empty"><i class="fas fa-compass"></i>' +
                '<p>没有找到匹配的条目</p><p class="cmd-empty-hint">试试「200元以内的esp32」或「带wifi的stm32」</p></div>';
        }
        if (note) {
            html += '<div class="cmd-note">' + esc(note) + '</div>';
        }
        els.body.innerHTML = html;
        state.items = flat;
        if (state.active >= flat.length) { state.active = 0; }
        highlight();
    }

    function highlight() {
        var rows = els.body.querySelectorAll('.cmd-row');
        rows.forEach(function (row, i) {
            row.classList.toggle('is-active', i === state.active);
        });
        var current = els.body.querySelector('.cmd-row.is-active');
        if (current && current.scrollIntoView) {
            current.scrollIntoView({ block: 'nearest' });
        }
    }

    function openPalette() {
        if (!els.root) { return; }
        state.open = true;
        els.root.hidden = false;
        document.documentElement.classList.add('cmd-open');
        setTimeout(function () { els.input.focus(); els.input.select(); }, 10);
        if (!els.input.value) { showDefault(); }
    }

    function closePalette() {
        state.open = false;
        if (els.root) { els.root.hidden = true; }
        document.documentElement.classList.remove('cmd-open');
    }

    function showDefault() {
        var recent = readRecent();
        paint([
            { label: '最近浏览', rows: recent },
            { label: '快捷跳转', rows: NAV.slice(0, 8) }
        ]);
    }

    function localFilter(query) {
        var needle = query.toLowerCase();
        var rows = NAV.filter(function (row) {
            return row.title.toLowerCase().indexOf(needle) !== -1;
        });
        return rows;
    }

    function searchRemote(query) {
        var token = ++state.token;
        fetch(API + '?limit=8&q=' + encodeURIComponent(query), { headers: { Accept: 'application/json' } })
            .then(function (resp) {
                if (!resp.ok) { throw new Error('http ' + resp.status); }
                return resp.json();
            })
            .then(function (data) {
                if (token !== state.token || !state.open) { return; }
                var results = (data && data.results) || [];
                var rows = results.map(function (item) {
                    var meta = [];
                    if (item.vendor) { meta.push(item.vendor); }
                    if (item.price) { meta.push(item.price); }
                    return {
                        title: item.title,
                        url: item.url,
                        kind: item.kind,
                        meta: meta.join(' · ')
                    };
                });
                var groups = [{ label: '站内结果', rows: rows }];
                groups.push({
                    label: '继续',
                    rows: [{ title: '在搜索页查看「' + query + '」的全部结果', url: '/search/?q=' + encodeURIComponent(query), kind: '' }]
                });
                paint(groups, rows.length ? '' : '没有完全匹配的条目，可以直接去搜索页看看');
            })
            .catch(function () {
                if (token !== state.token) { return; }
                var rows = localFilter(query);
                var groups = [{ label: '导航匹配', rows: rows }];
                groups.push({
                    label: '继续',
                    rows: [{ title: '在搜索页搜索「' + query + '」', url: '/search/?q=' + encodeURIComponent(query), kind: '' }]
                });
                paint(groups, '在线检索不可用，已改用本地导航索引');
            });
    }

    var timer = null;
    function onInput() {
        var query = els.input.value.trim();
        if (query === state.lastQuery) { return; }
        state.lastQuery = query;
        state.active = 0;
        if (!query) { showDefault(); return; }
        clearTimeout(timer);
        timer = setTimeout(function () { searchRemote(query); }, 120);
    }

    function onKeydown(event) {
        if (!state.open) { return; }
        if (event.key === 'Escape') {
            event.preventDefault();
            closePalette();
            return;
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            var total = state.items.length;
            if (!total) { return; }
            state.active = (state.active + (event.key === 'ArrowDown' ? 1 : -1) + total) % total;
            highlight();
            return;
        }
        if (event.key === 'Enter') {
            var current = state.items[state.active];
            if (current && current.url) {
                event.preventDefault();
                pushRecent(current);
                window.location.href = current.url;
            }
        }
    }

    function onClick(event) {
        var row = event.target.closest ? event.target.closest('.cmd-row') : null;
        if (row && row.getAttribute('data-cmd-url')) {
            pushRecent({ title: row.querySelector('.cmd-title').textContent, url: row.getAttribute('data-cmd-url') });
            return;   // 交给浏览器默认跳转
        }
        if (event.target.closest('[data-cmd-close]')) {
            closePalette();
        }
    }

    function bind() {
        els.root = document.getElementById('cmdPalette');
        if (!els.root) { return; }
        els.input = document.getElementById('cmdInput');
        els.body = document.getElementById('cmdBody');
        els.trigger = document.getElementById('cmdTrigger');

        if (els.trigger) {
            els.trigger.addEventListener('click', function (event) {
                event.preventDefault();
                openPalette();
            });
        }
        document.addEventListener('keydown', function (event) {
            var key = (event.key || '').toLowerCase();
            if ((event.metaKey || event.ctrlKey) && key === 'k') {
                event.preventDefault();
                state.open ? closePalette() : openPalette();
            }
        });
        els.root.addEventListener('keydown', onKeydown);
        els.root.addEventListener('click', onClick);
        els.input.addEventListener('input', onInput);
        els.input.addEventListener('focus', function () {
            if (!els.input.value.trim()) { showDefault(); }
        });
        document.querySelectorAll('[data-cmd-open]').forEach(function (btn) {
            btn.addEventListener('click', function (event) {
                event.preventDefault();
                openPalette();
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }
})();
