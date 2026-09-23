export const CATEGORIES = [
  { id: 'W', name: 'White', color: '#f0e5c3' },
  { id: 'U', name: 'Blue', color: '#75b9e5' },
  { id: 'B', name: 'Black', color: '#a69db5' },
  { id: 'R', name: 'Red', color: '#e78975' },
  { id: 'G', name: 'Green', color: '#80ba8f' },
  { id: 'M', name: 'Multicolored', color: '#d4b569' },
  { id: 'C', name: 'Colorless', color: '#aab9c3' },
  { id: 'L', name: 'Lands', color: '#b3977b' },
];
export const identity = card => card.oracleId || card.printingId;
export const byIdentity = cards => new Map(cards.map(card => [identity(card), card]));
export const transitionKey = (versions, index) => `${versions[index].id}__${versions[index + 1].id}`;
export function category(card) {
  // A land stays in Lands even when it has colors or a colored back face.
  if (/\bLand\b/.test(card.typeLine)) return 'L';
  if (card.colors.length > 1) return 'M';
  return card.colors[0] || 'C';
}
export function sortCards(cards) {
  const rank = card => CATEGORIES.findIndex(group => group.id === category(card));
  return [...cards].sort((a, b) => rank(a) - rank(b) || a.cmc - b.cmc || a.name.localeCompare(b.name));
}
export function changes(versions, index) {
  if (!Number.isInteger(index) || index < 0 || index >= versions.length - 1) throw new Error('Choose a valid cube transition.');
  const from = versions[index], to = versions[index + 1];
  const before = byIdentity(from.cards), after = byIdentity(to.cards);
  return { from, to, cuts: sortCards(from.cards.filter(c => !after.has(identity(c)))), adds: sortCards(to.cards.filter(c => !before.has(identity(c)))) };
}
export function normalizePairings(raw, versions) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('This file does not contain replacement links.');
  const output = {};
  for (const [key, pairs] of Object.entries(raw)) {
    const index = versions.findIndex((v, i) => i < versions.length - 1 && transitionKey(versions, i) === key);
    if (index < 0 || !Array.isArray(pairs)) throw new Error('This file contains an unknown cube transition.');
    const diff = changes(versions, index), cuts = new Set(diff.cuts.map(identity)), adds = new Set(diff.adds.map(identity));
    const seenCuts = new Set(), seenAdds = new Set();
    output[key] = pairs.map(pair => {
      if (!pair || !cuts.has(pair.cut) || !adds.has(pair.add) || seenCuts.has(pair.cut) || seenAdds.has(pair.add)) throw new Error('A link uses an unavailable card or links the same card twice.');
      seenCuts.add(pair.cut); seenAdds.add(pair.add);
      return { cut: pair.cut, add: pair.add };
    });
  }
  return output;
}
export function followLineage(versions, pairings, startIndex, startId) {
  const nodes = [];
  let currentId = startId, state = 'retained';
  for (let index = startIndex; index < versions.length; index++) {
    const card = byIdentity(versions[index].cards).get(currentId);
    if (!card) break;
    nodes.push({ index, card, state });
    if (index === versions.length - 1) break;
    if (byIdentity(versions[index + 1].cards).has(currentId)) { state = 'retained'; continue; }
    const pair = (pairings[transitionKey(versions, index)] || []).find(p => p.cut === currentId);
    if (!pair) { nodes.push({ index: index + 1, card: null, state: 'gap' }); break; }
    currentId = pair.add; state = 'linked';
  }
  return nodes;
}
// Reintroductions are additional views of existing slots, never new pairings.
export function indexHistory(versions, pairings) {
  const lastSeen = new Map(), reintroductions = [], replaced = new Set();
  for (let index = 0; index < versions.length; index++) {
    const previous = byIdentity(versions[index - 1]?.cards || []);
    const current = byIdentity(versions[index].cards);
    for (const id of previous.keys()) if (!current.has(id)) replaced.add(id);
    const incoming = new Map((index ? pairings[transitionKey(versions, index - 1)] || [] : []).map(p => [p.add, p.cut]));
    for (const card of versions[index].cards) {
      const id = identity(card);
      if (lastSeen.has(id) && !previous.has(id)) {
        reintroductions.push({ index, id, card, previousIndex: lastSeen.get(id), replacedCard: previous.get(incoming.get(id)) || null });
      }
      lastSeen.set(id, index);
    }
  }
  return { reintroductions, neverReplaced: new Set([...lastSeen.keys()].filter(id => !replaced.has(id))) };
}
export function lineageCardGroups(cards, history) {
  const sorted = sortCards(cards);
  const groups = CATEGORIES.map(group => ({ ...group, cards: sorted.filter(c => category(c) === group.id && !history.neverReplaced.has(identity(c))) })).filter(group => group.cards.length);
  const unchanged = sorted.filter(c => history.neverReplaced.has(identity(c)));
  if (unchanged.length) groups.push({ id: 'unchanged', name: 'Never replaced', muted: true, cards: unchanged });
  return groups;
}
export function followEvolution(versions, pairings, startIndex, startId, history = indexHistory(versions, pairings)) {
  const primary = { id: 0, parentId: null, nodes: followLineage(versions, pairings, startIndex, startId) };
  if (!primary.nodes.length) return [];
  const paths = [primary], covered = new Map();
  const key = (index, id) => `${index}:${id}`;
  const cover = path => { for (const node of path.nodes) if (node.card) covered.set(key(node.index, identity(node.card)), path.id); };
  cover(primary);
  // Events are chronological. A newly added lane can itself produce later
  // branches, while covered occurrences prevent duplicate lanes and cycles.
  for (const event of history.reintroductions) {
    if (event.index <= startIndex || covered.has(key(event.index, event.id))) continue;
    const parentId = covered.get(key(event.previousIndex, event.id));
    if (parentId === undefined) continue;
    const path = { id: paths.length, parentId, reintroduction: event, nodes: followLineage(versions, pairings, event.index, event.id) };
    paths.push(path); cover(path);
  }
  return paths;
}
export function snapshotDate(version) {
  const match = version.cubeName?.match(/\(([A-Za-z]{3})(\d{2})\)/);
  return match ? `${match[1]} 20${match[2]}` : version.date;
}
export function stackLineage(nodes) {
  const stacks = [];
  for (const node of nodes) {
    const previous = stacks.at(-1);
    if (node.card && previous?.card && identity(node.card) === identity(previous.card) && node.index === previous.endIndex + 1) {
      previous.endIndex = node.index; previous.count++;
    } else stacks.push({ ...node, endIndex: node.index, count: 1 });
  }
  return stacks;
}
export function fitLineage(count, width, height, textHeight = 82, gap = 24) {
  let best = { columns: 1, cardWidth: 0 };
  for (let columns = 1; columns <= count; columns++) {
    const rows = Math.ceil(count / columns);
    const cardWidth = Math.min(200, (width - gap * (columns - 1)) / columns, ((height - gap * (rows - 1)) / rows - textHeight) * 488 / 680);
    if (cardWidth > best.cardWidth) best = { columns, cardWidth };
  }
  return { ...best, cardWidth: Math.max(36, Math.floor(best.cardWidth)) };
}
