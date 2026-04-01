/**
 * Blue Seat Studios — Site Builder
 *
 * Reads:
 *   data/catalog.csv         → catalog.html
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
    c.audience.split(',').map(a => a.trim()).forEach(aud => {
      if (groups[aud]) groups[aud].push({
        id: c.id, title: c.title, thumb: c.thumb, href: c.href,
        comingSoon: c.comingSoon === 'true', comingSoonDate: c.comingSoonDate || '', desc: c.desc,
      });
    });
  });
  const output = readTemplate('catalog.html')
    .replace('/* __COURSES_DATA__ */', `const COURSES = ${JSON.stringify(groups, null, 2)};`);
  write(path.join(__dirname, 'catalog.html'), output);
}

// ── COURSE PAGES ───────────────────────────────────────────────────────────────
function buildCoursePage(detail) {
  const bullets = detail.coversBullets.split('|').map(b => b.trim()).filter(Boolean)
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
  write(path.join(__dirname, `course-${detail.id}.html`), output);
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

    write(path.join(__dirname, `demo-${page.courseId}.html`), output);
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

console.log('\nBuilding course pages...');
details.forEach(d => buildCoursePage(d));

console.log('\nBuilding demo pages...');
if (demoPages.length) buildDemoPages(demoPages, demoVideos);

console.log('\n✅ Done.\n');

// ── PREORDER PAGE ──────────────────────────────────────────────────────────────
function buildPreorder(courses) {
  const groups = {};
  const groupOrder = [];
  courses.forEach(c => {
    if (!groups[c.launchDate]) { groups[c.launchDate] = []; groupOrder.push(c.launchDate); }
    groups[c.launchDate].push(c);
  });

  const roadmapHTML = groupOrder.map(date => {
    const cards = groups[date].map(c => {
      const audiences = c.audience.split(',').map(a => a.trim());
      const audienceTags = audiences.map(a => {
        const label = { workplace: 'Workplace', highered: 'Higher Ed', k12: 'K–12' }[a] || a;
        return `<span class="audience-tag">${label}</span>`;
      }).join('');
      return `
    <a class="course-card" href="coming-soon-${c.id}.html" data-audiences="${audiences.join(',')}">
      <div class="card-thumb">
        <img src="${c.thumb}" alt="${c.title}" onerror="this.style.display='none'">
        <div class="card-thumb-fallback">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
        </div>
        <div class="coming-soon-ribbon">Coming Soon</div>
      </div>
      <div class="card-body">
        <div class="card-audience-tags">${audienceTags}</div>
        <div class="card-title">${c.title}</div>
        <div class="card-desc">${c.desc}</div>
        <div class="card-actions"><span class="btn-card-primary">Learn More →</span></div>
      </div>
    </a>`;
    }).join('\n');
    return `
  <div class="launch-group">
    <div class="launch-group-header">
      <div class="launch-month-badge">${date}</div>
      <div class="launch-group-line"></div>
    </div>
    <div class="course-grid">${cards}</div>
  </div>`;
  }).join('\n');

  const coursesData = courses.map(c => ({
    id: c.id, title: c.title, audiences: c.audience.split(',').map(a => a.trim()), launchDate: c.launchDate
  }));

  const output = readTemplate('preorder.html')
    .replace('/* __COURSES_DATA__ */', `const COURSES_DATA = ${JSON.stringify(coursesData, null, 2)};`)
    .replace('<!-- __ROADMAP_GROUPS__ -->', roadmapHTML);

  write(path.join(__dirname, 'preorder.html'), output);
}

// ── COMING SOON COURSE PAGES ───────────────────────────────────────────────────
function buildComingSoonCourse(detail) {
  const bullets = detail.coversBullets.split('|').map(b => b.trim()).filter(Boolean)
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

  const hasSneak = detail.previewVimeoId && detail.previewVimeoId.trim();
  const sneakPeekBtn = hasSneak
    ? `<button class="btn-ghost" onclick="openSneakPeek()">
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
         Sneak Peek
       </button>`
    : '';
  const heroVideo = hasSneak
    ? `<div class="hero-preview-card"><iframe src="https://player.vimeo.com/video/${detail.previewVimeoId}?color=f97c53&title=0&byline=0&portrait=0${detail.previewHash ? '&h=' + detail.previewHash : ''}" frameborder="0" allow="fullscreen; picture-in-picture" allowfullscreen></iframe></div>`
    : `<div class="hero-preview-card"><div class="hero-preview-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg><p>Preview clip coming soon</p></div></div>`;

  const output = readTemplate('coming-soon-course.html')
    .replace(/__PAGE_TITLE__/g,      detail.pageTitle)
    .replace(/__HERO_TITLE__/g,      detail.heroTitle)
    .replace(/__HERO_TAGLINE__/g,    detail.heroTagline)
    .replace(/__AUDIENCE_LABEL__/g,  detail.audienceLabel)
    .replace(/__FORMAT__/g,          detail.format)
    .replace(/__LMS__/g,             detail.lms)
    .replace(/__LAUNCH_DATE__/g,     detail.launchDate)
    .replace('__PREVIEW_VIMEO_ID__', detail.previewVimeoId || '')
    .replace('__PREVIEW_HASH__',     detail.previewHash || '')
    .replace('<!-- __SNEAK_PEEK_BTN__ -->', sneakPeekBtn)
    .replace('<!-- __HERO_VIDEO__ -->',     heroVideo)
    .replace(/<!-- __COVERS_BULLETS__ -->/g, bullets)
    .replace('<!-- __LESSONS__ -->',        lessonsHTML);

  write(path.join(__dirname, `coming-soon-${detail.id}.html`), output);
}

// ── RUN NEW BUILDERS ──────────────────────────────────────────────────────────
const preorder          = readCSV(path.join(__dirname, 'data', 'preorder.csv'));
const comingSoonCourses = readCSV(path.join(__dirname, 'data', 'coming-soon-course.csv'));

console.log('\nBuilding preorder page...');
if (preorder.length) buildPreorder(preorder);

console.log('\nBuilding coming-soon course pages...');
comingSoonCourses.forEach(d => buildComingSoonCourse(d));

console.log('\n✅ Extended build done.\n');
