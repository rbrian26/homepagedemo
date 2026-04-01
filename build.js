/**
 * Blue Seat Studios — Site Builder
 *
 * Reads:
 *   data/catalog.csv         → catalog.html, coming-soon-[id].html, preorder.html
 *   data/course-detail.csv   → course-[id].html
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
function buildCatalog(courses) {
  const groups = { workplace: [], highered: [], k12: [] };

  courses.filter(c => c.active !== 'false').forEach(c => {
    const staffAudiences = (c.staffAudiences || '').split('|').map(a => a.trim()).filter(Boolean);
    const isComingSoon   = c.status === 'coming-soon';

    c.audience.split(',').map(a => a.trim()).forEach(aud => {
      if (!groups[aud]) return;
      groups[aud].push({
        id:                c.id,
        title:             c.title,
        thumb:             c.thumb,
        // Always use comingSoonPageHref for coming-soon, href for available
        href:              isComingSoon ? (c.comingSoonPageHref || c.href) : c.href,
        status:            c.status,
        comingSoonDate:    c.comingSoonDate || '',
        desc:              c.desc,
        isStaff:           staffAudiences.includes(aud),
      });
    });
  });

  const output = readTemplate('catalog.html')
    .replace('/* __COURSES_DATA__ */', `const COURSES = ${JSON.stringify(groups, null, 2)};`);
  write(path.join(DIST, 'catalog.html'), output);
}

// ── COURSE PAGES ───────────────────────────────────────────────────────────────
function buildCoursePage(detail) {
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

  const output = readTemplate('course-page.html')
    .replace(/__PAGE_TITLE__/g,     detail.pageTitle)
    .replace(/__HERO_TITLE__/g,     detail.heroTitle)
    .replace(/__HERO_TAGLINE__/g,   detail.heroTagline)
    .replace(/__VIMEO_ID__/g,       detail.vimeoID)
    .replace(/__DURATION__/g,       detail.duration)
    .replace(/__FORMAT__/g,         detail.format)
    .replace(/__AUDIENCE_LABEL__/g, detail.audienceLabel)
    .replace(/__LMS__/g,            detail.lms)
    .replace(/__COMPLIANCE__/g,     detail.compliance)
    .replace('<!-- __COVERS_BULLETS__ -->', bullets)
    .replace('<!-- __LESSONS__ -->',        lessonsHTML);
  write(path.join(DIST, `course-${detail.id}.html`), output);
}

// ── COMING SOON PAGES ──────────────────────────────────────────────────────────
function buildComingSoonPages(courses) {
  const template = readTemplate('coming-soon-course.html');

  courses.filter(c => c.active !== 'false' && c.status === 'coming-soon').forEach(c => {

    // Audience label — pick first audience for display
    const audienceMap = { workplace: 'Workplace', highered: 'Higher Education', k12: 'K–12' };
    const audiences   = c.audience.split(',').map(a => a.trim());
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
    const sneakPeekBtn = c.sneakPeekVimeoId
      ? `<button class="btn-orange" onclick="openSneakPeek()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          Watch Sneak Peek
        </button>`
      : '';

    // Hero media — video iframe if vimeo ID exists, else course thumbnail
    const heroMedia = c.sneakPeekVimeoId
      ? `<iframe src="https://player.vimeo.com/video/${c.sneakPeekVimeoId}${c.sneakPeekHash ? '?h=' + c.sneakPeekHash : ''}" allow="fullscreen" allowfullscreen style="position:absolute;inset:0;width:100%;height:100%;border:0;"></iframe>`
      : `<img src="${c.thumb}" alt="${c.title}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:14px;" />`;

    const output = template
      .replace(/__PAGE_TITLE__/g,         c.title)
      .replace(/__PAGE_TITLE__/g,         c.title)
      .replace(/__HERO_TITLE__/g,         c.title)
      .replace(/__HERO_TAGLINE__/g,       c.desc)
      .replace(/__LAUNCH_DATE__/g,        c.comingSoonDate || 'Coming Soon')
      .replace(/__AUDIENCE_LABEL__/g,     audienceLabel)
      .replace(/__FORMAT__/g,             c.format     || 'eLearning')
      .replace(/__LMS__/g,                c.lms        || 'SCORM · Hosted')
      .replace(/__PREVIEW_VIMEO_ID__/g,   c.sneakPeekVimeoId || '')
      .replace(/__PREVIEW_HASH__/g,       c.sneakPeekHash    || '')
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
      const audiences = c.audience.split(',').map(a => {
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
const details    = readCSV(path.join(__dirname, 'data', 'course-detail.csv'));
const demoPages  = readCSV(path.join(__dirname, 'data', 'demo-pages.csv'));
const demoVideos = readCSV(path.join(__dirname, 'data', 'demo-videos.csv'));

console.log('Building catalog...');
if (catalog.length) buildCatalog(catalog);

console.log('\nBuilding coming-soon course pages...');
if (catalog.length) buildComingSoonPages(catalog);

console.log('\nBuilding release calendar...');
if (catalog.length) buildReleaseCalendar(catalog);

console.log('\nBuilding course pages...');
details.forEach(d => buildCoursePage(d));

console.log('\nBuilding demo pages...');
if (demoPages.length) buildDemoPages(demoPages, demoVideos);

console.log('\n✅ Done.\n');
