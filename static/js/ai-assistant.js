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

        function setFootnote(data) {
            if (!footnote) { return; }
            var model = data && data.model;
            if (data && data.status === 'ok' && model) {
                footnote.textContent = (L.model || '模型') + ': ' + model + ' · ' +
                    (lang === 'en'
                        ? 'Generated from on-site listings; check vendor pages for specs and price.'
                        : '回答基于站内条目生成，参数与价格请以厂商页面为准。');
            } else if (!model) {
                footnote.textContent = L.offline || footnote.textContent;
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
                            : (lang === 'en' ? 'degraded' : '降级'));
                    bubble.insertBefore(badge(label, status === 'ok' ? 'success' : 'warning'),
                                         bubble.firstChild.nextSibling);
                }
                renderPicks(data && data.refs, status === 'ok'
                    ? (lang === 'en' ? 'AI picked' : 'AI 推荐')
                    : (lang === 'en' ? 'on-site picks' : '站内条目'));
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
