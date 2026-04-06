/**
 * Blue Seat Studios — Site Builder
 *
 * Reads:
 *   data/catalog.csv         → catalog.html, preorder.html
 *   data/course-detail.csv   → course-[id].html (status=live) or coming-soon-[id].html (status=coming-soon)
 *   data/demo-pages.csv      → demo-[id].html (hero content)
 *   data/demo-videos.csv     → demo-[id].html (video clips)
 *
 * Usage:  node build.js
 * Setup:  npm install papaparse  (one time)
 */

const fs   = require('fs');
const path = require('path');
const Papa = require('papaparse');

const DIST = path.join(__dirname, 'dist');

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  fs.readdirSync(src).forEach(file => {
    const s = path.join(src, file), d = path.join(dest, file);
    fs.statSync(s).isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  });
}

function readCSV(filePath) {
  if (!fs.existsSync(filePath)) { console.warn('  ⚠️  Missing:', filePath); return []; }
  return Papa.parse(fs.readFileSync(filePath, 'utf8'), { header: true, skipEmptyLines: true }).data;
}
function readTemplate(name) {
  return fs.readFileSync(path.join(__dirname, 'templates', name), 'utf8');
}
function write(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('  ✓', filePath);
}

// ── CATALOG ────────────────────────────────────────────────────────────────────
function buildCatalog(courses, orderData, featuredData) {
  const groups = { workplace: [], highered: [], k12: [] };

  courses.filter(c => c.active !== 'false').forEach(c => {
    const staffAudiences = (c.staffAudiences || '').split('|').map(a => a.trim()).filter(Boolean);
    const isComingSoon = c.comingSoon === 'TRUE';

    c.audience.split('|').map(a => a.trim()).forEach(aud => {
      if (!groups[aud]) return;
      groups[aud].push({
        id:                c.id,
        title:             c.title,
        thumb:             c.thumb ? '/assets/images/courses/' + c.thumb : '',
        thumbGif:          c.thumbGif ? '/assets/images/courses/' + c.thumbGif : '',
        // Always use comingSoonPageHref for coming-soon, href for available
        href:              isComingSoon ? (c.comingSoonPageHref || c.href) : c.href,
        status:            c.status,
        comingSoonDate:    c.comingSoonDate || '',
        desc:              c.desc,
        isStaff:           staffAudiences.includes(aud),
      });
    });
  });

const orderMap = {};
orderData.forEach(row => {
  orderMap[row.audience] = (row.order || '').split('|').map(id => id.trim());
});
Object.keys(groups).forEach(aud => {
  const ordered = orderMap[aud] || [];
  groups[aud].sort((a, b) => {
    const ai = ordered.indexOf(a.id);
    const bi = ordered.indexOf(b.id);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
});

  // Build featured course cards
  const catalogById = {};
  courses.forEach(c => { catalogById[c.id] = c; });
  const featuredSlots = (featuredData || [])
    .filter(f => f.courseId && f.courseId.trim() && f.vimeoId && f.vimeoId.trim())
    .sort((a, b) => parseInt(a.slot) - parseInt(b.slot))
    .slice(0, 3);
  const featuredHTML = featuredSlots.map(f => {
    const c = catalogById[f.courseId.trim()];
    if (!c) return '';
    const eyebrow = (f.eyebrow || '').trim() || '★ Featured';
    const desc    = (f.desc   || '').trim() || c.desc || '';
    const hash    = (f.vimeoHash || '').trim();
    const safeTitle = c.title.replace(/'/g, "\\'");
    const gifAttrs = c.thumbGif
      ? ` onmouseenter="this.src='${c.thumbGif}'" onmouseleave="this.src='${c.thumb}'"`
      : '';
    return [
      `<div class="featured-card" onclick="openTrailer('${f.vimeoId.trim()}','${hash}','${safeTitle}','${c.href}')">`,
      '  <div class="featured-card-thumb">',
      `    <img src="${c.thumb}" alt="${c.title}"${gifAttrs}>`,
      '    <div class="featured-card-play"></div>',
      '  </div>',
      '  <div class="featured-card-info">',
      '    <div class="featured-card-text">',
      '      <div class="featured-card-eyebrow">' + eyebrow + '</div>',
      '      <div class="featured-card-title">' + c.title + '</div>',
      '    </div>',
      '    <button class="featured-card-btn">▶ Watch Trailer</button>',
      '  </div>',
      '</div>',
    ].join('\n');
  }).join('\n');

  const output = readTemplate('catalog.html')
    .replace('/* __COURSES_DATA__ */', `const COURSES = ${JSON.stringify(groups, null, 2)};`)
    .replace('<!-- __FEATURED_COURSES__ -->', featuredHTML);
  write(path.join(DIST, 'catalog.html'), output);
}

// ── COURSE PAGES ───────────────────────────────────────────────────────────────
function buildCoursePage(detail, catalog, relatedMap) {
  const bullets = (detail.coversBullets || '').split('|').map(b => b.trim()).filter(Boolean)
    .map(b => `      <li>${b}</li>`).join('\n');

  let lessonsHTML = '';
  for (let i = 1; i <= 20; i++) {
    const title = detail[`L${i}_title`], desc = detail[`L${i}_desc`];
    if (!title || !title.trim()) break;
    lessonsHTML += `
      <div class="accordion-item">
        <button class="accordion-trigger" onclick="toggleAccordion(this)">
          <div class="accordion-num">${i}</div>
          <div class="accordion-header-text"><span class="accordion-title">${title}</span></div>
          <div class="accordion-chevron"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></div>
        </button>
        <div class="accordion-body"><div class="accordion-body-inner">${desc}</div></div>
      </div>`;
  }

  const videoCountLabel = detail.videoCount ? `${detail.videoCount} short videos` : '';

  // Related courses — looked up from related-courses.csv
  const catalogById = {};
  (catalog || []).forEach(c => { catalogById[c.id] = c; });
  const relatedRow = (relatedMap || {})[detail.id] || {};
  const relatedSlots = [
    { id: relatedRow.related1_id, eyebrow: relatedRow.related1_eyebrow },
    { id: relatedRow.related2_id, eyebrow: relatedRow.related2_eyebrow },
    { id: relatedRow.related3_id, eyebrow: relatedRow.related3_eyebrow },
  ].filter(r => r.id && r.id.trim());
  const relatedHTML = relatedSlots.map(r => {
    const c = catalogById[r.id.trim()];
    if (!c) return '';
    const eyebrow = (r.eyebrow || '').trim() || c.title;
    return [
      '      <a href="' + c.href + '" class="related-card"',
      c.thumbGif
        ? '         onmouseenter="this.querySelector(\'.related-bg img\').src=\'/assets/images/courses/' + c.thumbGif + '\'"'
          + ' onmouseleave="this.querySelector(\'.related-bg img\').src=\'/assets/images/courses/' + c.thumb + '\'">'
        : '>',
      '        <div class="related-bg">',
      '          <img src="' + c.thumb + '" alt="' + c.title + '" style="width:100%;height:100%;object-fit:cover;display:block;">',
      '        </div>',
      '        <div class="related-gradient"></div>',
      '        <div class="related-play"></div>',
      '        <div class="related-info">',
      '          <div class="related-topic">' + eyebrow + '</div>',
      '          <div class="related-title">' + c.title + '</div>',
      '        </div>',
      '      </a>',
    ].join('\n');
  }).join('\n');

  const output = readTemplate('course-page.html')
    .replace(/__PAGE_TITLE__/g,      detail.pageTitle)
    .replace(/__HERO_TITLE__/g,      detail.heroTitle)
    .replace(/__HERO_TAGLINE__/g,    detail.heroTagline)
    .replace(/__VIMEO_ID__/g,        detail.vimeoID)
    .replace(/__VIDEO_COUNT__/g,     videoCountLabel)
    .replace(/__FORMAT__/g,          detail.format)
    .replace(/__AUDIENCE_LABEL__/g,  detail.audienceLabel)
    .replace(/__LMS__/g,             detail.lms)
    .replace('<!-- __COVERS_BULLETS__ -->', bullets)
    .replace('<!-- __LESSONS__ -->',        lessonsHTML)
    .replace('<!-- __RELATED_COURSES__ -->', relatedHTML);
  write(path.join(DIST, `course-${detail.id}.html`), output);
}

// ── COMING SOON PAGES ──────────────────────────────────────────────────────────
function buildComingSoonPages(courses, catalog) {
  const template = readTemplate('coming-soon-course.html');
  const catalogMap = {};
  catalog.forEach(row => { catalogMap[row.id] = row; });

  courses.forEach(c => {
    const catalogEntry = catalogMap[c.id] || {};

    // Audience label — look up from catalog
    const audienceMap = { workplace: 'Workplace', highered: 'Higher Education', k12: 'K–12' };
    const audiences   = (catalogEntry.audience || '').split('|').map(a => a.trim());
    const audienceLabel = audiences.map(a => audienceMap[a] || a).join(' · ');

    // Covers bullets — conditional, hidden if empty
    const bulletItems = (c.coversBullets || '').split('|').map(b => b.trim()).filter(Boolean);
    const bulletsHTML = bulletItems.length
      ? bulletItems.map(b => `      <li>${b}</li>`).join('\n')
      : '';
    const coversSectionStyle = bulletItems.length ? '' : ' style="display:none"';

    // Lessons — conditional, hidden if empty
    let lessonsHTML = '';
    for (let i = 1; i <= 20; i++) {
      const title = c[`L${i}_title`], desc = c[`L${i}_desc`];
      if (!title || !title.trim()) break;
      lessonsHTML += `
      <div class="accordion-item">
        <button class="accordion-trigger" onclick="toggleAccordion(this)">
          <div class="accordion-num">${i}</div>
          <div class="accordion-header-text"><span class="accordion-title">${title}</span></div>
          <div class="accordion-chevron"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></div>
        </button>
        <div class="accordion-body"><div class="accordion-body-inner">${desc}</div></div>
      </div>`;
    }
    const lessonsSectionStyle = lessonsHTML ? '' : ' style="display:none"';

    // Sneak peek button — only if vimeo ID exists
    const sneakPeekBtn = c.vimeoID
      ? `<button class="btn-orange" onclick="openSneakPeek()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          Watch Sneak Peek
        </button>`
      : '';

    // Hero media — video iframe if vimeo ID exists, else course thumbnail
    const heroMedia = c.vimeoID
      ? `<iframe src="https://player.vimeo.com/video/${c.vimeoID}${c.vimeoHash ? '?h=' + c.vimeoHash : ''}" allow="fullscreen" allowfullscreen style="position:absolute;inset:0;width:100%;height:100%;border:0;"></iframe>`
      : `<img src="${catalogEntry.thumb ? '/assets/images/courses/' + catalogEntry.thumb : (c.thumb || '')}" alt="${c.title}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:14px;" />`;

    const output = template
      .replace(/__PAGE_TITLE__/g,         c.title)
      .replace(/__PAGE_TITLE__/g,         c.title)
      .replace(/__HERO_TITLE__/g,         c.title)
      .replace(/__HERO_TAGLINE__/g,       c.heroTagline || catalogEntry.desc || '')
      .replace(/__LAUNCH_DATE__/g,        catalogEntry.comingSoonDate || c.launchDate || 'Coming Soon')
      .replace(/__AUDIENCE_LABEL__/g,     audienceLabel)
      .replace(/__FORMAT__/g,             c.format     || 'eLearning')
      .replace(/__LMS__/g,                c.lms        || 'SCORM · Hosted')
      .replace(/__PREVIEW_VIMEO_ID__/g,   c.vimeoID   || '')
      .replace(/__PREVIEW_HASH__/g,       c.vimeoHash || '')
      .replace('<!-- __HERO_MEDIA__ -->',       heroMedia)
      .replace('<!-- __SNEAK_PEEK_BTN__ -->',   sneakPeekBtn)
      .replace(/<!-- __COVERS_BULLETS__ -->/g,  bulletsHTML)
      .replace('id="s-covers"',                 `id="s-covers"${coversSectionStyle}`)
      .replace('id="s-lessons"',                `id="s-lessons"${lessonsSectionStyle}`)
      .replace('<!-- __LESSONS__ -->',          lessonsHTML);

    write(path.join(DIST, `coming-soon-${c.id}.html`), output);
  });
}

// ── RELEASE CALENDAR (preorder.html) ───────────────────────────────────────────
function buildReleaseCalendar(courses) {
  const comingSoon = courses.filter(c => c.active !== 'false' && c.status === 'coming-soon');

  // Group by date
  const byDate = {};
  comingSoon.forEach(c => {
    const date = c.comingSoonDate || 'TBD';
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push(c);
  });

  // Sort dates chronologically
  const monthOrder = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const sortedDates = Object.keys(byDate).sort((a, b) => {
    const [aM, aY] = a.split(' ');
    const [bM, bY] = b.split(' ');
    if (aY !== bY) return parseInt(aY) - parseInt(bY);
    return monthOrder.indexOf(aM) - monthOrder.indexOf(bM);
  });

  const audienceMap = { workplace: 'Workplace', highered: 'Higher Ed', k12: 'K–12' };

  const cardsHTML = sortedDates.map(date => {
    const groupCards = byDate[date].map(c => {
      const audiences = c.audience.split('|').map(a => {
        const label = audienceMap[a.trim()] || a.trim();
        return `<span class="card-audience-tag">${label}</span>`;
      }).join('');

      return `
    <div class="course-card">
      <div class="card-thumb">
        <img src="${c.thumb}" alt="${c.title}" onerror="this.style.display='none'">
        <div class="coming-soon-ribbon">Coming Soon</div>
      </div>
      <div class="card-body">
        <div class="card-date">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
          ${date}
        </div>
        <div class="card-title">${c.title}</div>
        <div class="card-audience-tags">${audiences}</div>
        <div class="card-desc">${c.desc}</div>
        <div class="card-actions">
          <a href="${c.comingSoonPageHref || c.href}" class="card-btn">Learn More</a>
        </div>
      </div>
    </div>`;
    }).join('\n');

    return `
  <div class="section-label">${date}</div>
  <div class="course-cards">
    ${groupCards}
  </div>`;
  }).join('\n');

  const output = readTemplate('preorder.html')
    .replace('<!-- __RELEASE_CARDS__ -->', cardsHTML);
  write(path.join(DIST, 'preorder.html'), output);
}

// ── DEMO PAGES ─────────────────────────────────────────────────────────────────
function buildDemoPages(demoPages, demoVideos) {
  const videosByCourse = {};
  demoVideos.forEach(v => {
    if (!v.courseId) return;
    if (!videosByCourse[v.courseId]) videosByCourse[v.courseId] = [];
    videosByCourse[v.courseId].push(v);
  });

  const template = readTemplate('demo-watch.html');

  demoPages.forEach(page => {
    const clips = videosByCourse[page.courseId] || [];
    if (!clips.length) console.warn('  ⚠️  No demo videos for:', page.courseId);

    const bulletsHTML = [page.bullet1, page.bullet2, page.bullet3, page.bullet4]
      .filter(Boolean)
      .map(b => `      <div class="hero-bullet"><div class="hero-bullet-dot"></div>${b}</div>`)
      .join('\n');

    const cardsHTML = clips.map((v, i) => `
    <div class="video-card" onclick="openLightbox(${i})">
      <div class="thumb" id="thumb-${i}">
        <div class="module-tag">${v.tag}</div>
        <div class="thumb-overlay"></div>
        <div class="play-btn"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>
      </div>
      <div class="card-body">
        <h3>${v.clipTitle}</h3>
        <p>${v.clipDesc}</p>
      </div>
    </div>`).join('\n');

    const videosJSON = JSON.stringify(
      clips.map(v => ({ tag: v.tag, title: v.clipTitle, vimeoId: v.vimeoId, hash: v.hash || '' })),
      null, 4
    );

    const clipCount = clips.length;
    const output = template
      .replace(/__HERO_TITLE__/g,              page.heroTitle)
      .replace('__HERO_DESC__',                page.heroDesc)
      .replace('<!-- __HERO_BULLETS__ -->',     bulletsHTML)
      .replace('<!-- __VIDEO_CARDS__ -->',      cardsHTML)
      .replace('/* __VIDEOS_JSON__ */',         videosJSON)
      .replace(/\d+ clips? — click any to watch/, `${clipCount} clip${clipCount !== 1 ? 's' : ''} — click any to watch`);

    write(path.join(DIST, `demo-${page.courseId}.html`), output);
  });
}

// ── MAIN ───────────────────────────────────────────────────────────────────────
console.log('\n🔨 Blue Seat Studios — Build\n');

const catalog    = readCSV(path.join(__dirname, 'data', 'catalog.csv'));
const catalogOrder = readCSV(path.join(__dirname, 'data', 'catalog-order.csv'));
const details    = readCSV(path.join(__dirname, 'data', 'course-detail.csv'));
const demoPages  = readCSV(path.join(__dirname, 'data', 'demo-pages.csv'));
const demoVideos = readCSV(path.join(__dirname, 'data', 'demo-videos.csv'));
const relatedCSV  = readCSV(path.join(__dirname, 'data', 'related-courses.csv'));
const featuredCSV = readCSV(path.join(__dirname, 'data', 'featured-courses.csv'));
const relatedMap = {};
relatedCSV.forEach(r => { if (r.courseId) relatedMap[r.courseId] = r; });

console.log('Building catalog...');
if (catalog.length) buildCatalog(catalog, catalogOrder, featuredCSV);

console.log('\nBuilding release calendar...');
if (catalog.length) buildReleaseCalendar(catalog);

console.log('\nBuilding course pages...');
details.filter(d => d.status === 'live').forEach(d => buildCoursePage(d, catalog, relatedMap));

console.log('\nBuilding coming-soon course pages...');
const comingSoonDetails = details.filter(d => d.status === 'coming-soon');
if (comingSoonDetails.length) buildComingSoonPages(comingSoonDetails, catalog);

console.log('\nBuilding demo pages...');
if (demoPages.length) buildDemoPages(demoPages, demoVideos);

console.log('Copying assets...');
copyDir(path.join(__dirname, 'assets'), path.join(DIST, 'assets'));

console.log('\n✅ Done.\n');
