(() => {
  const card = document.querySelector('.login-card');

  // Login page brand
  const brand = document.createElement('div');
  brand.className = 'login-brand';
  brand.textContent = '✦  本地 AI 創作空間';
  card.prepend(brand);

  // Only play once per browser session
  let seen = false;

  try {
    seen = sessionStorage.getItem('studio-intro-luxury-v1') === '1';
  } catch {}

  // Respect reduced-motion preference
  if (
    seen ||
    matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    return;
  }

  // Create intro
  const intro = document.createElement('section');

  intro.className = 'studio-intro';
  intro.setAttribute(
    'aria-label',
    '歡迎進入本地 AI 創作空間'
  );

  intro.innerHTML = `
    <button
      type="button"
      class="intro-skip"
      aria-label="略過開場動畫"
    >
      ×
    </button>

    <div class="luxury-scene" aria-hidden="true">

      <!-- Background glow -->
      <div class="luxury-aura aura-one"></div>
      <div class="luxury-aura aura-two"></div>

      <!-- Fine particles -->
      <div class="luxury-particles">
        <i></i>
        <i></i>
        <i></i>
        <i></i>
        <i></i>
        <i></i>
      </div>

      <!-- AI Core -->
      <div class="ai-core">

        <div class="core-halo halo-outer"></div>
        <div class="core-halo halo-inner"></div>

        <div class="orbit orbit-one">
          <span class="orbit-light"></span>
        </div>

        <div class="orbit orbit-two">
          <span class="orbit-light"></span>
        </div>

        <div class="orbit orbit-three">
          <span class="orbit-light"></span>
        </div>

        <div class="core-glass">
          <div class="core-reflection"></div>
          <div class="core-light"></div>
        </div>

      </div>

      <div class="luxury-shadow"></div>

    </div>
  `;

  document.body.append(intro);

  // Disable login card while intro is playing
  card.inert = true;

  let done = false;
  let auto;
  let cleanup;

  function finish() {
    if (done) return;

    done = true;
    clearTimeout(auto);

    try {
      sessionStorage.setItem(
        'studio-intro-luxury-v1',
        '1'
      );
    } catch {}

    intro.classList.add('intro-leaving');

    cleanup = setTimeout(() => {
      intro.remove();

      card.inert = false;
      card.classList.add('login-reveal');

      card
        .querySelector('input')
        ?.focus({ preventScroll: true });

      document.removeEventListener('keydown', key);
    }, 650);
  }

  function key(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      finish();
    }
  }

  document.addEventListener('keydown', key);

  intro.querySelector('.intro-skip').onclick = finish;

  intro
    .querySelector('.intro-skip')
    .focus({ preventScroll: true });

  // Intro duration
  auto = setTimeout(finish, 3200);

  window.addEventListener(
    'pagehide',
    () => {
      clearTimeout(auto);
      clearTimeout(cleanup);
      card.inert = false;
    },
    { once: true }
  );
})();