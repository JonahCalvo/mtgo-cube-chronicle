import { identity, sortCards, normalizePairings, followSlot, snapshotDate, stackLineage, indexHistory, lineageCardGroups, followEvolution, alignEvolution } from './cube-model.mjs?v=aligned-single-1';

// This separate viewer loads a published snapshot only. It has no editing,
// storage, import, or network-write path and never loads the editor application.
const $ = selector => document.querySelector(selector);
const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);
let versions = [], images = {}, pairings = {}, history, activePaths = [], alignedTimeline, selectedCard = '', activeOption = 0;
let selectorCards = [], typeahead = '', typeaheadTimer;
let fitPaths = true;

function cardPicture(card, loading = 'lazy') {
  const image = images[card.printingId]?.faces[0];
  return `<span class="card-picture"><span class="image-fallback" aria-hidden="true">${escapeHTML(card.name)}<small>Image unavailable</small></span>${image ? `<img src="${escapeHTML(image.normal)}" alt="${escapeHTML(card.name)}" width="488" height="680" loading="${loading}" decoding="async" draggable="false">` : ''}</span>`;
}
function cardHref(index, id) {
  const url = new URL(location.href);
  url.searchParams.set('version', versions[index].id);
  url.searchParams.set('card', id);
  url.hash = '';
  return `${url.pathname}${url.search}`;
}
function timelineCard(card, index) {
  return `<a class="card-button timeline-link" href="${escapeHTML(cardHref(index, identity(card)))}" data-card-link="${identity(card)}" data-version="${index}" aria-label="View history for ${escapeHTML(card.name)}">${cardPicture(card, 'eager')}</a><button class="card-zoom" type="button" data-preview="${card.printingId}" aria-label="Enlarge ${escapeHTML(card.name)}" title="Enlarge card"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5"/></svg></button>`;
}
function writeSelectionURL(replace = false) {
  const href = cardHref(Number($('#lineage-version').value), selectedCard);
  if (`${location.pathname}${location.search}${location.hash}` !== href) window.history[replace ? 'replaceState' : 'pushState'](null, '', href);
}
function readSelectionURL() {
  const params = new URLSearchParams(location.search);
  const index = versions.findIndex(version => version.id === params.get('version'));
  if (index >= 0 && versions[index].cards.some(card => identity(card) === params.get('card'))) return { index, id: params.get('card') };
  return { index: 0, id: identity(versions[0].cards.find(card => card.name === 'Elite Vanguard') || versions[0].cards[0]) };
}
function navigateToCard(index, id, writeURL = true) {
  if (!versions[index]?.cards.some(card => identity(card) === id)) return;
  $('#lineage-version').value = String(index);
  populateLineageCards(id);
  renderLineage();
  if (writeURL) writeSelectionURL();
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function populateLineageCards(preferred) {
  const groups = lineageCardGroups(versions[Number($('#lineage-version').value)].cards, history);
  selectorCards = groups.flatMap(group => group.cards);
  $('#card-options').innerHTML = groups.map(group => `<div role="group" aria-label="${group.name}" class="option-group ${group.muted ? 'muted-options' : ''}"><div class="option-heading" aria-hidden="true">${group.name}</div>${group.cards.map(c => `<div role="option" id="option-${identity(c)}" data-card="${identity(c)}" aria-selected="false">${escapeHTML(c.name)}</div>`).join('')}</div>`).join('');
  const card = selectorCards.find(c => c.name === preferred || identity(c) === preferred) || selectorCards[0];
  selectCard(identity(card), false);
}
function selectCard(id, render = true) {
  selectedCard = id;
  const card = selectorCards.find(c => identity(c) === id);
  $('#card-selection').textContent = card.name;
  $('#lineage-card').classList.toggle('never-replaced', history.neverReplaced.has(id));
  $('#card-options').querySelectorAll('[role="option"]').forEach(option => option.setAttribute('aria-selected', String(option.dataset.card === id)));
  closeCardOptions();
  if (render) { renderLineage(); writeSelectionURL(); }
}
function focusOption(index) {
  activeOption = Math.max(0, Math.min(selectorCards.length - 1, index));
  const id = identity(selectorCards[activeOption]);
  $('#card-options').querySelectorAll('[role="option"]').forEach(option => option.classList.toggle('active-option', option.dataset.card === id));
  $('#lineage-card').setAttribute('aria-activedescendant', `option-${id}`);
  document.getElementById(`option-${id}`).scrollIntoView({ block: 'nearest' });
}
function openCardOptions() {
  $('#card-options').hidden = false;
  $('#lineage-card').setAttribute('aria-expanded', 'true');
  focusOption(selectorCards.findIndex(c => identity(c) === selectedCard));
}
function closeCardOptions() {
  $('#card-options').hidden = true;
  $('#lineage-card').setAttribute('aria-expanded', 'false');
  $('#lineage-card').removeAttribute('aria-activedescendant');
  typeahead = ''; clearTimeout(typeaheadTimer);
}
function selectedLineage() {
  return followSlot(versions, pairings, Number($('#lineage-version').value), selectedCard);
}
function dateRange(node) {
  const first = snapshotDate(versions[node.index]), last = node.endIndex === versions.length - 1 ? 'present' : snapshotDate(versions[node.endIndex]);
  return first === last ? first : `${first} – ${last}`;
}
function durationLabel(count, endIndex) {
  return `${endIndex === versions.length - 1 ? 'Present ·' : 'Lasted'} ${count} revision${count === 1 ? '' : 's'}`;
}
function pathHeading(path) {
  const entry = path.inclusion;
  if (!entry) return 'Selected slot · full history';
  return `${entry.isReintroduction ? 'Reintroduced' : 'First inclusion'} ${snapshotDate(versions[entry.index])}${entry.replacedCard ? `, replacing ${entry.replacedCard.name}` : ''}`;
}
function renderAlignedTimeline() {
  const axis = `<div class="timeline-axis" aria-label="Shared timeline dates">${alignedTimeline.columns.map(column => `<div class="timeline-date" data-index="${column.index}" data-end-index="${column.endIndex}">${escapeHTML(dateRange(column))}</div>`).join('')}</div>`;
  const rows = alignedTimeline.rows.map(path => `<section class="evolution-path" id="path-${path.id}" aria-label="${path.id ? 'Other inclusion' : 'Selected slot'} path">${activePaths.length > 1 ? `<h2 class="path-heading">${escapeHTML(pathHeading(path))}</h2>` : ''}<div class="aligned-track">${path.cells.map((cell, column) => {
    if (!cell) return '<div class="timeline-empty" aria-hidden="true"></div>';
    if (!cell.card) return '<div class="lineage-gap">History unavailable</div>';
    const next = path.cells[column + 1];
    const same = next?.card && !cell.ghost && !next.ghost && identity(cell.card) === identity(next.card);
    const duration = durationLabel(cell.runCount, cell.runEndIndex);
    const note = cell.ghost ? 'Replaced' : cell.continued ? (cell.endIndex === versions.length - 1 ? 'Present' : 'Continued') : duration;
    const description = cell.ghost ? `${cell.card.name}, replaced in ${snapshotDate(versions[path.inclusion.index])}` : `${cell.card.name}, ${dateRange(cell)}. ${cell.continued ? 'Same card continuing. ' : ''}${duration} in the full run, ${dateRange({ index: cell.runIndex, endIndex: cell.runEndIndex })}.`;
    return `<article class="timeline-cell ${cell.ghost ? 'predecessor' : ''} ${cell.continued ? 'continuation' : ''}" data-index="${cell.index}" data-end-index="${cell.endIndex}" data-card-id="${identity(cell.card)}" aria-label="${escapeHTML(description)}" title="${escapeHTML(description)}"><div class="card-stack ${!cell.ghost && cell.runCount > 1 ? 'repeated' : ''}">${timelineCard(cell.card, cell.index)}</div><span class="lineage-note">${note}</span>${next?.card ? `<span class="timeline-connector ${same ? 'unchanged' : ''}" aria-label="${same ? 'Unchanged' : cell.ghost ? 'Reintroduced here' : 'Replaced by'}">${same ? '—' : '→'}</span>` : ''}</article>`;
  }).join('')}</div></section>`).join('');
  return `<div class="evolution-paths">${axis}${rows}</div>`;
}
function renderLineage() {
  activePaths = followEvolution(versions, pairings, Number($('#lineage-version').value), selectedCard, history);
  const branching = activePaths.length > 1;
  alignedTimeline = alignEvolution(activePaths);
  $('#lineage-canvas').classList.add('aligned');
  $('#fit-paths').hidden = alignedTimeline.columns.length < 2;
  $('#fit-paths').textContent = branching ? 'Fit all paths' : 'Fit timeline';
  $('#lineage-canvas').innerHTML = renderAlignedTimeline();
  $('#lineage-canvas').scrollLeft = 0;
  const count = activePaths.reduce((n, path) => n + stackLineage(path.nodes).filter(node => node.card).length, 0);
  const snapshots = activePaths[0]?.nodes.filter(node => node.card).length || 0;
  $('#lineage-summary').textContent = `${snapshots} snapshot${snapshots === 1 ? '' : 's'} · ${branching ? `${activePaths.length} paths · ` : ''}${count} card${count === 1 ? '' : 's'}`;
  $('#atlas-caption').textContent = activePaths.some(path => path.nodes.at(-1)?.state === 'gap') ? 'One published timeline has an unlinked transition.' : `Click any card to follow its slot. Latest snapshot: ${snapshotDate(versions.at(-1))}.`;
  document.title = `${selectorCards.find(card => identity(card) === selectedCard).name} · Cube Chronicle`;
  requestAnimationFrame(sizeLineage);
}
function sizeLineage() {
  const canvas = $('#lineage-canvas'), board = canvas.firstElementChild;
  if (!board?.children.length) return;
  canvas.classList.remove('fit-overview');
  canvas.style.height = ''; board.style.width = ''; board.style.transform = ''; board.style.left = '';
  const height = Math.max(220, window.innerHeight - (canvas.getBoundingClientRect().top + window.scrollY) - 144);
  const columns = alignedTimeline.columns.length, availableWidth = canvas.clientWidth - 36;
  const desktop = window.innerWidth > 755;
  const width = fitPaths && desktop ? Math.max(64, Math.min(200, Math.floor((availableWidth - 24 * (columns - 1)) / columns))) : 150;
  board.style.setProperty('--timeline-columns', columns);
  board.style.setProperty('--timeline-card-width', `${width}px`);
  const boardWidth = columns * width + 24 * (columns - 1);
  board.style.width = `${boardWidth}px`;
  const boardHeight = board.getBoundingClientRect().height;
  const scale = fitPaths && desktop ? Math.min(1, availableWidth / boardWidth, (height - 32) / boardHeight) : 1;
  if (scale < 1) {
    canvas.classList.add('fit-overview');
    canvas.style.height = `${Math.ceil(boardHeight * scale) + 34}px`;
    board.style.left = '18px';
    board.style.transform = `scale(${scale})`;
  }
  if (fitPaths && desktop) canvas.scrollLeft = 0;
}
function previewCard(printing) {
  const entry = images[printing];
  if (!entry) return;
  $('#preview-faces').innerHTML = entry.faces.map(face => `<img src="${escapeHTML(face.normal)}" alt="${escapeHTML(face.name)}">`).join('');
  $('#preview-printing').textContent = entry.setName ? `First printing · ${entry.setName} · ${entry.releasedAt.slice(0, 4)}` : '';
  $('#card-preview').showModal();
}
function attachEvents(survivors) {
  $('#lineage-version').addEventListener('change', () => { populateLineageCards(selectedCard); renderLineage(); writeSelectionURL(); });
  window.addEventListener('popstate', () => { const selection = readSelectionURL(); navigateToCard(selection.index, selection.id, false); });
  $('#fit-paths').addEventListener('click', () => { fitPaths = !fitPaths; $('#fit-paths').setAttribute('aria-pressed', String(fitPaths)); sizeLineage(); });
  $('#lineage-card').addEventListener('click', () => $('#card-options').hidden ? openCardOptions() : closeCardOptions());
  $('#card-options').addEventListener('click', event => { const option = event.target.closest('[data-card]'); if (option) { selectCard(option.dataset.card); $('#lineage-card').focus(); } });
  $('#lineage-card').addEventListener('keydown', event => {
    const open = !$('#card-options').hidden;
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', 'Escape', 'PageDown', 'PageUp'].includes(event.key) || (event.key === ' ' && !typeahead)) {
      event.preventDefault();
      if (event.key === 'Escape') { closeCardOptions(); return; }
      if (!open) { openCardOptions(); if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key)) return; }
      if (event.key === 'Enter' || event.key === ' ') selectCard(identity(selectorCards[activeOption]));
      else focusOption(event.key === 'Home' ? 0 : event.key === 'End' ? selectorCards.length - 1 : activeOption + ({ ArrowDown: 1, ArrowUp: -1, PageDown: 10, PageUp: -10 }[event.key] || 0));
    } else if (event.key === 'Tab') closeCardOptions();
    else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault(); if (!open) openCardOptions();
      clearTimeout(typeaheadTimer); typeahead += event.key.toLowerCase();
      const match = selectorCards.findIndex(c => c.name.toLowerCase().startsWith(typeahead));
      if (match >= 0) focusOption(match);
      typeaheadTimer = setTimeout(() => { typeahead = ''; }, 700);
    }
  });
  document.addEventListener('click', event => { if (!event.target.closest('.card-selector')) closeCardOptions(); });
  window.addEventListener('resize', sizeLineage);
  document.fonts?.ready.then(sizeLineage);
  document.addEventListener('click', event => {
    const link = event.target.closest('[data-card-link]');
    if (link && event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      navigateToCard(Number(link.dataset.version), link.dataset.cardLink);
      $('#lineage-card').focus({ preventScroll: true });
      return;
    }
    const button = event.target.closest('[data-preview]'); if (button) previewCard(button.dataset.preview);
  });
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
      description: 'Read the selected occurrence’s full slot history and the card’s other inclusions, including earlier ones, with replaced cards, shared timeline ranges, and continuous run counts. Does not change the selection or any links.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute(input) {
        if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length) throw new Error('This read-only tool takes an empty object.');
        const through = index => index === versions.length - 1 ? 'present' : snapshotDate(versions[index]);
        const describe = nodes => stackLineage(nodes).map(node => ({ card: node.card?.name || null, from: snapshotDate(versions[node.index]), through: through(node.endIndex), revisions: node.count }));
        return { readOnly: true, branchScope: 'selected-card-only', selectedVersion: versions[Number($('#lineage-version').value)].id, selectedCard, latestSnapshot: snapshotDate(versions.at(-1)), timeline: describe(selectedLineage()), columns: alignedTimeline.columns.map(column => ({ from: snapshotDate(versions[column.index]), through: through(column.endIndex) })), paths: activePaths.map(path => ({ id: path.id + 1, inclusion: path.inclusion ? { card: path.inclusion.card.name, isReintroduction: path.inclusion.isReintroduction, replacing: path.inclusion.replacedCard?.name || null, date: snapshotDate(versions[path.inclusion.index]) } : null, timeline: describe(path.nodes) })) };
      },
    }, { signal: lifecycle.signal })).catch(() => {});
  } catch { /* Reading the site does not depend on browser tool support. */ }
}
async function boot() {
  try {
    const [archive, imageData, defaults] = await Promise.all(['cube-data.json', 'card-images.json', 'default-pairings.json?v=curated-roles-1'].map(async path => {
      const response = await fetch(path);
      if (!response.ok) throw new Error('Cube history could not be loaded.');
      return response.json();
    }));
    versions = archive.versions; images = imageData; pairings = normalizePairings(defaults.pairings, versions); history = indexHistory(versions, pairings);
    $('#archive-range').textContent = `${snapshotDate(versions[0])} – ${snapshotDate(versions.at(-1))} · ${versions.length} snapshots · ${versions[0].cards.length} slots`;
    $('#lineage-version').innerHTML = versions.map((v, i) => `<option value="${i}">${escapeHTML(v.label)} · ${escapeHTML(snapshotDate(v))}</option>`).join('');
    const selection = readSelectionURL();
    $('#lineage-version').value = String(selection.index); populateLineageCards(selection.id);
    const sets = versions.map(v => new Set(v.cards.map(identity)));
    const survivors = sortCards(versions[0].cards.filter(c => sets.every(set => set.has(identity(c)))));
    $('#survivor-summary').textContent = `${survivors.length} cards in every snapshot`;
    $('#lineage-version').disabled = false; $('#lineage-card').disabled = false;
    $('#lineage-canvas').hidden = false; $('.survivors').hidden = false;
    attachEvents(survivors); renderLineage(); writeSelectionURL(true); registerReadTool();
    $('#app').setAttribute('aria-busy', 'false');
  } catch (error) {
    $('#load-error').hidden = false; $('#load-error').textContent = `${error.message} Refresh to try again.`;
    $('#archive-range').textContent = 'Cube history unavailable'; $('#app').setAttribute('aria-busy', 'false');
  }
}
boot();
