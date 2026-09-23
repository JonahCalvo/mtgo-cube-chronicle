import { identity, sortCards, normalizePairings, followLineage, snapshotDate, stackLineage, fitLineage, indexHistory, lineageCardGroups, followEvolution } from './cube-model.mjs?v=branches-1';

// This separate viewer loads a published snapshot only. It has no editing,
// storage, import, or network-write path and never loads the editor application.
const $ = selector => document.querySelector(selector);
const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);
let versions = [], images = {}, pairings = {}, history, activePaths = [], selectedCard = '', activeOption = 0;
let selectorCards = [], typeahead = '', typeaheadTimer;
let fitPaths = true;

function cardPicture(card, loading = 'lazy') {
  const image = images[card.printingId]?.faces[0];
  return `<span class="card-picture"><span class="image-fallback" aria-hidden="true">${escapeHTML(card.name)}<small>Image unavailable</small></span>${image ? `<img src="${escapeHTML(image.normal)}" alt="${escapeHTML(card.name)}" width="488" height="680" loading="${loading}" decoding="async" draggable="false">` : ''}</span>`;
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
  if (render) renderLineage();
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
  return followLineage(versions, pairings, Number($('#lineage-version').value), selectedCard);
}
function renderTrack(path) {
  return `<div class="lineage-track">${stackLineage(path.nodes).map(node => {
    const first = snapshotDate(versions[node.index]), last = snapshotDate(versions[node.endIndex]);
    const range = first === last ? first : `${first} – ${last}`;
    const duration = `Lasted ${node.count} revision${node.count === 1 ? '' : 's'}`;
    const children = activePaths.filter(child => child.parentId === path.id && child.reintroduction.previousIndex === node.endIndex && child.reintroduction.id === identity(node.card || {}));
    return `<article class="lineage-node" aria-label="${escapeHTML(node.card?.name || 'Unlinked slot')}, ${escapeHTML(range)}, ${duration}">
      <div class="lineage-date">${escapeHTML(range)}</div>
      ${node.card ? `<div class="card-stack ${node.count > 1 ? 'repeated' : ''}"><button class="card-button" data-preview="${node.card.printingId}" aria-label="Enlarge ${escapeHTML(node.card.name)}">${cardPicture(node.card, 'eager')}</button>${children.map(child => `<button class="branch-jump" data-path="${child.id}" aria-label="Follow ${escapeHTML(node.card.name)} reintroduced in ${escapeHTML(snapshotDate(versions[child.reintroduction.index]))}, path ${child.id + 1}">↳ ${child.id + 1}</button>`).join('')}</div><span class="lineage-note">${duration}</span>` : '<div class="lineage-gap">History unavailable</div>'}
    </article>`;
  }).join('')}</div>`;
}
function renderLineage() {
  activePaths = followEvolution(versions, pairings, Number($('#lineage-version').value), selectedCard, history);
  const branching = activePaths.length > 1;
  $('#lineage-canvas').classList.toggle('has-branches', branching);
  $('#fit-paths').hidden = !branching;
  $('#lineage-canvas').innerHTML = `<div class="evolution-paths">${activePaths.map(path => `<section class="evolution-path" id="path-${path.id}" tabindex="-1" aria-label="Path ${path.id + 1}${path.reintroduction ? `: ${escapeHTML(path.reintroduction.card.name)} reintroduced` : ': original slot'}">${branching ? `<header class="path-heading"><span class="path-number">${path.id + 1}</span><div>${path.reintroduction ? `<h2>Reintroduced, replacing ${escapeHTML(path.reintroduction.replacedCard?.name || 'an unlinked card')}</h2><button class="parent-path" data-path="${path.parentId}">↳ From path ${path.parentId + 1} · ${escapeHTML(path.reintroduction.card.name.split(' // ')[0])}</button>` : '<h2>Original path</h2>'}</div></header>` : ''}${renderTrack(path)}</section>`).join('')}</div>`;
  const count = activePaths.reduce((n, path) => n + stackLineage(path.nodes).filter(node => node.card).length, 0);
  const snapshots = activePaths[0]?.nodes.filter(node => node.card).length || 0;
  $('#lineage-summary').textContent = `${snapshots} snapshot${snapshots === 1 ? '' : 's'} · ${branching ? `${activePaths.length} paths · ` : ''}${count} card${count === 1 ? '' : 's'}`;
  $('#atlas-caption').textContent = activePaths.some(path => path.nodes.at(-1)?.state === 'gap') ? 'One published timeline has an unlinked transition.' : `${branching ? 'All paths through' : 'Through'} ${snapshotDate(versions.at(-1))}`;
  requestAnimationFrame(sizeLineage);
}
function sizeLineage() {
  const canvas = $('#lineage-canvas'), board = canvas.firstElementChild;
  if (!board?.children.length) return;
  const tracks = [...canvas.querySelectorAll('.lineage-track')];
  canvas.classList.remove('fit-overview');
  canvas.style.height = ''; board.style.width = ''; board.style.transform = ''; board.style.left = '';
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
  const height = Math.max(220, window.innerHeight - (canvas.getBoundingClientRect().top + window.scrollY) - 144);
  const setTrack = (track, columns, width) => {
    track.style.setProperty('--lineage-columns', columns);
    track.style.setProperty('--lineage-card-width', `${width}px`);
    [...track.children].forEach((node, i) => node.classList.toggle('row-end', (i + 1) % columns === 0));
  };
  if (tracks.length === 1) {
    board.style.setProperty('--path-columns', 1);
    const layout = fitLineage(tracks[0].children.length, canvas.clientWidth - 36, height - 32, rem * 5.5, 24);
    setTrack(tracks[0], layout.columns, layout.cardWidth);
    return;
  }
  // Fit complete lanes into the viewport when possible. At the readability
  // floor, let a complex family extend vertically; never hide a branch.
  const applyLayout = width => {
    for (const track of tracks) {
      const panelWidth = Math.min(board.clientWidth, Math.max(210, track.children.length * (width + 24) + 10));
      track.parentElement.style.width = `${panelWidth}px`;
      const count = Math.max(1, Math.min(track.children.length, Math.floor((track.clientWidth + 24) / (width + 24))));
      setTrack(track, count, Math.min(width, track.clientWidth));
    }
    return board.getBoundingClientRect().height;
  };
  let best = { width: 86, height: applyLayout(86), fits: false };
  // Short lanes take only the width they need, so they do not leave large
  // empty grid cells beside a longer history.
  for (let width = 180; width >= 64; width -= 4) {
    const usedHeight = applyLayout(width);
    if (usedHeight <= height - 16) { best = { width, height: usedHeight, fits: true }; break; }
    if (usedHeight < best.height) best = { width, height: usedHeight, fits: false };
  }
  applyLayout(best.width);
  if (fitPaths && canvas.clientWidth >= 700 && best.height > height - 16) {
    let fitted = null;
    for (const multiplier of [1, 1.25, 1.5, 2]) {
      const boardWidth = Math.floor(canvas.clientWidth * multiplier);
      board.style.width = `${boardWidth}px`;
      for (const width of [100, 120, 140]) {
        const boardHeight = applyLayout(width);
        const scale = Math.min(1, canvas.clientWidth / boardWidth, (height - 16) / boardHeight);
        const score = (width + 30) * scale;
        if (!fitted || score > fitted.score) fitted = { width, boardWidth, boardHeight, scale, score };
      }
    }
    board.style.width = `${fitted.boardWidth}px`; applyLayout(fitted.width);
    canvas.classList.add('fit-overview');
    canvas.style.height = `${Math.ceil(fitted.boardHeight * fitted.scale)}px`;
    board.style.left = `${(canvas.clientWidth - fitted.boardWidth * fitted.scale) / 2}px`;
    board.style.transform = `scale(${fitted.scale})`;
  }
}
function previewCard(printing) {
  const entry = images[printing];
  if (!entry) return;
  $('#preview-faces').innerHTML = entry.faces.map(face => `<img src="${escapeHTML(face.normal)}" alt="${escapeHTML(face.name)}">`).join('');
  $('#preview-printing').textContent = entry.setName ? `First printing · ${entry.setName} · ${entry.releasedAt.slice(0, 4)}` : '';
  $('#card-preview').showModal();
}
function attachEvents(survivors) {
  $('#lineage-version').addEventListener('change', () => { populateLineageCards(selectedCard); renderLineage(); });
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
    const button = event.target.closest('[data-preview]'); if (button) previewCard(button.dataset.preview);
    const jump = event.target.closest('[data-path]');
    if (jump) { const path = document.getElementById(`path-${jump.dataset.path}`); path?.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); path?.focus({ preventScroll: true }); }
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
      description: 'Read the selected cube slot and every parallel reintroduction path, with replacement names, date ranges, and consecutive revision counts. Does not change the selection or any links.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute(input) {
        if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length) throw new Error('This read-only tool takes an empty object.');
        const describe = nodes => stackLineage(nodes).map(node => ({ card: node.card?.name || null, from: snapshotDate(versions[node.index]), through: snapshotDate(versions[node.endIndex]), revisions: node.count }));
        return { readOnly: true, timeline: describe(selectedLineage()), paths: activePaths.map(path => ({ id: path.id + 1, parentId: path.parentId === null ? null : path.parentId + 1, reintroduced: path.reintroduction ? { card: path.reintroduction.card.name, replacing: path.reintroduction.replacedCard?.name || null, date: snapshotDate(versions[path.reintroduction.index]) } : null, timeline: describe(path.nodes) })) };
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
    versions = archive.versions; images = imageData; pairings = normalizePairings(defaults.pairings, versions); history = indexHistory(versions, pairings);
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
