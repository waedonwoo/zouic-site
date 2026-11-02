/* ZouIC 选型助手前端。
 *
 * 这个脚本只负责渲染后端返回的内容：推荐的每一条都必须是后端给的站内真实条目
 * （title + url 由服务端校验过），文案一律用 textContent 写入，避免模型输出被
 * 当成 HTML 执行。后端 status 不是 ok 时，界面明确显示“离线/降级”，不假装回答。
 */
(function () {
    'use strict';

    function ready(fn) {
        if (document.readyState !== 'loading') { fn(); }
        else { document.addEventListener('DOMContentLoaded', fn); }
    }

    function labels() {
        var el = document.getElementById('aiAssistantLabels');
        try { return JSON.parse(el.textContent) || {}; }
        catch (e) { return {}; }
    }

    function threadId() {
        var key = 'zouic_ai_thread';
        var id = '';
        try { id = sessionStorage.getItem(key) || ''; } catch (e) { /* private mode */ }
        if (!/^[A-Za-z0-9_-]{6,40}$/.test(id)) {
            id = 'web' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
            try { sessionStorage.setItem(key, id); } catch (e) { /* ignore */ }
        }
        return id;
    }

    function node(tag, className, text) {
        var el = document.createElement(tag);
        if (className) { el.className = className; }
        if (text !== undefined && text !== null) { el.textContent = String(text); }
        return el;
    }

    function start() {
        var root = document.getElementById('ai-assistant');
        if (!root) { return; }

        var endpoint = root.getAttribute('data-endpoint') || '/api/ai/chat';
        var lang = root.getAttribute('data-lang') || 'zh';
        var L = labels();
        var panel = document.getElementById('aiPanel');
        var toggle = document.getElementById('aiToggle');
        var form = document.getElementById('aiForm');
        var input = document.getElementById('aiInput');
        var send = document.getElementById('aiSend');
        var log = document.getElementById('aiLog');
        var picks = document.getElementById('aiPicks');
        var checksEl = document.getElementById('aiChecks');
        var footnote = document.getElementById('aiFootnote');

        if (!panel || !toggle || !form || !log) { return; }

        var history = [];
        var busy = false;

        toggle.addEventListener('click', function () {
            var hidden = panel.classList.toggle('d-none') === false;
            toggle.setAttribute('aria-expanded', hidden ? 'true' : 'false');
            toggle.textContent = hidden
                ? (L.more || '继续追问')
                : (lang === 'en' ? 'Open assistant' : '打开助手');
            if (hidden && input) { input.focus(); }
        });

        Array.prototype.forEach.call(document.querySelectorAll('#aiChips [data-prompt]'), function (chip) {
            chip.addEventListener('click', function () {
                input.value = chip.getAttribute('data-prompt');
                submit();
            });
        });

        form.addEventListener('submit', function (event) {
            event.preventDefault();
            submit();
        });

        function say(who, text, extraClass) {
            if (!text) { return null; }
            var bubble = node('div', 'ai-bubble ' + (extraClass || (
                who === 'user' ? 'ai-bubble-user' : 'ai-bubble-bot'
            )));
            bubble.appendChild(node('span', 'text-secondary text-xs d-block mb-1',
                who === 'user' ? (lang === 'en' ? 'You' : '你')
                    : (lang === 'en' ? 'ZouIC assistant' : 'ZouIC 助手')));
            bubble.appendChild(node('span', '', text));
            log.appendChild(bubble);
            return bubble;
        }

        function badge(text, kind) {
            var b = node('span', 'badge-zouic badge-zouic-' + (kind || 'secondary'), text);
            return b;
        }

        function renderPicks(refs, statusText) {
            picks.textContent = '';
            if (!refs || !refs.length) { return; }
            var head = node('h3', 'h6 font-bold mb-2 text-secondary', L.picks || '站内匹配条目');
            head.appendChild(document.createTextNode(' '));
            if (statusText) { head.appendChild(badge(statusText)); }
            picks.appendChild(head);
            refs.forEach(function (ref) {
                if (!ref || !ref.url || !ref.title) { return; }
                var col = node('div', 'col-md-6');
                var link = node('a', 'card-dark p-4 h-100 d-block text-decoration-none hover-underline');
                link.href = ref.url;
                link.rel = 'noopener';
                link.appendChild(node('h4', 'font-bold mb-1', ref.title));
                var bits = [];
                if (ref.vendor) { bits.push(ref.vendor); }
                if (ref.arch) { bits.push(ref.arch); }
                if (ref.price) { bits.push(ref.price); }
                if (bits.length) { link.appendChild(node('p', 'text-secondary text-sm mb-1', bits.join(' · '))); }
                link.appendChild(node('span', 'text-primary text-sm',
                    (L.source || '查看条目') + ' ›'));
                col.appendChild(link);
                picks.appendChild(col);
            });
        }

        // 三态可见校验：后端只给「字段名 + 有没有值 + 数量 + 导出时间」这些事实，
        // 句子全部由站内 i18n 文案拼，德语页才不会漏出中文；
        // 措辞只说「站内这个字段有值」，不说「参数已验证」——那是两回事。
        var STATES = {
            ok: { mark: '✓', kind: 'success' },
            partial: { mark: '~', kind: 'warning' },
            absent: { mark: '✗', kind: 'secondary' },
            other: { mark: '·', kind: 'secondary' }
        };

        function text(key, fallback) {
            return L[key] || fallback;
        }

        // 带数字的句子写成模板 + 占位符，德语页才能整句用德语文案；
        // 缺占位符的文案原样输出，不静默吞掉数字。
        function fill(tpl, vars) {
            return String(tpl).replace(/\{(\w+)\}/g, function (m, k) {
                return (vars && vars[k] !== undefined && vars[k] !== null)
                    ? String(vars[k]) : m;
            });
        }

        function checkRow(field, state, note) {
            var s = STATES[state] || STATES.other;
            var row = node('li', 'ai-check-row');
            var mark = node('span', 'ai-check-mark ai-check-' + (state || 'other'), s.mark);
            mark.setAttribute('aria-hidden', 'true');
            row.appendChild(mark);
            row.appendChild(node('span', 'ai-check-label',
                text('f_' + field, field)));
            row.appendChild(badge(note || text('state_' + state, state), s.kind));
            return row;
        }

        // 后端给的 source 是文件名（catalogue.json / fallback），访客看不懂它值多少；
        // 翻成「查的是全站导出目录」这种口径，兜底清单还要如实说明只覆盖少数条目。
        function sourceLabel(src, en) {
            if (src === 'catalogue.json') {
                return text('src_catalogue', en ? 'the full site export' : '全站导出目录');
            }
            if (src === 'fallback') {
                return text('src_fallback',
                    en ? 'the built-in short list (a few entries only)' : '内置兜底清单（只覆盖少数条目）');
            }
            // 后端没给 source 时也不能留一对空括号
            return src || text('src_default', en ? 'the on-site catalogue' : '站内目录');
        }

        function renderChecks(checks) {
            if (!checksEl) { return; }
            checksEl.textContent = '';
            checksEl.hidden = true;
            var fields = (checks && checks.fields) || [];
            if (!fields.length) { return; }
            checksEl.hidden = false;

            var en = lang === 'en';
            checksEl.appendChild(node('p', 'h6 font-bold mb-2 text-secondary',
                text('checks', '这次比对了什么')));

            var list = node('ul', 'ai-check-list');
            fields.forEach(function (f) {
                list.appendChild(checkRow(
                    f.field, f.state,
                    f.total && f.state !== 'absent' ? (f.n + '/' + f.total) : ''));
            });
            var pages = (checks && checks.pages) || {};
            list.appendChild(checkRow('pages', pages.state,
                pages.state === 'ok'
                    ? text('pages_ok', '站内条目页逐条核对过')
                    : text('pages_absent', '本次未核对全站页面')));
            checksEl.appendChild(list);

            if (pages.exported_at) {
                // 句子在前端拼，语言跟页面走；后端只给时间戳和核对状态
                var when = text('pages_exported', '核对时间') + ' ' + pages.exported_at;
                checksEl.appendChild(node('p', 'text-secondary text-xs mt-2 mb-0',
                    text('pages_note', '每条链接都已在站点构建产物里核对存在') +
                    (en ? ' (' + when + ')' : '（' + when + '）')));
            } else if (pages.note) {
                checksEl.appendChild(node('p', 'text-secondary text-xs mt-2 mb-0', pages.note));
            }
            if (checks.confirm && checks.confirm.length) {
                checksEl.appendChild(node('p', 'text-secondary text-xs mt-2 mb-1 font-bold',
                    text('check_confirm', '还需要你复核')));
                var ul2 = node('ul', 'ai-check-list ai-check-confirm');
                checks.confirm.forEach(function (c, i) {
                    ul2.appendChild(node('li', '', text('confirm_' + i, c)));
                });
                checksEl.appendChild(ul2);
            }
            if (checks.not_for) {
                // 中英的 not_for 文案都写成了「标签 + 正文」能直接连成一句话的形式，
                // 中文不加空格、英文加一个；加冒号反而会把句子读断。
                checksEl.appendChild(node('p', 'text-secondary text-xs mt-2',
                    text('check_notfor', '这个回答不能用来') + (en ? ' ' : '') +
                    text('notfor_body', checks.not_for)));
            }

            var g = (checks && checks.grounding) || {};
            if (g.entries) {
                var basis = sourceLabel(g.source, en);
                checksEl.appendChild(node('p', 'text-secondary text-xs mt-2 mb-0',
                    text('check_basis', '依据') + (en ? ': ' : '：') +
                    fill(text('basis_body', en
                        ? '{entries} on-site entries ({source}), {matched} matched for this query.'
                        : '站内 {entries} 条收录（{source}），本次比对到 {matched} 条。'), {
                        entries: g.entries, source: basis, matched: g.matched || 0
                    })));
            }
        }

        function setFootnote(data) {
            if (!footnote) { return; }
            var model = data && data.model;
            if (!model) {
                footnote.textContent = L.offline || footnote.textContent;
                return;
            }
            var en = lang === 'en';
            // 三句脚注都优先取站内文案（德语页才有德语），JS 里这两套只当兜底
            if (data.status === 'empty') {
                // 一条都没匹配上时，别继续挂着上一轮「上面列的是真实条目」那句话
                footnote.textContent = L.footnote_empty || (en
                    ? 'Nothing on site matched that request, so no listing was returned — ' +
                      'the entry count above is the real on-site total.'
                    : '站内没有匹配到条目，所以没有列出结果——上面的收录数是站内真实总数。');
                return;
            }
            if (data.status === 'ok' && data.degraded && model === 'local-keyword') {
                // 关键词版不是「模型坏了所以没答案」：条目是真的，只是这次没有 AI 组织语言
                footnote.textContent = L.footnote_keyword || (en
                    ? 'Answered straight from the on-site keyword match (no AI pass this time) — ' +
                      'the listings above are real entries; check vendor pages for specs and price.'
                    : '这次由站内搜索直接给出（本轮没有走模型）——上面列的都是站内真实条目，' +
                      '参数与价格请以厂商页面为准。');
                return;
            }
            if (data.status === 'ok') {
                footnote.textContent = (L.model || '模型') + ': ' + model + ' · ' +
                    (L.footnote_model || (en
                        ? 'Generated from on-site listings; check vendor pages for specs and price.'
                        : '回答基于站内条目生成，参数与价格请以厂商页面为准。'));
            }
        }

        function submit() {
            var text = (input.value || '').trim();
            if (!text || busy) { return; }
            busy = true;
            send.disabled = true;
            input.value = '';
            say('user', text, 'bg-primary-subtle');
            history.push({ role: 'user', content: text });
            var thinking = say('assistant', L.thinking || '…', 'ai-bubble-bot text-secondary');

            fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: history.slice(-8), lang: lang, thread_id: threadId() })
            }).then(function (resp) {
                if (resp.status === 429) {
                    return { status: 'limited', reply: L.limited || 'rate limited',
                             refs: [], degraded: true };
                }
                return resp.json().catch(function () {
                    return { status: 'error', reply: L.error || 'error', refs: [], degraded: true };
                });
            }).then(function (data) {
                if (thinking && thinking.parentNode) { thinking.parentNode.removeChild(thinking); }
                var reply = (data && data.reply) || L.error || '…';
                var bubble = say('assistant', reply);
                var status = data && data.status;
                if (status && status !== 'ok' && bubble) {
                    var label = status === 'offline'
                        ? (lang === 'en' ? 'offline' : '离线')
                        : (status === 'limited' ? (lang === 'en' ? 'rate limited' : '已达上限')
                            : (status === 'empty' ? (lang === 'en' ? 'no match' : '无匹配')
                                : (lang === 'en' ? 'degraded' : '降级')));
                    bubble.insertBefore(badge(label, status === 'ok' ? 'success' : 'warning'),
                                         bubble.firstChild.nextSibling);
                }
                var localMatch = data && (data.degraded || data.model === 'local-keyword');
                renderPicks(data && data.refs, (!localMatch && status === 'ok')
                    ? (lang === 'en' ? 'AI picked' : 'AI 推荐')
                    : (lang === 'en' ? 'matched by keywords' : '关键词匹配'));
                renderChecks(data && data.checks);
                if (data && data.missing) {
                    var follow = say('assistant', data.missing, 'ai-bubble-bot ai-bubble-followup');
                    if (follow) { follow.appendChild(badge(lang === 'en' ? 'follow-up' : '需要你补充')); }
                }
                setFootnote(data);
                history.push({ role: 'assistant', content: reply });
                if (history.length > 8) { history = history.slice(-8); }
            }).catch(function () {
                if (thinking && thinking.parentNode) { thinking.parentNode.removeChild(thinking); }
                say('assistant', L.error || 'network error', 'ai-bubble-bot text-secondary');
            }).then(function () {
                busy = false;
                send.disabled = false;
                if (input) { input.focus(); }
            });
        }
    }

    ready(start);
})();
