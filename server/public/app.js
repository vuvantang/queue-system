// TV Display Application
(function () {
  'use strict';

  const API_BASE = window.location.origin + '/api';
  let socket = null;
  let currentAreaId = null;
  const flashTimers = {};

  // Motion settings (keep CALLED_MS in sync with --dur-called in style.css)
  const CALLED_MS = 16000;
  const LEAVE_MS = 220;
  const reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  function prefersReducedMotion() { return reduceMotionQuery.matches; }

  // Ad slideshow state
  const adSlideshowEl = document.getElementById('ad-slideshow');
  const adSlideImgEl = document.getElementById('ad-slide-img');
  let adImages = [];
  let adSlideDuration = 5;
  let adCurrentIndex = 0;
  let adIntervalId = null;
  let isQueueEmpty = false;

  // DOM elements
  const orgNameEl = document.getElementById('org-name');
  const logoEl = document.getElementById('logo');
  const connectionStatusEl = document.getElementById('connection-status');
  const servingListEl = document.getElementById('serving-list');
  const waitingListEl = document.getElementById('waiting-list');
  const completedCountEl = document.getElementById('completed-count');
  const waitingCountEl = document.getElementById('waiting-count');
  const currentTimeEl = document.getElementById('current-time');
  const currentDateEl = document.getElementById('current-date');

  function getAreaIdFromUrl() {
    const match = /^\/tv\/(\d+)/.exec(window.location.pathname);
    return match ? Number(match[1]) : null;
  }

  let clockIntervalId = null;
  function startClock() {
    updateClock();
    if (!clockIntervalId) clockIntervalId = setInterval(updateClock, 1000);
  }
  function stopClock() {
    if (clockIntervalId) { clearInterval(clockIntervalId); clockIntervalId = null; }
  }

  // Stop nonessential loops while the tab is hidden; resume on return
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      stopClock();
      pauseSlideshow();
    } else {
      startClock();
      resumeSlideshow();
    }
  });

  async function init() {
    startClock();
    await loadSettings();

    currentAreaId = getAreaIdFromUrl();
    if (!currentAreaId) {
      document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:#4a6b4a;font-size:24px;">Vui lòng truy cập /tv/&lt;ID khu vực&gt;</div>';
      return;
    }
    await loadAdvertisements();
    setInterval(loadAdvertisements, 60000);
    connectSocket();
  }

  async function loadSettings() {
    try {
      const res = await fetch(API_BASE + '/settings');
      const settings = await res.json();
      if (settings.org_name) orgNameEl.textContent = settings.org_name;
      if (settings.logo) {
        logoEl.src = settings.logo;
        logoEl.classList.remove('hidden');
      }
      if (settings.ad_slide_duration) {
        adSlideDuration = parseInt(settings.ad_slide_duration, 10) || 5;
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  }

  async function loadAdvertisements() {
    try {
      const res = await fetch(API_BASE + '/advertisements');
      const ads = await res.json();
      adImages = ads.map(function(a) { return a.image_path; });
    } catch (err) {
      console.error('Failed to load ads:', err);
    }
  }

  function startSlideshow() {
    if (adImages.length === 0 || adIntervalId) return;
    adCurrentIndex = 0;
    adSlideImgEl.src = adImages[0];
    adSlideImgEl.classList.remove('fade-out');
    adSlideshowEl.classList.remove('hidden');
    startSlideTimer();
  }

  function startSlideTimer() {
    if (adIntervalId || adImages.length <= 1 || document.hidden) return;
    adIntervalId = setInterval(function() {
      adSlideImgEl.classList.add('fade-out');
      setTimeout(function() {
        adCurrentIndex = (adCurrentIndex + 1) % adImages.length;
        adSlideImgEl.src = adImages[adCurrentIndex];
        adSlideImgEl.classList.remove('fade-out');
      }, 500);
    }, adSlideDuration * 1000);
  }

  function pauseSlideshow() {
    if (adIntervalId) {
      clearInterval(adIntervalId);
      adIntervalId = null;
    }
  }

  function resumeSlideshow() {
    if (isQueueEmpty && !adSlideshowEl.classList.contains('hidden')) startSlideTimer();
  }

  function stopSlideshow() {
    pauseSlideshow();
    adSlideshowEl.classList.add('hidden');
  }

  function connectSocket() {
    if (socket) socket.disconnect();
    socket = io(window.location.origin);

    socket.on('connect', () => {
      connectionStatusEl.textContent = 'Đã kết nối';
      connectionStatusEl.className = 'connected';
      socket.emit('join:area', currentAreaId);
    });

    socket.on('disconnect', () => {
      connectionStatusEl.textContent = 'Mất kết nối';
      connectionStatusEl.className = 'disconnected';
    });

    socket.on('queue:status', (data) => renderQueue(data));
    socket.on('ticket:created', () => socket.emit('request:status', currentAreaId));

    socket.on('ticket:called', (data) => {
      // Mark first so the card is born highlighted when the new status renders
      markCalled(data.ticket.ticket_number);
      socket.emit('request:status', currentAreaId);
      setTimeout(() => flashServingCard(data.ticket.ticket_number), 100);
    });

    socket.on('ticket:recalled', (data) => {
      setTimeout(() => flashServingCard(data.ticket.ticket_number, true), 100);
    });

    socket.on('ticket:completed', () => socket.emit('request:status', currentAreaId));
    socket.on('ticket:skipped', () => socket.emit('request:status', currentAreaId));
    socket.on('queue:reset', () => socket.emit('request:status', currentAreaId));
  }

  // Called tickets -> timestamp of the call. The highlight on a serving card
  // is driven from this, so it survives re-renders and stays in phase.
  const calledAtMap = {};
  // Ticket numbers on screen in the waiting list (null until first render)
  let knownWaiting = null;
  let pendingData = null;
  let leaveTimerId = null;

  function markCalled(ticketNumber) {
    calledAtMap[ticketNumber] = Date.now();
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Start (or resync) the called sequence on a card. Restarting with the
  // elapsed time as a negative delay keeps it continuous across re-renders.
  function applyCalledState(card, calledAt, restart) {
    const elapsed = Math.max(0, Date.now() - calledAt);
    if (elapsed >= CALLED_MS) {
      card.classList.remove('is-called');
      return;
    }
    card.style.setProperty('--called-offset', (-elapsed) + 'ms');
    if (restart && card.classList.contains('is-called')) {
      card.classList.remove('is-called');
      void card.offsetWidth; // restart CSS animations
    }
    card.classList.add('is-called');
  }

  // Render queue. If called tickets are leaving the waiting list, let them
  // fade out first, then render the newest status we have.
  function renderQueue(data) {
    pendingData = data;
    if (leaveTimerId) return;

    const nextWaiting = new Set(data.waiting.map(t => t.ticket_number));
    const leaving = Array.prototype.filter.call(
      waitingListEl.querySelectorAll('.waiting-badge'),
      b => !nextWaiting.has(b.dataset.ticket)
    );
    if (leaving.length > 0 && !document.hidden) {
      leaving.forEach(b => { b.classList.remove('is-new'); b.classList.add('is-leaving'); });
      leaveTimerId = setTimeout(() => {
        leaveTimerId = null;
        renderNow(pendingData);
      }, prefersReducedMotion() ? 140 : LEAVE_MS);
      return;
    }
    renderNow(data);
  }

  function renderNow(data) {
    pendingData = null;
    // === SERVING ===
    const now = Date.now();
    for (const key of Object.keys(calledAtMap)) {
      if (calledAtMap[key] + CALLED_MS <= now) delete calledAtMap[key];
    }

    // FLIP: remember where existing cards were so they glide to new slots
    const firstTops = {};
    servingListEl.querySelectorAll('.serving-card').forEach(card => {
      firstTops[card.dataset.ticket] = card.getBoundingClientRect().top;
    });

    const servingCount = data.serving.length;
    // Dynamic size class based on item count
    const sizeClass = servingCount <= 2 ? 'size-lg' : servingCount <= 4 ? 'size-md' : servingCount <= 6 ? 'size-sm' : 'size-xs';

    servingListEl.innerHTML = '';
    servingListEl.className = sizeClass;
    if (servingCount === 0) {
      servingListEl.className = '';
      servingListEl.innerHTML = '<p class="empty-state">Chưa có số đang phục vụ</p>';
    } else {
      data.serving.forEach(ticket => {
        const card = document.createElement('div');
        card.className = 'serving-card';
        card.dataset.ticket = ticket.ticket_number;
        card.innerHTML = `
          <div>
            <div class="serving-number">${escapeHtml(ticket.ticket_number)}</div>
            <div class="serving-service-type">${escapeHtml(ticket.service_type_name)}</div>
          </div>
          <div class="serving-counter">
            <div class="serving-counter-name">${escapeHtml(ticket.counter_name)}</div>
          </div>
        `;
        if (calledAtMap[ticket.ticket_number]) {
          applyCalledState(card, calledAtMap[ticket.ticket_number], false);
        }
        servingListEl.appendChild(card);
      });

      if (!prefersReducedMotion() && !document.hidden) {
        servingListEl.querySelectorAll('.serving-card').forEach(card => {
          const firstTop = firstTops[card.dataset.ticket];
          if (firstTop === undefined) return;
          const dy = firstTop - card.getBoundingClientRect().top;
          if (Math.abs(dy) < 1) return;
          card.animate(
            [{ transform: `translateY(${dy}px)` }, { transform: 'none' }],
            { duration: 420, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }
          );
        });
      }
    }

    // === WAITING - grouped by service type ===
    const waitingCount = data.waiting.length;
    const waitSizeClass = waitingCount <= 12 ? 'wait-lg' : waitingCount <= 24 ? 'wait-md' : waitingCount <= 40 ? 'wait-sm' : 'wait-xs';
    const previousWaiting = knownWaiting;
    knownWaiting = new Set(data.waiting.map(t => t.ticket_number));
    waitingListEl.innerHTML = '';
    if (waitingCount === 0) {
      waitingListEl.className = '';
      waitingListEl.innerHTML = '<p class="empty-state">Chưa có số chờ</p>';
    } else {
      waitingListEl.className = waitSizeClass;
      // Group by service_type_id
      const groups = {};
      const stNames = {};
      if (data.service_types) {
        data.service_types.forEach(st => { stNames[st.id] = st.name; });
      }
      data.waiting.forEach(ticket => {
        const stId = ticket.service_type_id;
        if (!groups[stId]) groups[stId] = [];
        groups[stId].push(ticket);
        if (!stNames[stId] && ticket.service_type_name) {
          stNames[stId] = ticket.service_type_name;
        }
      });

      for (const stId of Object.keys(groups)) {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'waiting-group';

        const header = document.createElement('div');
        header.className = 'waiting-group-header';
        header.textContent = stNames[stId] || 'Khác';
        groupDiv.appendChild(header);

        const badges = document.createElement('div');
        badges.className = 'waiting-group-badges';
        groups[stId].forEach(ticket => {
          const badge = document.createElement('div');
          badge.className = 'waiting-badge';
          badge.dataset.ticket = ticket.ticket_number;
          badge.textContent = ticket.ticket_number;
          // Only tickets that appeared since the last render animate in
          if (previousWaiting && !previousWaiting.has(ticket.ticket_number)) {
            badge.classList.add('is-new');
            badge.addEventListener('animationend', function onEnd(e) {
              if (e.animationName !== 'badgeWash') return;
              badge.classList.remove('is-new');
              badge.removeEventListener('animationend', onEnd);
            });
          }
          badges.appendChild(badge);
        });
        groupDiv.appendChild(badges);
        waitingListEl.appendChild(groupDiv);
      }

      // A TV can't scroll: if the list overflows this screen, step down to smaller badge sizes until it fits.
      const sizes = ['wait-lg', 'wait-md', 'wait-sm', 'wait-xs'];
      let sizeIdx = sizes.indexOf(waitSizeClass);
      while (sizeIdx < sizes.length - 1 && waitingListEl.scrollHeight > waitingListEl.clientHeight + 1) {
        waitingListEl.className = sizes[++sizeIdx];
      }
    }

    completedCountEl.textContent = data.completed_count;
    waitingCountEl.textContent = data.waiting_count;

    // Ad slideshow: show when both queues are empty
    const queueEmpty = data.serving.length === 0 && data.waiting.length === 0;
    if (queueEmpty && adImages.length > 0 && !isQueueEmpty) {
      isQueueEmpty = true;
      startSlideshow();
    } else if (!queueEmpty && isQueueEmpty) {
      isQueueEmpty = false;
      stopSlideshow();
    }
  }

  // isRecall restarts the sequence from the top; a fresh call only makes
  // sure it is running (the render may already have started it).
  function flashServingCard(ticketNumber, isRecall) {
    if (isRecall || !calledAtMap[ticketNumber]) markCalled(ticketNumber);
    const calledAt = calledAtMap[ticketNumber];

    const card = document.querySelector(`.serving-card[data-ticket="${CSS.escape(ticketNumber)}"]`);
    if (card && (isRecall || !card.classList.contains('is-called'))) {
      applyCalledState(card, calledAt, true);
    }

    // Drop the highlight class once the sequence has finished
    if (flashTimers[ticketNumber]) clearTimeout(flashTimers[ticketNumber]);
    flashTimers[ticketNumber] = setTimeout(() => {
      delete flashTimers[ticketNumber];
      if (calledAtMap[ticketNumber] !== calledAt) return; // superseded by a recall
      delete calledAtMap[ticketNumber];
      const el = document.querySelector(`.serving-card[data-ticket="${CSS.escape(ticketNumber)}"]`);
      if (el) el.classList.remove('is-called');
    }, Math.max(0, calledAt + CALLED_MS - Date.now()));
  }

  function updateClock() {
    const now = new Date();
    const time = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    // Be Vietnam Pro has no tabular figures: give each digit a fixed cell so the clock doesn't jitter.
    currentTimeEl.innerHTML = time.replace(/\d/g, '<span class="clock-digit">$&</span>');
    currentDateEl.textContent = now.toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }

  init();
})();
