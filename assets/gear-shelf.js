(function () {
  'use strict';

  const CATALOG_URL = 'data/range-gear.json';
  let catalogPromise = null;

  function safeExternalUrl(raw) {
    if (typeof raw !== 'string' || !raw.trim()) return '';
    try {
      const u = new URL(raw.trim());
      return u.protocol === 'https:' ? u.href : '';
    } catch (e) {
      return '';
    }
  }

  function safeImageUrl(raw) {
    if (typeof raw !== 'string' || !raw.trim()) return '';
    const trimmed = raw.trim();
    if (/^assets\/gear\/[A-Za-z0-9._-]+\.(?:png|jpe?g|webp|avif)$/i.test(trimmed)) {
      return trimmed;
    }
    return safeExternalUrl(trimmed);
  }

  function resolveAffiliateLink(product, config) {
    if (product.direct_only) return null;

    const customAff = safeExternalUrl(product.affiliate_url);
    if (customAff) {
      return {
        url: customAff,
        label: product.affiliate_label || 'Shop Authorized Partner',
        isAmazon: false
      };
    }

    const tag = (config && config.amazon_tag ? String(config.amazon_tag) : '').trim();
    if (!tag) return null;

    const asin = (product.amazon_asin || '').trim();
    if (/^[A-Z0-9]{10}$/i.test(asin)) {
      return {
        url: 'https://www.amazon.com/dp/' + encodeURIComponent(asin) + '?tag=' + encodeURIComponent(tag),
        label: 'Check Price on Amazon',
        isAmazon: true
      };
    }

    const query = (product.amazon_search_query || '').trim();
    if (config && config.enable_amazon_search_fallback && query) {
      return {
        url: 'https://www.amazon.com/s?k=' + encodeURIComponent(query) + '&tag=' + encodeURIComponent(tag),
        label: 'Check Price on Amazon',
        isAmazon: true
      };
    }

    return null;
  }

  // Constant, self-contained SVG silhouettes used strictly as offline/broken-image fallbacks.
  const FALLBACK_SVGS = {
    lockbox:
      '<svg viewBox="0 0 240 120" class="w-full h-full" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<rect x="44" y="24" width="152" height="76" rx="12" fill="#1e293b" stroke="#0f172a" stroke-width="2.5"/>' +
      '<rect x="56" y="34" width="128" height="56" rx="6" fill="#0f172a" stroke="#475569" stroke-width="1.5"/>' +
      '<circle cx="96" cy="62" r="14" fill="#334155" stroke="#f59e0b" stroke-width="2"/>' +
      '<circle cx="96" cy="62" r="4" fill="#f59e0b"/>' +
      '<rect x="122" y="48" width="46" height="28" rx="4" fill="#1e293b" stroke="#64748b" stroke-width="1.5"/>' +
      '<circle cx="132" cy="57" r="2.5" fill="#94a3b8"/><circle cx="145" cy="57" r="2.5" fill="#94a3b8"/><circle cx="158" cy="57" r="2.5" fill="#94a3b8"/>' +
      '<circle cx="132" cy="68" r="2.5" fill="#94a3b8"/><circle cx="145" cy="68" r="2.5" fill="#94a3b8"/><circle cx="158" cy="68" r="2.5" fill="#10b981"/>' +
      '</svg>',
    'range-bag':
      '<svg viewBox="0 0 240 120" class="w-full h-full" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<path d="M90 38 C90 22 150 22 150 38" fill="none" stroke="#334155" stroke-width="5" stroke-linecap="round"/>' +
      '<rect x="44" y="36" width="152" height="62" rx="12" fill="#1e3a8a" stroke="#0f172a" stroke-width="2"/>' +
      '<rect x="58" y="48" width="124" height="38" rx="7" fill="#0f172a" fill-opacity="0.35" stroke="#93c5fd" stroke-width="1.5"/>' +
      '<line x1="64" y1="58" x2="176" y2="58" stroke="#f59e0b" stroke-width="2.5" stroke-dasharray="5 3"/>' +
      '<circle cx="120" cy="58" r="5" fill="#f59e0b"/>' +
      '</svg>',
    'hard-case':
      '<svg viewBox="0 0 240 120" class="w-full h-full" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<rect x="38" y="28" width="164" height="68" rx="10" fill="#334155" stroke="#0f172a" stroke-width="2.5"/>' +
      '<line x1="56" y1="28" x2="56" y2="96" stroke="#1e293b" stroke-width="4"/>' +
      '<line x1="184" y1="28" x2="184" y2="96" stroke="#1e293b" stroke-width="4"/>' +
      '<rect x="96" y="18" width="48" height="12" rx="4" fill="#1e293b" stroke="#0f172a" stroke-width="2"/>' +
      '<rect x="74" y="88" width="18" height="10" rx="2" fill="#f59e0b"/>' +
      '<rect x="148" y="88" width="18" height="10" rx="2" fill="#f59e0b"/>' +
      '</svg>',
    padlock:
      '<svg viewBox="0 0 240 120" class="w-full h-full" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<path d="M98 54 V36 A22 22 0 0 1 142 36 V54" fill="none" stroke="#64748b" stroke-width="8" stroke-linecap="round"/>' +
      '<rect x="86" y="50" width="68" height="50" rx="8" fill="#d97706" stroke="#78350f" stroke-width="2.5"/>' +
      '<circle cx="120" cy="72" r="6" fill="#0f172a"/>' +
      '<rect x="117" y="75" width="6" height="12" rx="2" fill="#0f172a"/>' +
      '</svg>',
    'ammo-can':
      '<svg viewBox="0 0 240 120" class="w-full h-full" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<rect x="52" y="34" width="136" height="66" rx="6" fill="#14532d" stroke="#052e16" stroke-width="2.5"/>' +
      '<rect x="48" y="28" width="144" height="14" rx="4" fill="#166534" stroke="#052e16" stroke-width="2"/>' +
      '<rect x="108" y="42" width="24" height="22" rx="3" fill="#f59e0b" stroke="#78350f" stroke-width="1.5"/>' +
      '<line x1="72" y1="74" x2="168" y2="74" stroke="#86efac" stroke-width="2" stroke-opacity="0.5"/>' +
      '</svg>',
    dehumidifier:
      '<svg viewBox="0 0 240 120" class="w-full h-full" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<rect x="80" y="18" width="80" height="84" rx="14" fill="#f1f5f9" stroke="#334155" stroke-width="2.5"/>' +
      '<circle cx="120" cy="48" r="14" fill="#0284c7" stroke="#0369a1" stroke-width="2"/>' +
      '<rect x="94" y="72" width="52" height="18" rx="4" fill="#cbd5e1"/>' +
      '</svg>',
    maintenance:
      '<svg viewBox="0 0 240 120" class="w-full h-full" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<rect x="98" y="36" width="44" height="64" rx="8" fill="#1e3a8a" stroke="#0f172a" stroke-width="2"/>' +
      '<polygon points="114,16 126,16 130,36 110,36" fill="#f59e0b" stroke="#78350f" stroke-width="1.5"/>' +
      '<rect x="106" y="54" width="28" height="24" rx="3" fill="#fbbf24"/>' +
      '</svg>',
    wipes:
      '<svg viewBox="0 0 240 120" class="w-full h-full" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<rect x="86" y="26" width="68" height="74" rx="10" fill="#059669" stroke="#064e3b" stroke-width="2"/>' +
      '<ellipse cx="120" cy="26" rx="34" ry="8" fill="#10b981" stroke="#064e3b" stroke-width="2"/>' +
      '<rect x="96" y="50" width="48" height="26" rx="4" fill="#ecfdf5"/>' +
      '</svg>',
    tool:
      '<svg viewBox="0 0 240 120" class="w-full h-full" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<rect x="44" y="48" width="84" height="24" rx="8" fill="#d97706" stroke="#78350f" stroke-width="2"/>' +
      '<rect x="128" y="55" width="68" height="10" rx="2" fill="#94a3b8" stroke="#334155" stroke-width="1.5"/>' +
      '</svg>',
    target:
      '<svg viewBox="0 0 240 120" class="w-full h-full" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<circle cx="120" cy="60" r="40" fill="#0f172a" stroke="#334155" stroke-width="2"/>' +
      '<circle cx="120" cy="60" r="28" fill="none" stroke="#94a3b8" stroke-width="1.5"/>' +
      '<circle cx="120" cy="60" r="16" fill="none" stroke="#94a3b8" stroke-width="1.5"/>' +
      '<circle cx="120" cy="60" r="6" fill="#eab308"/>' +
      '<circle cx="114" cy="54" r="3" fill="#a3e635"/>' +
      '<circle cx="125" cy="57" r="3" fill="#a3e635"/>' +
      '</svg>',
    timer:
      '<svg viewBox="0 0 240 120" class="w-full h-full" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<rect x="74" y="18" width="92" height="84" rx="14" fill="#1e293b" stroke="#0f172a" stroke-width="2.5"/>' +
      '<rect x="88" y="30" width="64" height="28" rx="4" fill="#d1fae5" stroke="#059669" stroke-width="1.5"/>' +
      '<circle cx="120" cy="78" r="12" fill="#f59e0b" stroke="#b45309" stroke-width="2"/>' +
      '</svg>',
    trauma:
      '<svg viewBox="0 0 240 120" class="w-full h-full" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<rect x="64" y="22" width="112" height="76" rx="14" fill="#be123c" stroke="#881337" stroke-width="2.5"/>' +
      '<rect x="112" y="38" width="16" height="44" rx="3" fill="#ffffff"/>' +
      '<rect x="98" y="52" width="44" height="16" rx="3" fill="#ffffff"/>' +
      '</svg>'
  };

  function createFallbackSvgNode(key) {
    const raw = FALLBACK_SVGS[key] || FALLBACK_SVGS.lockbox;
    const parser = new DOMParser();
    const doc = parser.parseFromString(raw, 'image/svg+xml');
    return document.importNode(doc.documentElement, true);
  }

  function badgeClasses(tone) {
    if (tone === 'emerald') return 'bg-emerald-100 text-emerald-900 border-emerald-200';
    if (tone === 'amber') return 'bg-amber-100 text-amber-900 border-amber-200';
    if (tone === 'rose') return 'bg-rose-100 text-rose-900 border-rose-200';
    return 'bg-blue-100 text-blue-900 border-blue-200';
  }

  function createIcon(name, cls) {
    const icon = document.createElement('i');
    icon.setAttribute('data-lucide', name);
    icon.className = cls;
    return icon;
  }

  function safeRenderIcons() {
    if (typeof window.lucide !== 'undefined' && window.lucide && typeof window.lucide.createIcons === 'function') {
      try {
        window.lucide.createIcons();
      } catch (e) {
        // Ignore icon rendering notices
      }
    }
  }

  function buildProductCard(product, config, compact) {
    const aff = resolveAffiliateLink(product, config);
    const officialUrl = safeExternalUrl(product.official_url);
    const primaryUrl = aff ? aff.url : officialUrl;
    const imgUrl = safeImageUrl(product.image_url);

    const card = document.createElement('article');
    card.className =
      'bg-white border-2 border-slate-200 rounded-2xl overflow-hidden flex flex-col justify-between hover:border-blue-900 hover:shadow-md transition-all print-card';

    // Media frame (clickable)
    const mediaFrame = primaryUrl ? document.createElement('a') : document.createElement('div');
    mediaFrame.className =
      'relative ' +
      (compact ? 'h-32 sm:h-36' : 'h-40 sm:h-44') +
      ' border-b border-slate-200 flex items-center justify-center p-4 overflow-hidden ' +
      (imgUrl ? 'bg-white' : 'bg-gradient-to-br from-slate-50 via-white to-slate-100') +
      (primaryUrl ? ' block group focus:outline-none' : '');

    if (primaryUrl) {
      mediaFrame.href = primaryUrl;
      mediaFrame.target = '_blank';
      mediaFrame.rel = aff ? 'sponsored noopener noreferrer' : 'noopener noreferrer';
      mediaFrame.setAttribute(
        'aria-label',
        (aff ? 'View ' + product.name + ' on Amazon' : 'View ' + product.name + ' on official manufacturer site')
      );
    }

    if (imgUrl) {
      const img = document.createElement('img');
      img.src = imgUrl;
      img.alt = product.image_alt || product.name;
      img.loading = 'lazy';
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';
      img.className =
        'max-h-full max-w-full object-contain transition-transform duration-200 group-hover:scale-105';
      img.addEventListener('error', function () {
        img.remove();
        mediaFrame.classList.remove('bg-white');
        mediaFrame.classList.add('bg-gradient-to-br', 'from-slate-50', 'via-white', 'to-slate-100');
        mediaFrame.appendChild(createFallbackSvgNode(product.illustration));
      });
      mediaFrame.appendChild(img);
    } else {
      mediaFrame.appendChild(createFallbackSvgNode(product.illustration));
    }

    const brandTag = document.createElement('span');
    brandTag.className =
      'absolute top-2.5 left-2.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-white/90 text-slate-700 border border-slate-200 shadow-sm';
    brandTag.textContent = product.brand;
    mediaFrame.appendChild(brandTag);

    const ratingBadge = document.createElement('span');
    ratingBadge.className =
      'absolute top-2.5 right-2.5 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border shadow-sm ' +
      badgeClasses(product.badge_tone);
    ratingBadge.textContent = product.rating_badge;
    mediaFrame.appendChild(ratingBadge);

    if (imgUrl && product.image_credit) {
      const credit = document.createElement('span');
      credit.className =
        'absolute bottom-1.5 right-2 text-[9px] font-semibold text-slate-500 bg-white/85 px-1.5 py-0.5 rounded';
      credit.textContent = product.image_credit;
      mediaFrame.appendChild(credit);
    }

    // Body
    const body = document.createElement('div');
    body.className = compact ? 'p-4 flex flex-col flex-1 justify-between' : 'p-5 flex flex-col flex-1 justify-between';

    const top = document.createElement('div');

    const title = document.createElement('h3');
    title.className = compact
      ? 'font-extrabold text-slate-900 text-sm leading-snug'
      : 'font-extrabold text-slate-900 text-base leading-snug';
    title.textContent = product.name;
    top.appendChild(title);

    const metaRow = document.createElement('div');
    metaRow.className = 'flex flex-wrap items-center gap-1.5 mt-1.5';

    if (product.price_tier) {
      const priceSpan = document.createElement('span');
      priceSpan.className = 'text-[11px] font-bold text-slate-500';
      priceSpan.textContent = product.price_tier;
      metaRow.appendChild(priceSpan);
    }

    if (product.fit_note) {
      const fitSpan = document.createElement('span');
      fitSpan.className =
        'text-[10px] font-bold px-2 py-0.5 rounded-md border ' +
        (product.direct_only
          ? 'bg-rose-50 text-rose-900 border-rose-200'
          : 'bg-slate-100 text-slate-700 border-slate-200');
      fitSpan.textContent = product.fit_note;
      metaRow.appendChild(fitSpan);
    }
    top.appendChild(metaRow);

    const summary = document.createElement('p');
    summary.className = compact
      ? 'text-xs text-slate-600 mt-2.5 leading-relaxed'
      : 'text-xs sm:text-sm text-slate-600 mt-3 leading-relaxed';
    summary.textContent = product.summary;
    top.appendChild(summary);

    // Actions footer
    const actions = document.createElement('div');
    actions.className = 'mt-4 pt-3.5 border-t border-slate-100 flex flex-wrap items-center gap-2 no-print';

    if (aff) {
      const affLink = document.createElement('a');
      affLink.href = aff.url;
      affLink.target = '_blank';
      affLink.rel = 'sponsored noopener noreferrer';
      affLink.className =
        'flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs transition-colors shadow-sm';
      const affText = document.createElement('span');
      affText.textContent = aff.label;
      affLink.appendChild(affText);
      affLink.appendChild(createIcon('shopping-bag', 'w-3.5 h-3.5 shrink-0'));
      actions.appendChild(affLink);

      if (officialUrl) {
        const specLink = document.createElement('a');
        specLink.href = officialUrl;
        specLink.target = '_blank';
        specLink.rel = 'noopener noreferrer';
        specLink.className =
          'inline-flex items-center justify-center gap-1 px-2.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors';
        const specText = document.createElement('span');
        specText.textContent = 'Specs';
        specLink.appendChild(specText);
        specLink.appendChild(createIcon('external-link', 'w-3 h-3 shrink-0'));
        actions.appendChild(specLink);
      }
    } else if (officialUrl) {
      const directLink = document.createElement('a');
      directLink.href = officialUrl;
      directLink.target = '_blank';
      directLink.rel = 'noopener noreferrer';
      directLink.className = product.direct_only
        ? 'w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs transition-colors shadow-sm'
        : 'w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-blue-900 text-white font-bold text-xs transition-colors';
      const directText = document.createElement('span');
      directText.textContent = product.official_label || 'Official Manufacturer Page';
      directLink.appendChild(directText);
      directLink.appendChild(createIcon(product.direct_only ? 'shield-check' : 'external-link', 'w-3.5 h-3.5 shrink-0'));
      actions.appendChild(directLink);

      if (product.direct_only && product.direct_note) {
        const note = document.createElement('p');
        note.className = 'w-full text-[10px] font-semibold text-emerald-800 text-center mt-0.5';
        note.textContent = product.direct_note;
        actions.appendChild(note);
      }
    }

    body.appendChild(top);
    body.appendChild(actions);
    card.appendChild(mediaFrame);
    card.appendChild(body);
    return card;
  }

  function buildDisclosureBanner(config, hasAffiliateLinks) {
    const banner = document.createElement('div');
    banner.className = hasAffiliateLinks
      ? 'mb-6 bg-amber-50/80 border border-amber-200 rounded-xl p-3.5 flex items-start gap-3 text-xs text-amber-950'
      : 'mb-6 bg-blue-50/80 border border-blue-200 rounded-xl p-3.5 flex items-start gap-3 text-xs text-blue-950';

    banner.appendChild(createIcon('info', hasAffiliateLinks ? 'w-4 h-4 text-amber-700 shrink-0 mt-0.5' : 'w-4 h-4 text-blue-900 shrink-0 mt-0.5'));

    const p = document.createElement('p');
    p.className = 'leading-relaxed';

    if (hasAffiliateLinks) {
      const strong = document.createElement('strong');
      strong.textContent = (config && config.amazon_disclosure) || 'As an Amazon Associate I earn from qualifying purchases.';
      p.appendChild(strong);
      p.appendChild(
        document.createTextNode(
          ' ' +
            ((config && config.nonprofit_disclosure) ||
              "Qualifying purchases help fund SikhRPA's free California 501(c)(3) firearm safety education programs at no extra cost to you.")
        )
      );
    } else {
      const strong = document.createElement('strong');
      strong.textContent = '100% Independent Nonprofit Recommendations:';
      p.appendChild(strong);
      p.appendChild(
        document.createTextNode(
          ' SikhRPA selects gear strictly on safety, reliability, and community feedback. Direct manufacturer links are provided for life-safety medical equipment to avoid counterfeit clones.'
        )
      );
    }

    banner.appendChild(p);
    return banner;
  }

  function mountFullCatalog(container, data) {
    const config = data.affiliate_config || {};
    const products = Array.isArray(data.products) ? data.products : [];
    const categories = Array.isArray(data.categories) ? data.categories : [{ id: 'all', label: 'All Gear' }];

    container.textContent = '';

    const hasAff = products.some(function (p) {
      return Boolean(resolveAffiliateLink(p, config));
    });
    container.appendChild(buildDisclosureBanner(config, hasAff));

    let activeCat = 'all';

    // Category filter bar
    const tabBar = document.createElement('div');
    tabBar.className = 'flex flex-wrap gap-2 mb-6 no-print';
    tabBar.setAttribute('role', 'tablist');
    tabBar.setAttribute('aria-label', 'Filter Range & Storage Gear by Category');

    const grid = document.createElement('div');
    grid.className = 'grid sm:grid-cols-2 lg:grid-cols-3 gap-5';
    grid.setAttribute('aria-live', 'polite');

    const buttons = [];

    function renderGrid() {
      grid.textContent = '';
      const filtered = activeCat === 'all' ? products : products.filter(function (p) {
        return p.category === activeCat;
      });
      filtered.forEach(function (prod) {
        grid.appendChild(buildProductCard(prod, config, false));
      });
      buttons.forEach(function (btn) {
        const isActive = btn.dataset.cat === activeCat;
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        btn.className =
          'px-3.5 py-2 rounded-xl border-2 text-xs font-bold transition-all touch-target ' +
          (isActive
            ? 'bg-blue-950 text-white border-blue-950 shadow-sm'
            : 'bg-white text-slate-700 border-slate-200 hover:border-blue-900 hover:text-blue-950');
      });
      safeRenderIcons();
    }

    categories.forEach(function (cat) {
      const count =
        cat.id === 'all'
          ? products.length
          : products.filter(function (p) {
              return p.category === cat.id;
            }).length;
      if (cat.id !== 'all' && count === 0) return;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.cat = cat.id;
      btn.setAttribute('role', 'tab');
      btn.textContent = cat.label + ' (' + count + ')';
      btn.addEventListener('click', function () {
        activeCat = cat.id;
        renderGrid();
      });
      buttons.push(btn);
      tabBar.appendChild(btn);
    });

    container.appendChild(tabBar);
    container.appendChild(grid);
    renderGrid();
  }

  function mountCompactShelf(container, data) {
    const config = data.affiliate_config || {};
    const products = Array.isArray(data.products) ? data.products : [];
    const byId = {};
    products.forEach(function (p) {
      byId[p.id] = p;
    });

    const ids = (container.dataset.gearIds || '')
      .split(',')
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean);

    const matched = ids
      .map(function (id) {
        return byId[id];
      })
      .filter(Boolean);

    if (!matched.length) return;

    container.textContent = '';

    const hasAff = matched.some(function (p) {
      return Boolean(resolveAffiliateLink(p, config));
    });

    if (container.dataset.counterfeitWarning === 'true') {
      const warn = document.createElement('div');
      warn.className =
        'mb-4 bg-rose-50 border-2 border-rose-300 rounded-xl p-3.5 flex items-start gap-3 text-xs text-rose-950';
      warn.appendChild(createIcon('alert-triangle', 'w-4 h-4 text-rose-700 shrink-0 mt-0.5'));
      const wp = document.createElement('p');
      wp.className = 'leading-relaxed';
      const wStrong = document.createElement('strong');
      wStrong.textContent = 'Counterfeit Tourniquet Safety Rule: ';
      wp.appendChild(wStrong);
      wp.appendChild(
        document.createTextNode(
          'SikhRPA NEVER uses third-party marketplace or Amazon affiliate links for tourniquets or chest seals—counterfeit clones routinely break under tension. All medical trauma supplies below link directly to North American Rescue (non-affiliate).'
        )
      );
      warn.appendChild(wp);
      container.appendChild(warn);
    }

    if (hasAff) {
      container.appendChild(buildDisclosureBanner(config, true));
    }

    const grid = document.createElement('div');
    grid.className =
      matched.length <= 2
        ? 'grid sm:grid-cols-2 gap-4'
        : 'grid sm:grid-cols-2 lg:grid-cols-4 gap-4';

    matched.forEach(function (prod) {
      grid.appendChild(buildProductCard(prod, config, true));
    });

    container.appendChild(grid);

    if (container.dataset.showMoreLink !== 'false') {
      const foot = document.createElement('div');
      foot.className = 'mt-5 pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs no-print';
      const note = document.createElement('span');
      note.className = 'text-slate-600 font-medium';
      note.textContent = 'Need California-compliant lockboxes, range bags, ammo cans, or Dastar-friendly ear/eye PPE?';
      foot.appendChild(note);

      const links = document.createElement('div');
      links.className = 'flex flex-wrap items-center gap-2';

      const storageLink = document.createElement('a');
      storageLink.href = 'safe-storage';
      storageLink.className =
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-950 font-bold border border-blue-200 transition-colors';
      storageLink.textContent = 'Safe Storage & Range Gear';
      storageLink.appendChild(createIcon('arrow-right', 'w-3.5 h-3.5'));
      links.appendChild(storageLink);

      const ppeLink = document.createElement('a');
      ppeLink.href = 'range-ppe';
      ppeLink.className =
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-950 font-bold border border-emerald-200 transition-colors';
      ppeLink.textContent = 'Ear & Eye PPE Guide';
      ppeLink.appendChild(createIcon('arrow-right', 'w-3.5 h-3.5'));
      links.appendChild(ppeLink);

      foot.appendChild(links);
      container.appendChild(foot);
    }

    safeRenderIcons();
  }

  function loadCatalog() {
    if (!catalogPromise) {
      catalogPromise = fetch(CATALOG_URL).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      });
    }
    return catalogPromise;
  }

  function initGearShelves() {
    const fullTargets = document.querySelectorAll('[data-gear-catalog="full"]');
    const shelfTargets = document.querySelectorAll('[data-gear-ids]');
    if (!fullTargets.length && !shelfTargets.length) return;

    loadCatalog()
      .then(function (data) {
        fullTargets.forEach(function (el) {
          mountFullCatalog(el, data);
        });
        shelfTargets.forEach(function (el) {
          mountCompactShelf(el, data);
        });
      })
      .catch(function (err) {
        console.error('SikhRPA gear catalog load error:', err);
        const allTargets = Array.prototype.slice.call(fullTargets).concat(Array.prototype.slice.call(shelfTargets));
        allTargets.forEach(function (el) {
          el.textContent = '';
          const msg = document.createElement('div');
          msg.className = 'p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-900 text-center';
          msg.textContent = 'Unable to load the range gear catalog right now. Please refresh the page.';
          el.appendChild(msg);
        });
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGearShelves);
  } else {
    initGearShelves();
  }
})();
