'use strict';
// Small progressive enhancements. Every page works without this file.

(function () {
  // Move focus to the error summary so keyboard and screen reader users land on it.
  var summary = document.getElementById('error-summary');
  if (summary) summary.focus();

  // Busy state on submit: blocks double submits (a second hold) and says what is happening.
  document.querySelectorAll('form').forEach(function (form) {
    form.addEventListener('submit', function () {
      var button = form.querySelector('button[type="submit"][data-busy-text]');
      if (!button || button.getAttribute('aria-busy') === 'true') return;
      setTimeout(function () {
        button.dataset.idleText = button.textContent;
        button.setAttribute('aria-busy', 'true');
        button.disabled = true;
        button.textContent = button.getAttribute('data-busy-text');
      }, 0);
    });
  });

  // Coming back with the Back button can restore a busy button; reset it.
  window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    document.querySelectorAll('button[aria-busy="true"]').forEach(function (b) {
      b.disabled = false;
      b.removeAttribute('aria-busy');
      if (b.dataset.idleText) b.textContent = b.dataset.idleText;
    });
  });

  // Hold countdown: text and a bar, announced once when it lapses, not every second.
  var timer = document.querySelector('[data-hold-expires]');
  if (timer) {
    var expires = new Date(timer.getAttribute('data-hold-expires')).getTime();
    var total = Number(timer.getAttribute('data-hold-minutes') || 10) * 60000;
    var bar = timer.querySelector('.hold-timer__bar');
    var left = timer.querySelector('.hold-timer__left');
    var live = timer.querySelector('[data-hold-live]');
    var tick = function () {
      var ms = Math.max(0, expires - Date.now());
      var m = Math.floor(ms / 60000);
      var s = Math.floor((ms % 60000) / 1000);
      left.textContent = ms > 0 ? m + ':' + String(s).padStart(2, '0') + ' left' : 'Hold lapsed';
      bar.style.transform = 'scaleX(' + Math.min(1, ms / total).toFixed(4) + ')';
      if (ms === 0) {
        timer.setAttribute('data-lapsed', 'true');
        live.textContent = 'The hold has lapsed and the berths are free again. Search to book again.';
        clearInterval(handle);
      }
    };
    var handle = setInterval(tick, 1000);
    tick();
  }
})();
