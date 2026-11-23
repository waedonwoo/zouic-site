/* ZouIC 极客榜 — 交互脚本。作用域限定在 .rb-page，不碰主站其它组件。
 *
 * 两种模式：
 *   demo（默认）：出价只存本地浏览器，纯演示，不扣款。
 *   live：出价 → 后端下单 → 支付宝支付 → 回调生效；榜单拉取真实生效快照。
 * 模式由服务端渲染时写入表单 data-mode，前端不自行切换（防止绕过合规开关）。
 */
(function () {
  'use strict';

  var page = document.querySelector('.rb-page');
  if (!page) return;

  // --- 榜单筛选与排序 --------------------------------------------
  var chips = Array.prototype.slice.call(page.querySelectorAll('.rb-chip[data-cat]'));
  var rows = Array.prototype.slice.call(page.querySelectorAll('.rb-row[data-cat]'));
  var sortSel = page.querySelector('#rb-sort');
  var emptyMsg = page.querySelector('#rb-empty');
  var table = page.querySelector('.rb-table');

  function applyFilters() {
    var active = page.querySelector('.rb-chip.on');
    var cat = active ? active.getAttribute('data-cat') : 'all';
    var sort = sortSel ? sortSel.value : 'price';
    var visible = [];
    rows.forEach(function (row) {
      var match = cat === 'all' || row.getAttribute('data-cat') === cat;
      row.classList.toggle('hidden', !match);
      if (match) visible.push(row);
    });

    if (sort === 'price' || sort === 'clicks') {
      var key = sort === 'price' ? 'bid' : 'clicks';
      visible.sort(function (a, b) {
        return parseInt(b.getAttribute('data-' + key), 10) - parseInt(a.getAttribute('data-' + key), 10);
      });
    } else if (sort === 'new') {
      visible.sort(function (a, b) {
        return parseInt(b.getAttribute('data-claims'), 10) - parseInt(a.getAttribute('data-claims'), 10);
      });
    }
    if (table) visible.forEach(function (row) { table.appendChild(row); });
    if (emptyMsg) emptyMsg.classList.toggle('hidden', visible.length !== 0);

    var rankNum = 1;
    visible.concat(rows.filter(function (r) { return r.classList.contains('hidden'); }))
      .forEach(function (row) {
        var badge = row.querySelector('.rb-rank .rk');
        if (!badge) return;
        if (row.classList.contains('hidden')) { badge.textContent = '—'; return; }
        badge.textContent = String(rankNum).padStart(2, '0');
        rankNum += 1;
      });
  }

  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      chips.forEach(function (c) { c.classList.remove('on'); });
      chip.classList.add('on');
      applyFilters();
    });
  });
  if (sortSel) sortSel.addEventListener('change', applyFilters);
  applyFilters();

  // --- live 模式：拉取真实生效榜单覆盖演示价格 -------------------
  function fetchLiveBoard(apiBase) {
    if (!apiBase || !rows.length) return;
    fetch(apiBase + '/pay/api/rank/board', { headers: { 'Accept': 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !data.success || !data.board) return;
        rows.forEach(function (row) {
          var slug = row.getAttribute('data-slug');
          var live = data.board[slug];
          if (!live) return;
          var span = row.querySelector('[data-live-bid]');
          if (span) span.textContent = '¥' + Number(live.amount).toLocaleString('en-US');
          row.setAttribute('data-bid', live.amount);
          var prodMeta = row.querySelector('.rb-prod-meta');
          if (prodMeta && live.bidder) {
            var tag = document.createElement('span');
            tag.className = 'rb-tag paid';
            tag.textContent = '@' + live.bidder;
            prodMeta.appendChild(tag);
          }
        });
        applyFilters();
      })
      .catch(function () { /* 榜单接口不可用时保留演示价格，不报错打扰访客 */ });
  }

  // --- 出价 -------------------------------------------------------
  var bidForm = page.querySelector('#rb-bid-form');
  if (!bidForm) return;

  var mode = bidForm.getAttribute('data-mode') || 'demo';
  var apiBase = bidForm.getAttribute('data-api') || '';
  var baseBid = parseInt(bidForm.getAttribute('data-base'), 10);
  var minBid = parseInt(bidForm.getAttribute('data-min'), 10);
  var quickBtns = Array.prototype.slice.call(bidForm.querySelectorAll('.rb-quick [data-step]'));
  var input = bidForm.querySelector('#rb-bid-amount');
  var nameInput = bidForm.querySelector('#rb-bid-name');
  var contactInput = bidForm.querySelector('#rb-bid-contact');
  var err = bidForm.querySelector('#rb-bid-error');
  var success = bidForm.querySelector('#rb-bid-success');
  var submitBtn = bidForm.querySelector('button[type="submit"]');

  if (mode === 'live') fetchLiveBoard(apiBase);

  function syncQuickHighlight() {
    quickBtns.forEach(function (b) { b.classList.remove('on'); });
    var val = parseInt(input.value, 10);
    quickBtns.forEach(function (b) {
      if (baseBid + parseInt(b.getAttribute('data-step'), 10) === val) b.classList.add('on');
    });
  }
  quickBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      input.value = String(baseBid + parseInt(b.getAttribute('data-step'), 10));
      syncQuickHighlight();
    });
  });
  if (input) input.addEventListener('input', syncQuickHighlight);

  function showErr(msg) {
    err.textContent = msg;
    success.classList.add('hidden');
  }

  bidForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var val = parseInt(input.value, 10);
    err.textContent = '';
    success.classList.add('hidden');
    if (isNaN(val) || val < minBid) {
      showErr(bidForm.getAttribute('data-invalid') || '');
      return;
    }

    // --- demo：本地记录，纯演示 ---
    if (mode !== 'live') {
      try {
        var key = 'zouic_rank_bid_' + bidForm.getAttribute('data-slug');
        var prev = parseInt(localStorage.getItem(key) || '0', 10);
        if (val > prev) localStorage.setItem(key, String(val));
      } catch (ex) { /* 隐私模式下 localStorage 不可用，忽略 */ }
      success.classList.remove('hidden');
      return;
    }

    // --- live：服务端下单 → 支付宝 ---
    var contact = (contactInput ? contactInput.value.trim() : '');
    if (!contact || contact.length < 5) {
      showErr(bidForm.getAttribute('data-contact-label') || 'Contact required');
      if (contactInput) contactInput.focus();
      return;
    }
    submitBtn.disabled = true;
    err.textContent = bidForm.getAttribute('data-paying') || 'Creating order…';
    fetch(apiBase + '/pay/api/rank/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: bidForm.getAttribute('data-slug'),
        amount: val,
        bidder: (nameInput ? nameInput.value.trim() : '') || '',
        contact: contact
      })
    }).then(function (r) {
      return r.json().catch(function () {
        return { success: false, error: 'HTTP ' + r.status };
      });
    }).then(function (data) {
      if (!data.success) {
        showErr(data.error || 'Order failed');
        submitBtn.disabled = false;
        return;
      }
      // payment_html 是支付宝自动提交表单，必须渲染进 DOM 再 submit，不能用 URL 跳转
      var holder = document.createElement('div');
      holder.innerHTML = data.payment_html;
      holder.style.position = 'fixed';
      holder.style.inset = '0';
      holder.style.zIndex = '1090';
      holder.style.background = '#fff';
      document.body.appendChild(holder);
      var form = holder.querySelector('form');
      if (form) { form.submit(); }
      else {
        showErr('Payment form error');
        submitBtn.disabled = false;
      }
    }).catch(function (e) {
      showErr((bidForm.getAttribute('data-network-err') || 'Network error: ') + e);
      submitBtn.disabled = false;
    });
  });
})();
