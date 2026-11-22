(function () {
  'use strict';

  // --- 移动端菜单 -------------------------------------------------
  var toggle = document.querySelector('.menu-toggle');
  var nav = document.querySelector('.nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () { nav.classList.toggle('open'); });
  }

  // --- 榜单筛选与排序 --------------------------------------------
  var chips = Array.prototype.slice.call(document.querySelectorAll('.chip[data-cat]'));
  var rows = Array.prototype.slice.call(document.querySelectorAll('.row[data-cat]'));
  var sortSel = document.querySelector('#sort-select');
  var emptyMsg = document.querySelector('#board-empty');

  function applyFilters() {
    var cat = document.querySelector('.chip.on') ? document.querySelector('.chip.on').getAttribute('data-cat') : 'all';
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
    var table = document.querySelector('.table');
    if (table) {
      visible.forEach(function (row) { table.appendChild(row); });
    }
    if (emptyMsg) emptyMsg.classList.toggle('hidden', visible.length !== 0);

    // 重排名次角标
    var rankNum = 1;
    visible.concat(rows.filter(function (r) { return r.classList.contains('hidden'); }))
      .forEach(function (row) {
        var badge = row.querySelector('.rank-badge .rk');
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

  // --- 出价模拟 ---------------------------------------------------
  var bidForm = document.querySelector('#bid-form');
  if (bidForm) {
    var baseBid = parseInt(bidForm.getAttribute('data-base'), 10);
    var minBid = parseInt(bidForm.getAttribute('data-min'), 10);
    var quickBtns = Array.prototype.slice.call(document.querySelectorAll('.quick [data-step]'));
    var input = document.querySelector('#bid-amount');
    var err = document.querySelector('#bid-error');
    var success = document.querySelector('#bid-success');

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
    input.addEventListener('input', syncQuickHighlight);

    bidForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var val = parseInt(input.value, 10);
      err.textContent = '';
      success.classList.add('hidden');
      if (isNaN(val) || val < minBid) {
        err.textContent = bidForm.getAttribute('data-invalid');
        return;
      }
      try {
        var key = 'geekboard_bid_' + bidForm.getAttribute('data-slug');
        var prev = parseInt(localStorage.getItem(key) || '0', 10);
        if (val > prev) localStorage.setItem(key, String(val));
      } catch (ex) { /* 隐私模式下 localStorage 不可用，忽略 */ }
      success.classList.remove('hidden');
    });
  }
})();
