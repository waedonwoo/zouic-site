/* 语义检索补全：只在后端确认向量索引可用时才出现（模板已按 cached_records>0 判定）。
 * 命中结果全部来自服务端的站内条目，前端不补文案、不改链接。 */
(function () {
    'use strict';

    function ready(fn) {
        if (document.readyState !== 'loading') { fn(); }
        else { document.addEventListener('DOMContentLoaded', fn); }
    }

    function esc(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
        });
    }

    ready(function () {
        var root = document.getElementById('ai-search');
        var btn = document.getElementById('aiSearchBtn');
        var out = document.getElementById('aiSearchOut');
        if (!root || !btn || !out) { return; }

        var endpoint = root.getAttribute('data-endpoint') || '/api/ai/search';
        var labels = {};
        try { labels = JSON.parse(document.getElementById('aiSearchLabels').textContent) || {}; }
        catch (e) { labels = {}; }
        var lang = (document.documentElement.getAttribute('lang') || 'zh').indexOf('en') === 0 ? 'en' : 'zh';
        var loaded = null;

        function currentQuery() {
            var input = document.getElementById('pageSearchQuery');
            var params = new URLSearchParams(window.location.search);
            return (input && input.value.trim()) || params.get('q') || '';
        }

        function card(item) {
            var bits = [];
            if (item.vendor) { bits.push(item.vendor); }
            if (typeof item.score === 'number') { bits.push(Math.round(item.score * 100) + '%'); }
            return '<div class="col-md-6"><a href="' + esc(item.url) + '" class="card-dark p-4 h-100 d-block text-decoration-none hover-underline">' +
                '<h4 class="font-bold mb-1">' + esc(item.title) + '</h4>' +
                '<p class="text-secondary text-sm mb-1">' + esc(bits.join(' · ')) + '</p>' +
                '<p class="text-secondary text-sm mb-0">' + esc(item.desc) + '</p></a></div>';
        }

        btn.addEventListener('click', function () {
            var query = currentQuery();
            if (!query) {
                out.innerHTML = '<p class="text-secondary text-sm mb-0">' + esc(labels.empty) + '</p>';
                return;
            }
            btn.disabled = true;
            out.innerHTML = '<p class="text-secondary text-sm mb-0">' + esc(labels.loading) + '</p>';

            fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: query, lang: lang, limit: 12 })
            }).then(function (resp) { return resp.json(); }).then(function (data) {
                var items = (data && data.items) || [];
                loaded = items;
                if (!items.length) {
                    out.innerHTML = '<p class="text-secondary text-sm mb-0">' + esc(labels.empty) + '</p>';
                    return;
                }
                out.innerHTML = '<div class="card-dark p-4">' +
                    '<h3 class="h6 font-bold mb-1">' + esc(labels.heading) +
                    ' <span class="badge-zouic badge-zouic-accent">' + items.length + '</span></h3>' +
                    '<p class="text-secondary text-xs mb-3">' + esc(labels.note) + '</p>' +
                    '<div class="row g-3">' + items.map(card).join('') + '</div></div>';
            }).catch(function () {
                out.innerHTML = '<p class="text-secondary text-sm mb-0">' + esc(labels.error) + '</p>';
            }).then(function () {
                btn.disabled = false;
            });
        });
    });
})();
