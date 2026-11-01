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

  // Swap From and To on the search form.
  var from = document.getElementById('from');
  var to = document.getElementById('to');
  var slot = document.querySelector('[data-swap-slot]');
  if (from && to && slot) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'swap';
    button.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">' +
      '<path d="M4 2v11M4 13l-2.5-2.5M4 13l2.5-2.5M12 14V3M12 3l-2.5 2.5M12 3l2.5 2.5" stroke="currentColor" ' +
      'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      '<span>Swap</span><span class="vh"> From and To stations</span>';
    var status = document.createElement('span');
    status.className = 'vh';
    status.setAttribute('role', 'status');
    button.addEventListener('click', function () {
      var a = from.value;
      from.value = to.value;
      to.value = a;
      button.setAttribute('data-turned', button.getAttribute('data-turned') === 'true' ? 'false' : 'true');
      status.textContent = 'From ' + from.options[from.selectedIndex].text + ', to ' + to.options[to.selectedIndex].text;
    });
    slot.appendChild(button);
    slot.appendChild(status);
  }

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
