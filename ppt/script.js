(() => {
  if (window.__pptDeckInitialized) {
    return;
  }
  window.__pptDeckInitialized = true;

  const slides = Array.from(document.querySelectorAll('.slide'));
  const deck = document.querySelector('.deck');
  const indicator = document.getElementById('slideIndicator');

  if (!slides.length) {
    return;
  }

  if (!document.body.hasAttribute('tabindex')) {
    document.body.setAttribute('tabindex', '-1');
  }

  let current = Math.max(
    slides.findIndex((slide) => slide.classList.contains('is-active')),
    0
  );

  const notifyActiveSlide = () => {
    const activeSlide = slides[current];
    const frame = activeSlide?.querySelector('.slide-frame');
    if (!frame || !frame.contentWindow) {
      return;
    }

    try {
      frame.contentWindow.postMessage({ type: 'ppt:activate', index: current }, '*');
      frame.contentWindow.dispatchEvent(new Event('ppt:activate'));
    } catch (_) {
      // Ignore cross-frame timing errors during initial load.
    }
  };

  const render = () => {
    slides.forEach((slide, idx) => {
      slide.classList.toggle('is-active', idx === current);
      slide.setAttribute('aria-hidden', idx === current ? 'false' : 'true');
    });

    if (indicator) {
      indicator.textContent = `${current + 1} / ${slides.length}`;
    }

    window.setTimeout(notifyActiveSlide, 0);
  };

  const goTo = (index) => {
    if (index < 0 || index >= slides.length) {
      return;
    }
    current = index;
    render();
  };

  let keyLock = false;
  const releaseKeyLock = () => {
    window.setTimeout(() => {
      keyLock = false;
    }, 90);
  };

  const navigateByKey = (key) => {
    if (keyLock) {
      return false;
    }

    if (key === 'ArrowLeft' || key === 'PageUp') {
      keyLock = true;
      goTo(current - 1);
      releaseKeyLock();
      return true;
    }

    if (key === 'ArrowRight' || key === 'PageDown' || key === ' ' || key === 'Spacebar') {
      keyLock = true;
      goTo(current + 1);
      releaseKeyLock();
      return true;
    }

    if (key === 'Home') {
      keyLock = true;
      goTo(0);
      releaseKeyLock();
      return true;
    }

    if (key === 'End') {
      keyLock = true;
      goTo(slides.length - 1);
      releaseKeyLock();
      return true;
    }

    return false;
  };

  const handleKeydown = (event) => {
    if (navigateByKey(event.key)) {
      event.preventDefault();
    }
  };

  const handleMessageNavigate = (event) => {
    const data = event?.data;
    if (!data || data.type !== 'ppt:navigate') {
      return;
    }
    navigateByKey(data.key);
  };

  const bindSlideFrameKeyBridge = (frame) => {
    if (!frame || frame.__pptKeyBridgeBound) {
      return;
    }

    try {
      const doc = frame.contentDocument;
      const win = frame.contentWindow;
      if (!doc) return;
      const handler = (event) => {
        if (navigateByKey(event.key)) {
          event.preventDefault();
          event.stopPropagation();
        }
      };
      doc.addEventListener('keydown', handler, true);
      win?.addEventListener('keydown', handler, true);
      frame.__pptKeyBridgeBound = true;
    } catch (_) {
      // Ignore frame access timing/cross-origin issues.
    }
  };

  const handleClickNavigate = (event) => {
    const x = event.clientX;
    const width = window.innerWidth || document.documentElement.clientWidth;

    if (x > width * 0.55) {
      goTo(current + 1);
      return;
    }

    if (x < width * 0.45) {
      goTo(current - 1);
    }
  };

  let wheelLocked = false;
  const handleWheelNavigate = (event) => {
    // Keep wheel free for iframe scrolling. Use Alt+Wheel for slide navigation.
    if (!event.altKey) {
      return;
    }

    if (wheelLocked) {
      return;
    }

    if (Math.abs(event.deltaY) < 12) {
      return;
    }

    event.preventDefault();
    wheelLocked = true;
    if (event.deltaY > 0) {
      goTo(current + 1);
    } else {
      goTo(current - 1);
    }

    window.setTimeout(() => {
      wheelLocked = false;
    }, 220);
  };

  window.addEventListener('keydown', handleKeydown);
  window.addEventListener('message', handleMessageNavigate);

  if (deck) {
    deck.addEventListener('click', handleClickNavigate);
    deck.addEventListener('wheel', handleWheelNavigate, { passive: false });
  }

  slides.forEach((slide, idx) => {
    const frame = slide.querySelector('.slide-frame');
    if (!frame) return;
    bindSlideFrameKeyBridge(frame);
    frame.addEventListener('load', () => {
      bindSlideFrameKeyBridge(frame);
      if (idx === current) {
        notifyActiveSlide();
      }
    });
  });

  document.addEventListener('pointerdown', () => {
    window.focus();
    document.body.focus();
  });

  window.focus();
  document.body.focus();
  render();
})();
