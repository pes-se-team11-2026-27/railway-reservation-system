'use strict';
// Handheld ticket check (RRS-F-018). Download the chart while online; check
// tickets with no network. The chart lives in IndexedDB on the device.
(function () {
  var DB = 'rrs-tte';
  var $ = function (id) { return document.getElementById(id); };
  var chart = null;
  var scanner = null;

  function openDb() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore('charts'); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function store(mode, fn) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('charts', mode);
        var r = fn(tx.objectStore('charts'));
        tx.oncomplete = function () { resolve(r && r.result); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }
  var saveChart = function (c) { return store('readwrite', function (s) { return s.put(c, 'current'); }); };
  var loadChart = function () { return store('readonly', function (s) { return s.get('current'); }); };

  function showNetwork() {
    var on = navigator.onLine;
    $('net').textContent = on ? 'Online' : 'Offline: checking from the chart on this device';
    $('net').className = 'chip ' + (on ? 'chip--cnf' : 'chip--rac');
    $('download').disabled = !on;
  }

  function showChart() {
    if (!chart) { $('chart-state').textContent = 'No chart on this device yet.'; return; }
    var people = chart.bookings.reduce(function (n, b) { return n + b.passengers.length; }, 0);
    $('chart-state').textContent = 'Chart on this device: ' + chart.train.number + ' ' + chart.train.name + ', ' + chart.runDate +
      (chart.chartPrepared ? ', final chart' : ', not final yet') + '. ' + chart.bookings.length + ' bookings, ' + people + ' passengers.';
  }

  function showResult(r) {
    var box = $('result');
    box.hidden = false;
    box.className = 'panel result ' + (r.valid ? 'result--ok' : 'result--bad');
    var html = '<h2>' + (r.valid ? 'Valid' : 'Not valid') + '</h2><p>' + escapeHtml(r.message) + '</p>';
    if (r.valid) {
      html += '<ul class="result__list">' + r.passengers.map(function (p) {
        var where = p.status === 'CNF' ? p.berth : p.status + ' ' + p.position;
        return '<li><strong>' + escapeHtml(p.name) + '</strong>, ' + p.age + ': ' + escapeHtml(where) + '</li>';
      }).join('') + '</ul>';
    }
    box.innerHTML = html;
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function check(text) { showResult(window.RRSVerify.verifyTicket(chart, text)); }

  // Offline, the list of trains cannot be fetched; show the train whose chart is here.
  function showStoredRun() {
    if (!chart || $('run').options.length) return;
    $('run').innerHTML = '<option value="' + chart.runId + '">' + chart.train.number + ' ' + escapeHtml(chart.train.name) + ', ' + chart.runDate + ' (on this device)</option>';
  }

  function loadRuns() {
    if (!navigator.onLine) return;
    fetch('/api/tte/runs', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : []; }).then(function (runs) {
      $('run').innerHTML = runs.map(function (r) {
        return '<option value="' + r.runId + '">' + r.number + ' ' + escapeHtml(r.name) + ', ' + r.runDate + (r.chartPrepared ? ' (chart ready)' : '') + '</option>';
      }).join('');
    }).catch(function () {});
  }

  $('download').addEventListener('click', function () {
    var runId = $('run').value;
    if (!runId) return;
    $('download').textContent = 'Downloading…';
    fetch('/api/chart/' + runId, { credentials: 'same-origin' })
      .then(function (r) { if (!r.ok) throw new Error('Could not download the chart'); return r.json(); })
      .then(function (c) { chart = c; return saveChart(c); })
      .then(function () { showChart(); })
      .catch(function (e) { $('chart-state').textContent = e.message; })
      .then(function () { $('download').textContent = 'Download chart'; });
  });

  $('check-form').addEventListener('submit', function (e) {
    e.preventDefault();
    check($('pnr').value);
  });

  $('scan').addEventListener('click', function () {
    if (!window.Html5Qrcode) { $('result').hidden = false; $('result').textContent = 'Camera scanning is not available; type the PNR.'; return; }
    if (scanner) { scanner.stop().catch(function () {}); scanner = null; $('scan').textContent = 'Scan QR'; return; }
    scanner = new window.Html5Qrcode('reader');
    $('scan').textContent = 'Stop camera';
    scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: 220 }, function (text) {
      check(text);
      scanner.stop().catch(function () {});
      scanner = null;
      $('scan').textContent = 'Scan QR';
    }).catch(function () { $('result').hidden = false; $('result').textContent = 'Could not open the camera; type the PNR.'; scanner = null; $('scan').textContent = 'Scan QR'; });
  });

  window.addEventListener('online', function () { showNetwork(); loadRuns(); });
  window.addEventListener('offline', showNetwork);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/tte-sw.js').catch(function () {});

  showNetwork();
  loadRuns();
  loadChart().then(function (c) { chart = c || null; showChart(); if (!navigator.onLine) showStoredRun(); }).catch(function () { showChart(); });
})();
