// TV Display Application
(function () {
  'use strict';

  const API_BASE = window.location.origin + '/api';
  let socket = null;
  let currentAreaId = null;
  const flashTimers = {};

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

  async function init() {
    updateClock();
    setInterval(updateClock, 1000);
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
    if (adImages.length > 1) {
      adIntervalId = setInterval(function() {
        adSlideImgEl.classList.add('fade-out');
        setTimeout(function() {
          adCurrentIndex = (adCurrentIndex + 1) % adImages.length;
          adSlideImgEl.src = adImages[adCurrentIndex];
          adSlideImgEl.classList.remove('fade-out');
        }, 500);
      }, adSlideDuration * 1000);
    }
  }

  function stopSlideshow() {
    if (adIntervalId) {
      clearInterval(adIntervalId);
      adIntervalId = null;
    }
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
      socket.emit('request:status', currentAreaId);
      setTimeout(() => flashServingCard(data.ticket.ticket_number), 100);
    });

    socket.on('ticket:recalled', (data) => {
      setTimeout(() => flashServingCard(data.ticket.ticket_number), 100);
    });

    socket.on('ticket:completed', () => socket.emit('request:status', currentAreaId));
    socket.on('ticket:skipped', () => socket.emit('request:status', currentAreaId));
    socket.on('queue:reset', () => socket.emit('request:status', currentAreaId));
  }

  // Track which tickets are flashing (with expiry timestamps)
  const flashingTicketsMap = {};

  // Render queue grouped by service type
  function renderQueue(data) {
    // === SERVING ===
    const now = Date.now();
    // Clean expired flash entries
    for (const key of Object.keys(flashingTicketsMap)) {
      if (flashingTicketsMap[key] <= now) delete flashingTicketsMap[key];
    }

    const servingCount = data.serving.length;
    // Dynamic size class based on item count
    const sizeClass = servingCount <= 2 ? 'size-lg' : servingCount <= 4 ? 'size-md' : servingCount <= 6 ? 'size-sm' : 'size-xs';

    servingListEl.innerHTML = '';
    servingListEl.className = sizeClass;
    if (servingCount === 0) {
      servingListEl.className = '';
      servingListEl.innerHTML = '<p style="color: #4a6b4a; text-align: center; font-size: 24px; margin-top: 40px;">Chưa có số đang phục vụ</p>';
    } else {
      data.serving.forEach(ticket => {
        const card = document.createElement('div');
        card.className = 'serving-card';
        card.dataset.ticket = ticket.ticket_number;
        card.innerHTML = `
          <div>
            <div class="serving-number">${ticket.ticket_number}</div>
            <div class="serving-service-type">${ticket.service_type_name || ''}</div>
          </div>
          <div class="serving-counter">
            <div class="serving-counter-name">${ticket.counter_name || ''}</div>
          </div>
        `;
        if (flashingTicketsMap[ticket.ticket_number] && flashingTicketsMap[ticket.ticket_number] > now) {
          card.classList.add('flash');
        }
        servingListEl.appendChild(card);
      });
    }

    // === WAITING - grouped by service type ===
    const waitingCount = data.waiting.length;
    const waitSizeClass = waitingCount <= 12 ? 'wait-lg' : waitingCount <= 24 ? 'wait-md' : waitingCount <= 40 ? 'wait-sm' : 'wait-xs';
    waitingListEl.innerHTML = '';
    if (waitingCount === 0) {
      waitingListEl.className = '';
      waitingListEl.innerHTML = '<p style="color: #4a6b4a; text-align: center; font-size: 22px; margin-top: 40px;">Chưa có số chờ</p>';
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
          badge.textContent = ticket.ticket_number;
          badges.appendChild(badge);
        });
        groupDiv.appendChild(badges);
        waitingListEl.appendChild(groupDiv);
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

  function flashServingCard(ticketNumber) {
    // Set flash expiry 20s from now
    flashingTicketsMap[ticketNumber] = Date.now() + 20000;

    const card = document.querySelector(`.serving-card[data-ticket="${ticketNumber}"]`);
    if (!card) return;
    card.classList.add('flash');

    if (flashTimers[ticketNumber]) clearTimeout(flashTimers[ticketNumber]);
    flashTimers[ticketNumber] = setTimeout(() => {
      delete flashingTicketsMap[ticketNumber];
      const el = document.querySelector(`.serving-card[data-ticket="${ticketNumber}"]`);
      if (el) el.classList.remove('flash');
      delete flashTimers[ticketNumber];
    }, 20000);
  }

  function updateClock() {
    const now = new Date();
    currentTimeEl.textContent = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    currentDateEl.textContent = now.toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }

  init();
})();
