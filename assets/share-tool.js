(function () {
  'use strict';

  function getCanonicalUrl() {
    const link = document.querySelector('link[rel="canonical"]');
    if (link && link.href) {
      try {
        const u = new URL(link.href);
        if (u.protocol === 'https:') return u.href;
      } catch (e) {
        // Fallback to window.location
      }
    }
    return window.location.href.split('#')[0];
  }

  function createIcon(name, cls) {
    const icon = document.createElement('i');
    icon.setAttribute('data-lucide', name);
    icon.className = cls;
    return icon;
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      try {
        const input = document.createElement('textarea');
        input.value = text;
        input.setAttribute('readonly', '');
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.appendChild(input);
        input.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(input);
        if (ok) resolve();
        else reject(new Error('Copy command failed'));
      } catch (err) {
        reject(err);
      }
    });
  }

  function mountShareBar(el) {
    const url = getCanonicalUrl();
    const title = (el.dataset.shareTitle || document.title || 'SikhRPA Free Safety Resource').trim();
    const subtitle =
      (el.dataset.shareSubtitle ||
        'Know a new California shooter or range buddy who needs this? Share this free, ad-free nonprofit tool.').trim();

    el.textContent = '';

    const wrap = document.createElement('div');
    wrap.className =
      'bg-slate-900 text-white rounded-2xl p-5 sm:p-6 border border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 no-print';

    const left = document.createElement('div');
    left.className = 'space-y-1 max-w-xl';

    const eyebrow = document.createElement('span');
    eyebrow.className =
      'inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-amber-400';
    eyebrow.appendChild(createIcon('share-2', 'w-3.5 h-3.5'));
    const eyebrowText = document.createElement('span');
    eyebrowText.textContent = 'Free Public Safety Resource';
    eyebrow.appendChild(eyebrowText);

    const heading = document.createElement('p');
    heading.className = 'font-extrabold text-sm sm:text-base text-white';
    heading.textContent = 'Share This Guide With a Fellow Shooter';

    const desc = document.createElement('p');
    desc.className = 'text-xs text-slate-300 leading-relaxed';
    desc.textContent = subtitle;

    left.appendChild(eyebrow);
    left.appendChild(heading);
    left.appendChild(desc);

    const actions = document.createElement('div');
    actions.className = 'flex flex-wrap items-center gap-2 shrink-0';

    // Copy Link button
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className =
      'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs transition-colors shadow-sm cursor-pointer touch-target';
    copyBtn.appendChild(createIcon('link', 'w-3.5 h-3.5'));
    const copyLabel = document.createElement('span');
    copyLabel.textContent = 'Copy Link';
    copyBtn.appendChild(copyLabel);

    copyBtn.addEventListener('click', function () {
      copyToClipboard(url)
        .then(function () {
          copyLabel.textContent = 'Link Copied!';
          setTimeout(function () {
            copyLabel.textContent = 'Copy Link';
          }, 2200);
        })
        .catch(function () {
          copyLabel.textContent = 'Copy Failed';
          setTimeout(function () {
            copyLabel.textContent = 'Copy Link';
          }, 2200);
        });
    });
    actions.appendChild(copyBtn);

    // Native Share API button (mobile / supported browsers)
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      const nativeBtn = document.createElement('button');
      nativeBtn.type = 'button';
      nativeBtn.className =
        'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 font-bold text-xs transition-colors cursor-pointer touch-target';
      nativeBtn.appendChild(createIcon('send', 'w-3.5 h-3.5 text-amber-300'));
      const nativeLabel = document.createElement('span');
      nativeLabel.textContent = 'Share...';
      nativeBtn.appendChild(nativeLabel);
      nativeBtn.addEventListener('click', function () {
        navigator.share({ title: title, url: url }).catch(function () {
          // User canceled share sheet
        });
      });
      actions.appendChild(nativeBtn);
    }

    // Reddit share link
    const redditLink = document.createElement('a');
    redditLink.href =
      'https://www.reddit.com/submit?url=' + encodeURIComponent(url) + '&title=' + encodeURIComponent(title);
    redditLink.target = '_blank';
    redditLink.rel = 'noopener noreferrer';
    redditLink.className =
      'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-100 border border-white/15 font-bold text-xs transition-colors touch-target';
    redditLink.textContent = 'Reddit';
    actions.appendChild(redditLink);

    // WhatsApp share link
    const waLink = document.createElement('a');
    waLink.href = 'https://wa.me/?text=' + encodeURIComponent(title + ' — ' + url);
    waLink.target = '_blank';
    waLink.rel = 'noopener noreferrer';
    waLink.className =
      'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600/90 hover:bg-emerald-500 text-white font-bold text-xs transition-colors touch-target';
    waLink.textContent = 'WhatsApp';
    actions.appendChild(waLink);

    wrap.appendChild(left);
    wrap.appendChild(actions);
    el.appendChild(wrap);

    if (typeof window.lucide !== 'undefined' && window.lucide && typeof window.lucide.createIcons === 'function') {
      try {
        window.lucide.createIcons();
      } catch (e) {
        // Ignore icon notices
      }
    }
  }

  function init() {
    document.querySelectorAll('[data-share-bar]').forEach(mountShareBar);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
