import { CATEGORIES, category, identity, sortCards, normalizePairings, followLineage, snapshotDate, stackLineage, fitLineage } from './cube-model.mjs';

// This separate viewer loads a published snapshot only. It has no editing,
// storage, import, or network-write path and never loads the editor application.
const $ = selector => document.querySelector(selector);
const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);
let versions = [], images = {}, pairings = {};

function cardPicture(card, loading = 'lazy') {
  const image = images[card.printingId]?.faces[0];
  return `<span class="card-picture"><span class="image-fallback" aria-hidden="true">${escapeHTML(card.name)}<small>Image unavailable</small></span>${image ? `<img src="${escapeHTML(image.normal)}" alt="${escapeHTML(card.name)}" width="488" height="680" loading="${loading}" decoding="async" draggable="false">` : ''}</span>`;
}
function populateLineageCards(preferred) {
  const cards = sortCards(versions[Number($('#lineage-version').value)].cards);
  $('#lineage-card').innerHTML = CATEGORIES.map(group => `<optgroup label="${group.name}">${cards.filter(c => category(c) === group.id).map(c => `<option value="${identity(c)}">${escapeHTML(c.name)}</option>`).join('')}</optgroup>`).join('');
  const card = cards.find(c => c.name === preferred || identity(c) === preferred);
  if (card) $('#lineage-card').value = identity(card);
}
function selectedLineage() {
  return followLineage(versions, pairings, Number($('#lineage-version').value), $('#lineage-card').value);
}
function renderLineage() {
  const nodes = selectedLineage(), stacks = stackLineage(nodes);
  $('#lineage-canvas').innerHTML = `<div class="lineage-track">${stacks.map(node => {
    const first = snapshotDate(versions[node.index]), last = snapshotDate(versions[node.endIndex]);
    const range = first === last ? first : `${first} – ${last}`;
    const duration = `Lasted ${node.count} revision${node.count === 1 ? '' : 's'}`;
    return `<article class="lineage-node" aria-label="${escapeHTML(node.card?.name || 'Unlinked slot')}, ${escapeHTML(range)}, ${duration}">
      <div class="lineage-date">${escapeHTML(range)}</div>
      ${node.card ? `<div class="card-stack ${node.count > 1 ? 'repeated' : ''}"><button class="card-button" data-preview="${node.card.printingId}" aria-label="Enlarge ${escapeHTML(node.card.name)}">${cardPicture(node.card, 'eager')}</button></div><span class="lineage-note">${duration}</span>` : '<div class="lineage-gap">History unavailable</div>'}
    </article>`;
  }).join('')}</div>`;
  const count = stacks.filter(node => node.card).length;
  $('#lineage-summary').textContent = `${nodes.filter(node => node.card).length} snapshots · ${count} card${count === 1 ? '' : 's'}`;
  $('#atlas-caption').textContent = nodes.at(-1)?.state === 'gap' ? 'This published timeline has an unlinked transition.' : `Through ${snapshotDate(versions.at(-1))}`;
  requestAnimationFrame(sizeLineage);
}
function sizeLineage() {
  const canvas = $('#lineage-canvas'), track = canvas.firstElementChild;
  if (!track?.children.length) return;
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
  const height = Math.max(220, window.innerHeight - canvas.getBoundingClientRect().top - 144);
  const layout = fitLineage(track.children.length, canvas.clientWidth - 36, height - 32, rem * 5.5, 24);
  track.style.setProperty('--lineage-columns', layout.columns);
  track.style.setProperty('--lineage-card-width', `${layout.cardWidth}px`);
  [...track.children].forEach((node, i) => node.classList.toggle('row-end', (i + 1) % layout.columns === 0));
}
function previewCard(printing) {
  const entry = images[printing];
  if (!entry) return;
  $('#preview-faces').innerHTML = entry.faces.map(face => `<img src="${escapeHTML(face.normal)}" alt="${escapeHTML(face.name)}">`).join('');
  $('#preview-printing').textContent = entry.setName ? `First printing · ${entry.setName} · ${entry.releasedAt.slice(0, 4)}` : '';
  $('#card-preview').showModal();
}
function attachEvents(survivors) {
  $('#lineage-version').addEventListener('change', () => { const card = $('#lineage-card').value; populateLineageCards(card); renderLineage(); });
  $('#lineage-card').addEventListener('change', renderLineage);
  window.addEventListener('resize', sizeLineage);
  document.fonts?.ready.then(sizeLineage);
  document.addEventListener('click', event => { const button = event.target.closest('[data-preview]'); if (button) previewCard(button.dataset.preview); });
  $('#close-preview').addEventListener('click', () => $('#card-preview').close());
  $('#card-preview').addEventListener('click', event => { if (event.target === $('#card-preview')) $('#card-preview').close(); });
  $('.survivors').addEventListener('toggle', () => {
    if ($('.survivors').open && !$('#survivor-list').children.length) $('#survivor-list').innerHTML = survivors.map(card => `<div class="survivor-card"><button class="card-button" data-preview="${card.printingId}" aria-label="Enlarge ${escapeHTML(card.name)}">${cardPicture(card)}</button><span>${escapeHTML(card.name)}</span></div>`).join('');
  });
  document.addEventListener('error', event => { if (event.target instanceof HTMLImageElement) event.target.hidden = true; }, true);
}
function registerReadTool() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const lifecycle = new AbortController();
  window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
  try {
    Promise.resolve(context.registerTool({
      name: 'get_selected_cube_timeline', title: 'Read the selected card timeline',
      description: 'Read the currently displayed cube slot, its card changes, date ranges, and consecutive revision counts. Does not change the selection or any links.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute(input) {
        if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length) throw new Error('This read-only tool takes an empty object.');
        return { readOnly: true, timeline: stackLineage(selectedLineage()).map(node => ({ card: node.card?.name || null, from: snapshotDate(versions[node.index]), through: snapshotDate(versions[node.endIndex]), revisions: node.count })) };
      },
    }, { signal: lifecycle.signal })).catch(() => {});
  } catch { /* Reading the site does not depend on browser tool support. */ }
}
async function boot() {
  try {
    const [archive, imageData, defaults] = await Promise.all(['cube-data.json', 'card-images.json', 'default-pairings.json?v=final-reviewed-1'].map(async path => {
      const response = await fetch(path);
      if (!response.ok) throw new Error('Cube history could not be loaded.');
      return response.json();
    }));
    versions = archive.versions; images = imageData; pairings = normalizePairings(defaults.pairings, versions);
    $('#archive-range').textContent = `${snapshotDate(versions[0])} – ${snapshotDate(versions.at(-1))} · ${versions.length} snapshots · ${versions[0].cards.length} slots`;
    $('#lineage-version').innerHTML = versions.map((v, i) => `<option value="${i}">${escapeHTML(v.label)} · ${escapeHTML(snapshotDate(v))}</option>`).join('');
    $('#lineage-version').value = '0'; populateLineageCards('Elite Vanguard');
    const sets = versions.map(v => new Set(v.cards.map(identity)));
    const survivors = sortCards(versions[0].cards.filter(c => sets.every(set => set.has(identity(c)))));
    $('#survivor-summary').textContent = `${survivors.length} cards in every snapshot`;
    $('#lineage-version').disabled = false; $('#lineage-card').disabled = false;
    $('#lineage-canvas').hidden = false; $('.survivors').hidden = false;
    attachEvents(survivors); renderLineage(); registerReadTool();
    $('#app').setAttribute('aria-busy', 'false');
  } catch (error) {
    $('#load-error').hidden = false; $('#load-error').textContent = `${error.message} Refresh to try again.`;
    $('#archive-range').textContent = 'Cube history unavailable'; $('#app').setAttribute('aria-busy', 'false');
  }
}
boot();
