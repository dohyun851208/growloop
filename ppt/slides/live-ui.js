(() => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const mounts = new Map();
  const NAV_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Spacebar']);

  async function waitFor(predicate, { timeout = 20000, interval = 120 } = {}) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        if (predicate()) return true;
      } catch (_) {
        // Ignore transient DOM/function access errors while loading.
      }
      await sleep(interval);
    }
    throw new Error('Live UI waitFor timeout');
  }

  function sanitizeDocument(doc) {
    if (!doc) return;

    const banner = doc.getElementById('demoBanner');
    if (banner) banner.remove();

    if (doc.body) {
      doc.body.style.paddingTop = '0px';
    }

    const modalIds = ['customModal', 'teacherSubjectCommentExportModal'];
    modalIds.forEach((id) => {
      const el = doc.getElementById(id);
      if (!el) return;
      el.classList.add('hidden');
      el.style.display = 'none';
    });

    doc.querySelectorAll('.modal-overlay').forEach((el) => {
      el.classList.add('hidden');
      el.style.display = 'none';
    });
  }

  function bindNavigationBridge(doc) {
    if (!doc || doc.__pptNavBound) return;
    doc.__pptNavBound = true;

    doc.addEventListener('keydown', (event) => {
      if (!NAV_KEYS.has(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      try {
        window.parent?.postMessage({ type: 'ppt:navigate', key: event.key }, '*');
      } catch (_) {
        // Ignore parent-post failures.
      }
    }, true);
  }

  function find(doc, selector) {
    return doc.querySelector(selector);
  }

  function click(doc, selector) {
    const el = find(doc, selector);
    if (!el) return false;
    el.click();
    return true;
  }

  function setValue(doc, selector, value) {
    const el = find(doc, selector);
    if (!el) return false;
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function clickByText(doc, selector, text) {
    const list = Array.from(doc.querySelectorAll(selector));
    const target = list.find((el) => (el.textContent || '').includes(text));
    if (!target) return false;
    target.click();
    return true;
  }

  function hide(doc, selectors) {
    selectors.forEach((selector) => {
      doc.querySelectorAll(selector).forEach((el) => {
        el.style.display = 'none';
      });
    });
  }

  function focus(doc, win, selector, options = {}) {
    const target = typeof selector === 'string' ? doc.querySelector(selector) : selector;
    if (!target) return false;

    const scale = Math.max(0.7, Math.min(3, Number(options.scale) || 1.25));
    const padding = Number(options.padding) || 20;
    const offsetX = Number(options.offsetX) || 0;
    const offsetY = Number(options.offsetY) || 0;
    const align = options.align || 'center';

    doc.body.style.zoom = '1';
    const rect = target.getBoundingClientRect();
    const pageLeft = win.scrollX + rect.left;
    const pageTop = win.scrollY + rect.top;

    doc.body.style.zoom = String(scale);
    const vw = win.innerWidth;
    const vh = win.innerHeight;
    const tw = rect.width * scale;
    const th = rect.height * scale;

    let left = pageLeft * scale - (vw - tw) / 2;
    let top = pageTop * scale - (vh - th) / 2;

    if (align === 'top') top = pageTop * scale - padding;
    if (align === 'left') left = pageLeft * scale - padding;

    win.scrollTo({
      left: Math.max(0, left + offsetX - padding),
      top: Math.max(0, top + offsetY - padding),
      behavior: 'auto'
    });
    return true;
  }

  function focusFirst(doc, win, selectors, options = {}) {
    for (const selector of selectors) {
      if (focus(doc, win, selector, options)) return selector;
    }
    return null;
  }

  async function runMount(entry) {
    const { frameId, frame, setup } = entry;
    if (!frame || !setup) return;

    if (entry.running) {
      entry.pending = true;
      return;
    }

    entry.running = true;
    try {
      const win = frame.contentWindow;
      const doc = frame.contentDocument;
      if (!win || !doc) return;

      bindNavigationBridge(doc);

      await waitFor(() => doc.readyState === 'complete', { timeout: 20000 });
      await waitFor(
        () => typeof win.switchStudentMainTab === 'function' || typeof win.switchMiniTab === 'function',
        { timeout: 20000 }
      );

      const api = {
        frame,
        win,
        doc,
        sleep,
        waitFor,
        sanitize: () => sanitizeDocument(doc),
        find: (selector) => find(doc, selector),
        click: (selector) => click(doc, selector),
        clickByText: (selector, text) => clickByText(doc, selector, text),
        setValue: (selector, value) => setValue(doc, selector, value),
        hide: (selectors) => hide(doc, selectors),
        focus: (selector, options) => focus(doc, win, selector, options),
        focusFirst: (selectors, options) => focusFirst(doc, win, selectors, options)
      };

      api.sanitize();
      await sleep(250);
      await setup(api);
      api.sanitize();
    } catch (err) {
      console.error('[LiveUiEmbed]', frameId, err);
    } finally {
      entry.running = false;
      if (entry.pending) {
        entry.pending = false;
        window.setTimeout(() => runMount(entry), 80);
      }
    }
  }

  function mount(frameId, setup) {
    const frame = document.getElementById(frameId);
    if (!frame) return;

    const entry = mounts.get(frameId) || {
      frameId,
      frame: null,
      setup: null,
      running: false,
      pending: false,
      loadBound: false
    };
    entry.frame = frame;
    entry.setup = setup;
    mounts.set(frameId, entry);

    if (!entry.loadBound) {
      frame.addEventListener('load', () => {
        runMount(entry);
      });
      entry.loadBound = true;
    }

    if (frame.dataset.src && frame.getAttribute('src') !== frame.dataset.src) {
      frame.src = frame.dataset.src;
      return;
    }

    if (frame.contentDocument && frame.contentDocument.readyState === 'complete') {
      runMount(entry);
    }
  }

  function remountAll() {
    mounts.forEach((entry) => {
      runMount(entry);
    });
  }

  window.addEventListener('ppt:activate', remountAll);
  window.addEventListener('message', (event) => {
    if (event?.data?.type === 'ppt:activate') {
      remountAll();
    }
  });

  bindNavigationBridge(document);

  window.LiveUiEmbed = { mount, sleep };
})();
