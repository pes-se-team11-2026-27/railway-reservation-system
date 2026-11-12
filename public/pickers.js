'use strict';
// Station and train pickers, the journey date picker, Swap, and recent searches.
// Each one enhances a native control that stays in the form, so every page
// still works and submits the same values without JavaScript.
// Patterns follow the WAI-ARIA Authoring Practices: combobox with listbox,
// and a date picker dialog with a grid.

(function () {
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var EASE = 'cubic-bezier(0.23, 1, 0.32, 1)';
  var uid = 0;

  function el(tag, attrs, html) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    if (html != null) node.innerHTML = html;
    return node;
  }
  function esc(text) {
    return String(text).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  // Wraps the matched part of the text in <mark>, case-insensitively.
  function highlight(text, query) {
    if (!query) return esc(text);
    var i = text.toLowerCase().indexOf(query.toLowerCase());
    if (i < 0) return esc(text);
    return esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + query.length)) + '</mark>' + esc(text.slice(i + query.length));
  }

  var CHEVRON = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">' +
    '<path d="m4 6 4 4 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var CHECK = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">' +
    '<path d="m3.5 8.5 3 3 6-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var CALENDAR = '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true" focusable="false">' +
    '<rect x="2.5" y="3.5" width="13" height="12" rx="2" stroke="currentColor" stroke-width="1.5"/>' +
    '<path d="M2.5 7.5h13M6 2v3M12 2v3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

  // ---------------------------------------------------------------- combobox

  var pickers = {};

  function Combobox(select) {
    var self = this;
    var id = select.id;
    var field = select.closest('.field');
    var label = field.querySelector('label[for="' + id + '"]');
    this.select = select;
    this.id = id;
    this.items = Array.prototype.map.call(select.options, function (o) {
      var m = /^(.*) \(([^)]+)\)$/.exec(o.text);
      return { value: o.value, name: m ? m[1] : o.text, code: m ? m[2] : o.value };
    });
    this.open = false;
    this.active = -1;
    this.shown = [];
    this.query = '';

    var wrap = el('div', { class: 'cbx' });
    var input = el('input', {
      id: id + '-input', type: 'text', class: 'cbx__input', role: 'combobox',
      'aria-autocomplete': 'list', 'aria-expanded': 'false', 'aria-controls': id + '-list',
      autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off',
    });
    var chip = el('span', { class: 'cbx__chip', 'aria-hidden': 'true', translate: 'no' });
    var chevron = el('span', { class: 'cbx__chevron', 'aria-hidden': 'true' }, CHEVRON);
    var pop = el('div', { class: 'pop cbx__pop' });
    var list = el('ul', { id: id + '-list', role: 'listbox', class: 'cbx__list' });
    if (label) {
      if (!label.id) label.id = id + '-label';
      list.setAttribute('aria-labelledby', label.id);
      label.htmlFor = input.id;
    }
    var empty = el('p', { class: 'cbx__empty', role: 'status' });
    pop.appendChild(list);
    pop.appendChild(empty);
    wrap.appendChild(input);
    wrap.appendChild(chip);
    wrap.appendChild(chevron);
    wrap.appendChild(pop);
    select.hidden = true;            // still submits with the form
    select.parentNode.insertBefore(wrap, select);
    this.input = input; this.chip = chip; this.list = list; this.pop = pop; this.empty = empty; this.wrap = wrap;
    this.sync();

    // A press on a focused field toggles the list; the first press only opens it.
    var toggled = false;
    input.addEventListener('mousedown', function (e) {
      toggled = document.activeElement === input;
      if (toggled) {
        e.preventDefault();   // keep the selection instead of placing a caret
        self.toggle();
      }
    });
    input.addEventListener('click', function () {
      if (toggled) { toggled = false; return; }
      if (!self.open) self.show('');
    });
    input.addEventListener('input', function () { self.show(input.value.trim()); });
    input.addEventListener('keydown', function (e) { self.onKey(e); });
    input.addEventListener('blur', function () {
      setTimeout(function () { if (!wrap.contains(document.activeElement)) self.hide(); }, 0);
    });
    list.addEventListener('mousedown', function (e) { e.preventDefault(); });
    list.addEventListener('click', function (e) {
      var li = e.target.closest('[role="option"]');
      if (li) self.choose(li.getAttribute('data-value'));
    });
    pickers[id] = this;
  }

  Combobox.prototype.item = function (value) {
    for (var i = 0; i < this.items.length; i++) if (this.items[i].value === value) return this.items[i];
    return null;
  };
  Combobox.prototype.partner = function () {
    var pair = this.wrap.closest('.route-pair');
    if (!pair) return null;
    var other = this.id === 'from' ? 'to' : (this.id === 'to' ? 'from' : null);
    return other ? pickers[other] : null;
  };
  // Shows the selected item in the field.
  Combobox.prototype.sync = function () {
    var it = this.item(this.select.value);
    this.input.value = it ? it.name : '';
    this.chip.textContent = it ? it.code : '';
  };
  Combobox.prototype.setValue = function (value) {
    this.select.value = value;
    this.select.dispatchEvent(new Event('change', { bubbles: true }));
    this.sync();
  };

  Combobox.prototype.render = function () {
    var self = this;
    this.wrap.classList.toggle('is-filtering', !!this.query);
    var q = this.query.toLowerCase();
    var partner = this.partner();
    var rank = function (it) {
      var code = it.code.toLowerCase();
      var name = it.name.toLowerCase();
      if (!q) return 0;
      if (code === q) return 1;
      if (code.indexOf(q) === 0) return 2;
      if (name.indexOf(q) === 0) return 3;
      if (name.split(/\s+/).some(function (w) { return w.indexOf(q) === 0; })) return 4;
      if (name.indexOf(q) >= 0) return 5;
      return 0;
    };
    this.shown = this.items
      .map(function (it, i) { return { it: it, r: rank(it), i: i }; })
      .filter(function (x) { return !q || x.r > 0; })
      .sort(function (a, b) { return (a.r - b.r) || (a.i - b.i); })
      .map(function (x) { return x.it; });

    this.list.innerHTML = '';
    this.shown.forEach(function (it, i) {
      var selected = it.value === self.select.value;
      var note = partner && partner.select.value === it.value
        ? '<span class="cbx__note">Your ' + (self.id === 'from' ? 'To' : 'From') + ' station, picking it swaps them</span>' : '';
      var li = el('li', {
        id: self.id + '-opt-' + i, role: 'option', 'data-value': it.value,
        'aria-selected': selected ? 'true' : 'false', class: 'cbx__opt',
      }, '<span class="cbx__text"><span class="cbx__name">' + highlight(it.name, self.query) + '</span>' + note + '</span>' +
        '<span class="cbx__code" translate="no">' + highlight(it.code, self.query) + '</span>' +
        '<span class="cbx__tick">' + (selected ? CHECK : '') + '</span>');
      self.list.appendChild(li);
    });
    this.empty.textContent = this.shown.length ? '' : 'No station matches "' + this.query + '". Try a code like SBC or a name like Chennai.';
    this.empty.hidden = this.shown.length > 0;
  };

  Combobox.prototype.setActive = function (i) {
    var opts = this.list.querySelectorAll('[role="option"]');
    if (!opts.length) { this.active = -1; this.input.removeAttribute('aria-activedescendant'); return; }
    this.active = (i + opts.length) % opts.length;
    opts.forEach(function (o) { o.classList.remove('is-active'); });
    var cur = opts[this.active];
    cur.classList.add('is-active');
    this.input.setAttribute('aria-activedescendant', cur.id);
    cur.scrollIntoView({ block: 'nearest' });
  };

  Combobox.prototype.show = function (query) {
    this.query = query;
    // Opening without typing selects the text, so the next keystroke starts a fresh search.
    if (!query) this.input.select();
    this.render();
    if (!this.open) {
      this.open = true;
      this.input.setAttribute('aria-expanded', 'true');
      this.pop.setAttribute('data-open', 'true');
    }
    var sel = -1;
    var self = this;
    if (!query) this.shown.forEach(function (it, i) { if (it.value === self.select.value) sel = i; });
    this.setActive(sel >= 0 ? sel : 0);
  };
  Combobox.prototype.hide = function () {
    if (!this.open) { this.sync(); return; }
    this.open = false;
    this.query = '';
    this.input.setAttribute('aria-expanded', 'false');
    this.input.removeAttribute('aria-activedescendant');
    this.pop.removeAttribute('data-open');
    this.wrap.classList.remove('is-filtering');
    this.sync();
  };
  Combobox.prototype.toggle = function () { if (this.open) this.hide(); else this.show(''); };

  // Picking the station already chosen in the other field swaps the two.
  Combobox.prototype.choose = function (value) {
    var partner = this.partner();
    var previous = this.select.value;
    if (partner && partner.select.value === value && previous !== value) {
      partner.setValue(previous);
      nudge(partner.input, this.id === 'from' ? -1 : 1);
      announce('Swapped. From ' + label(pickers.from) + ', to ' + label(pickers.to) + '.');
    }
    this.setValue(value);
    this.hide();
    if (partner && partner.select.value !== previous) announce(this.input.value + ' selected.');
  };

  Combobox.prototype.onKey = function (e) {
    var k = e.key;
    if (k === 'ArrowDown' || k === 'ArrowUp') {
      e.preventDefault();
      if (!this.open) { this.show(''); return; }
      if (e.altKey && k === 'ArrowUp') { this.hide(); return; }
      this.setActive(this.active + (k === 'ArrowDown' ? 1 : -1));
    } else if (k === 'Enter') {
      if (this.open) {
        e.preventDefault();
        var it = this.shown[this.active];
        if (it) this.choose(it.value); else this.hide();
      }
    } else if (k === 'Escape') {
      if (this.open) { e.preventDefault(); this.hide(); this.input.select(); }
    } else if (k === 'Tab') {
      if (this.open && this.query && this.shown[this.active]) this.choose(this.shown[this.active].value);
      else this.hide();
    } else if ((k === 'PageDown' || k === 'PageUp') && this.open) {
      e.preventDefault();
      this.setActive(k === 'PageDown' ? this.shown.length - 1 : 0);
    }
  };

  function label(p) { return p ? p.input.value + ' (' + p.chip.textContent + ')' : ''; }

  // ---------------------------------------------------------------- announcements

  var live = el('div', { class: 'vh', role: 'status', 'aria-live': 'polite' });
  document.body.appendChild(live);
  function announce(text) {
    live.textContent = '';
    setTimeout(function () { live.textContent = text; }, 50);
  }

  // A short slide that shows which way a value moved. Purpose: spatial consistency.
  function nudge(node, dir) {
    if (reduceMotion || !node.animate) return;
    node.animate(
      [{ opacity: 0.2, transform: 'translateX(' + (dir * 10) + 'px)' }, { opacity: 1, transform: 'none' }],
      { duration: 200, easing: EASE },
    );
  }

  // ---------------------------------------------------------------- swap

  function setUpSwap(button) {
    var pair = button.closest('.route-pair');
    var from = pickers.from;
    var to = pickers.to;
    if (!pair || !from || !to) return;
    button.hidden = false;
    button.addEventListener('click', function () {
      var a = from.select.value;
      from.setValue(to.select.value);
      to.setValue(a);
      button.setAttribute('data-turned', button.getAttribute('data-turned') === 'true' ? 'false' : 'true');
      nudge(from.input, 1);
      nudge(to.input, -1);
      announce('Swapped. From ' + label(from) + ', to ' + label(to) + '.');
    });
  }

  // ---------------------------------------------------------------- date picker

  var pad = function (n) { return String(n).padStart(2, '0'); };
  var toIso = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  var fromIso = function (s) { var p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
  var addDays = function (d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); };
  var sameDay = function (a, b) { return a && b && toIso(a) === toIso(b); };
  var fmtLong = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  var fmtShort = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  var fmtMonth = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' });
  var DAYS = [['Su', 'Sunday'], ['Mo', 'Monday'], ['Tu', 'Tuesday'], ['We', 'Wednesday'], ['Th', 'Thursday'], ['Fr', 'Friday'], ['Sa', 'Saturday']];

  function DatePicker(input) {
    var self = this;
    var id = input.id;
    var field = input.closest('.field');
    var label = field.querySelector('label[for="' + id + '"]');
    var n = ++uid;
    this.input = input;
    this.min = input.min ? fromIso(input.min) : null;
    this.max = input.max ? fromIso(input.max) : null;
    this.today = fromIso(toIso(new Date()));
    this.open = false;

    var wrap = el('div', { class: 'dp' });
    var trigger = el('button', {
      type: 'button', id: id + '-trigger', class: 'dp__trigger',
      'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-controls': 'dp-' + n,
    }, '<span class="dp__value" id="' + id + '-value"></span><span class="dp__icon">' + CALENDAR + '</span>');
    if (label) {
      if (!label.id) label.id = id + '-label';
      label.htmlFor = trigger.id;
      trigger.setAttribute('aria-labelledby', label.id + ' ' + id + '-value');
    }
    var pop = el('div', { class: 'pop dp__pop', id: 'dp-' + n, role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'dp-' + n + '-month' },
      '<div class="dp__quick"></div>' +
      '<div class="dp__head">' +
        '<button type="button" class="dp__nav" data-step="-1" aria-label="Previous month">' +
          '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false"><path d="M10 3.5 5.5 8l4.5 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
        '<h2 class="dp__month" id="dp-' + n + '-month" aria-live="polite"></h2>' +
        '<button type="button" class="dp__nav" data-step="1" aria-label="Next month">' +
          '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false"><path d="M6 3.5 10.5 8 6 12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
      '</div>' +
      '<table class="dp__grid" role="grid" aria-labelledby="dp-' + n + '-month"><thead><tr>' +
        DAYS.map(function (d) { return '<th scope="col" abbr="' + d[1] + '">' + d[0] + '</th>'; }).join('') +
      '</tr></thead><tbody></tbody></table>' +
      '<p class="dp__foot">Bookings open 30 days ahead.</p>');
    wrap.appendChild(trigger);
    wrap.appendChild(pop);
    input.hidden = true;              // still submits with the form
    input.parentNode.insertBefore(wrap, input);
    this.trigger = trigger; this.pop = pop; this.wrap = wrap;
    this.grid = pop.querySelector('tbody');
    this.monthLabel = pop.querySelector('.dp__month');

    var quick = pop.querySelector('.dp__quick');
    [['Today', 0], ['Tomorrow', 1], ['Day after', 2]].forEach(function (q) {
      var d = addDays(self.today, q[1]);
      var b = el('button', { type: 'button', class: 'dp__chip' }, q[0] + '<span>' + fmtShort.format(d).replace(/,? \d{4}$/, '') + '</span>');
      if (!self.inRange(d)) b.disabled = true;
      b.addEventListener('click', function () { self.pick(d); });
      quick.appendChild(b);
    });

    this.selected = input.value ? fromIso(input.value) : null;
    this.updateTrigger();

    trigger.addEventListener('click', function () { if (self.open) self.close(true); else self.show(); });
    trigger.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' && !self.open) { e.preventDefault(); self.show(); }
    });
    pop.addEventListener('click', function (e) {
      var nav = e.target.closest('.dp__nav');
      if (nav && !nav.disabled) { self.moveMonth(Number(nav.getAttribute('data-step')), true); return; }
      var day = e.target.closest('.dp__day');
      if (day && day.getAttribute('aria-disabled') !== 'true') self.pick(fromIso(day.getAttribute('data-date')));
    });
    pop.addEventListener('keydown', function (e) { self.onKey(e); });
    document.addEventListener('mousedown', function (e) {
      if (self.open && !wrap.contains(e.target)) self.close(false);
    });
    wrap.addEventListener('focusout', function () {
      setTimeout(function () { if (self.open && !wrap.contains(document.activeElement)) self.close(false); }, 0);
    });
  }

  DatePicker.prototype.inRange = function (d) {
    return (!this.min || d >= this.min) && (!this.max || d <= this.max);
  };
  DatePicker.prototype.clamp = function (d) {
    if (this.min && d < this.min) return this.min;
    if (this.max && d > this.max) return this.max;
    return d;
  };
  DatePicker.prototype.updateTrigger = function () {
    var v = this.trigger.querySelector('.dp__value');
    v.textContent = this.selected ? fmtShort.format(this.selected) : 'Choose a date';
  };

  DatePicker.prototype.render = function () {
    var self = this;
    var y = this.view.getFullYear();
    var m = this.view.getMonth();
    this.monthLabel.textContent = fmtMonth.format(this.view);
    var first = new Date(y, m, 1);
    var days = new Date(y, m + 1, 0).getDate();
    var html = '';
    var cell = 0;
    html += '<tr>';
    for (var i = 0; i < first.getDay(); i++) { html += '<td role="gridcell" aria-hidden="true"></td>'; cell++; }
    for (var d = 1; d <= days; d++) {
      var date = new Date(y, m, d);
      var iso = toIso(date);
      var off = !self.inRange(date);
      var sel = sameDay(date, self.selected);
      var isToday = sameDay(date, self.today);
      html += '<td role="gridcell"' + (sel ? ' aria-selected="true"' : '') + '>' +
        '<button type="button" class="dp__day" tabindex="-1" data-date="' + iso + '"' +
        ' aria-label="' + fmtLong.format(date) + (isToday ? ', today' : '') + '"' +
        (off ? ' aria-disabled="true"' : '') + (isToday ? ' aria-current="date"' : '') + '>' + d + '</button></td>';
      cell++;
      if (cell % 7 === 0 && d < days) html += '</tr><tr>';
    }
    while (cell % 7 !== 0) { html += '<td role="gridcell" aria-hidden="true"></td>'; cell++; }
    html += '</tr>';
    this.grid.innerHTML = html;

    var prev = this.pop.querySelector('[data-step="-1"]');
    var next = this.pop.querySelector('[data-step="1"]');
    prev.disabled = !!this.min && (y < this.min.getFullYear() || (y === this.min.getFullYear() && m <= this.min.getMonth()));
    next.disabled = !!this.max && (y > this.max.getFullYear() || (y === this.max.getFullYear() && m >= this.max.getMonth()));
  };

  DatePicker.prototype.focusDay = function (date, moveFocus) {
    this.focused = this.clamp(date);
    if (this.focused.getMonth() !== this.view.getMonth() || this.focused.getFullYear() !== this.view.getFullYear()) {
      this.view = new Date(this.focused.getFullYear(), this.focused.getMonth(), 1);
      this.render();
    }
    var iso = toIso(this.focused);
    this.grid.querySelectorAll('.dp__day').forEach(function (b) {
      b.tabIndex = b.getAttribute('data-date') === iso ? 0 : -1;
    });
    var btn = this.grid.querySelector('[data-date="' + iso + '"]');
    if (btn && moveFocus) btn.focus();
  };

  DatePicker.prototype.show = function () {
    var start = this.clamp(this.selected || this.today);
    this.view = new Date(start.getFullYear(), start.getMonth(), 1);
    this.render();
    this.open = true;
    this.trigger.setAttribute('aria-expanded', 'true');
    this.pop.setAttribute('data-open', 'true');
    this.focusDay(start, true);
  };
  DatePicker.prototype.close = function (returnFocus) {
    if (!this.open) return;
    this.open = false;
    this.trigger.setAttribute('aria-expanded', 'false');
    this.pop.removeAttribute('data-open');
    if (returnFocus) this.trigger.focus();
  };
  DatePicker.prototype.pick = function (date) {
    if (!this.inRange(date)) return;
    this.selected = date;
    this.input.value = toIso(date);
    this.input.dispatchEvent(new Event('change', { bubbles: true }));
    this.updateTrigger();
    this.close(true);
    announce(fmtLong.format(date) + ' selected.');
  };
  DatePicker.prototype.moveMonth = function (step, keepFocusOnNav) {
    var f = this.focused || this.view;
    var target = new Date(f.getFullYear(), f.getMonth() + step, 1);
    var last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(f.getDate(), last));
    this.focusDay(target, !keepFocusOnNav);
  };

  DatePicker.prototype.onKey = function (e) {
    if (e.key === 'Escape') { e.preventDefault(); this.close(true); return; }
    if (!e.target.classList.contains('dp__day')) return;
    var f = this.focused;
    var map = {
      ArrowLeft: function () { return addDays(f, -1); },
      ArrowRight: function () { return addDays(f, 1); },
      ArrowUp: function () { return addDays(f, -7); },
      ArrowDown: function () { return addDays(f, 7); },
      Home: function () { return addDays(f, -f.getDay()); },
      End: function () { return addDays(f, 6 - f.getDay()); },
    };
    if (map[e.key]) { e.preventDefault(); this.focusDay(map[e.key](), true); return; }
    if (e.key === 'PageUp' || e.key === 'PageDown') { e.preventDefault(); this.moveMonth(e.key === 'PageDown' ? 1 : -1, false); return; }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (e.target.getAttribute('aria-disabled') !== 'true') this.pick(fromIso(e.target.getAttribute('data-date')));
    }
  };

  // ---------------------------------------------------------------- recent searches

  var RECENT_KEY = 'rrs:recent-routes';
  function readRecent() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch { return []; }
  }
  function setUpRecent(slot) {
    var params = new URLSearchParams(location.search);
    var from = pickers.from;
    var to = pickers.to;
    if (!from || !to) return;
    var recent = readRecent();
    if (params.get('from') && params.get('to') && document.getElementById('results-heading')) {
      var entry = { from: params.get('from'), to: params.get('to') };
      recent = [entry].concat(recent.filter(function (r) { return !(r.from === entry.from && r.to === entry.to); })).slice(0, 3);
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent)); } catch { /* private mode */ }
    }
    var others = recent.filter(function (r) {
      return !(r.from === from.select.value && r.to === to.select.value) && from.item(r.from) && to.item(r.to);
    });
    if (!others.length) return;
    slot.innerHTML = '<span class="recent__label" id="recent-label">Recent routes</span>';
    var list = el('ul', { 'aria-labelledby': 'recent-label' });
    others.forEach(function (r) {
      var li = el('li');
      var b = el('button', { type: 'button', class: 'recent__item' },
        esc(from.item(r.from).name) + ' to ' + esc(to.item(r.to).name));
      b.addEventListener('click', function () {
        from.setValue(r.from);
        to.setValue(r.to);
        nudge(from.input, 1);
        nudge(to.input, 1);
        announce('From ' + label(from) + ', to ' + label(to) + '. Choose a date and search.');
        var dateTrigger = document.getElementById('date-trigger');
        if (dateTrigger) dateTrigger.focus();
      });
      li.appendChild(b);
      list.appendChild(li);
    });
    slot.appendChild(list);
    slot.hidden = false;
  }

  // ---------------------------------------------------------------- start

  document.querySelectorAll('select[data-combobox]').forEach(function (s) { new Combobox(s); });
  document.querySelectorAll('input[data-datepicker]').forEach(function (i) { new DatePicker(i); });
  document.querySelectorAll('[data-swap]').forEach(setUpSwap);
  document.querySelectorAll('[data-recent]').forEach(setUpRecent);
})();
