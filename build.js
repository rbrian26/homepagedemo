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

// ── PREORDER PAGE ──────────────────────────────────────────────────────────────
function buildPreorder(courses) {
  const groups = { workplace: [], highered: [], k12: [] };
  courses.filter(c => c.active !== 'false').forEach(c => {
    c.audience.split(',').map(a => a.trim()).forEach(aud => {
      if (groups[aud]) groups[aud].push({
        id: c.id, title: c.title, thumb: c.thumb, href: c.href,
        comingSoon: c.comingSoon === 'true', comingSoonDate: c.comingSoonDate || '', desc: c.desc,
      });
    });
  });
  const output = readTemplate('preorder.html')
    .replace('/* __COURSES_DATA__ */', `const COURSES = ${JSON.stringify(groups, null, 2)};`);
  write(path.join(__dirname, 'preorder.html'), output);
}

// ── MAIN ───────────────────────────────────────────────────────────────────────
console.log('\n🔨 Blue Seat Studios — Build\n');

const catalog    = readCSV(path.join(__dirname, 'data', 'catalog.csv'));
const details    = readCSV(path.join(__dirname, 'data', 'course-detail.csv'));
const demoPages  = readCSV(path.join(__dirname, 'data', 'demo-pages.csv'));
const demoVideos = readCSV(path.join(__dirname, 'data', 'demo-videos.csv'));

console.log('Building catalog...');
if (catalog.length) buildCatalog(catalog);

console.log('\nBuilding preorder page...');
if (catalog.length) buildPreorder(catalog);

console.log('\nBuilding course pages...');
details.forEach(d => buildCoursePage(d));

console.log('\nBuilding demo pages...');
if (demoPages.length) buildDemoPages(demoPages, demoVideos);

console.log('\n✅ Done.\n');
