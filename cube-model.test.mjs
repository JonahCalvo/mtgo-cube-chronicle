import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { identity, indexHistory, lineageCardGroups, followEvolution, followSlot, stackLineage, normalizePairings, alignEvolution } from './cube-model.mjs';

const card = (name, colors = ['U'], cmc = 1) => ({ name, oracleId: name, colors, cmc, typeLine: 'Creature' });
const makeVersion = (id, names) => ({ id, cards: names.map(name => card(name)) });
test('only starting-card returns branch; replacement-card returns and same-path returns do not duplicate', () => {
  const versions = [makeVersion('a', ['A', 'X', 'Q']), makeVersion('b', ['B', 'X', 'Q']), makeVersion('c', ['B', 'A', 'Q']), makeVersion('d', ['A', 'C', 'Q']), makeVersion('e', ['A', 'C', 'B'])];
  const links = { a__b: [{ cut: 'A', add: 'B' }], b__c: [{ cut: 'X', add: 'A' }], c__d: [{ cut: 'B', add: 'A' }, { cut: 'A', add: 'C' }], d__e: [{ cut: 'Q', add: 'B' }] };
  // At c→d A is retained, so a real archive cannot link it to C. Use a gap
  // snapshot to test the same-path return without violating that invariant.
  versions.splice(3, 0, makeVersion('gap', ['B', 'C', 'Q']));
  delete links.c__d;
  links.c__gap = [{ cut: 'A', add: 'C' }];
  links.gap__d = [{ cut: 'B', add: 'A' }];
  normalizePairings(links, versions);
  const paths = followEvolution(versions, links, 0, 'A');
  assert.equal(paths.length, 2);
  assert.equal(paths[1].parentId, 0);
  assert.equal(paths[1].reintroduction.replacedCard.name, 'X');
  assert.deepEqual(paths[1].nodes.map(n => n.card.name), ['A', 'C', 'C', 'C']);
  assert(paths.slice(1).every(path => path.reintroduction.card.name === 'A'));
  assert(paths.every(path => path.nodes.at(-1).index === versions.length - 1));
});
test('later returns of the starting card are still included after the first alternate path', () => {
  const versions = [makeVersion('a', ['A', 'X', 'Y']), makeVersion('b', ['B', 'X', 'Y']), makeVersion('c', ['B', 'A', 'Y']), makeVersion('d', ['B', 'C', 'Y']), makeVersion('e', ['B', 'C', 'A'])];
  const links = { a__b: [{ cut: 'A', add: 'B' }], b__c: [{ cut: 'X', add: 'A' }], c__d: [{ cut: 'A', add: 'C' }], d__e: [{ cut: 'Y', add: 'A' }] };
  const paths = followEvolution(versions, links, 0, 'A');
  assert.equal(paths.length, 3);
  assert.equal(paths[2].parentId, 0);
  assert.equal(paths[2].reintroduction.replacedCard.name, 'Y');
  assert.equal(followEvolution(versions, links, 3, 'C').length, 1, 'replacement cards do not add their predecessors’ return branches');
  const later = followEvolution(versions, links, 4, 'A');
  assert.equal(later.length, 3, 'earlier inclusions remain visible when selecting the latest return');
  assert.deepEqual(later[0].nodes.map(n => n.card.name), ['Y', 'Y', 'Y', 'Y', 'A']);
  assert.equal(later[1].inclusion.index, 0);
  assert.equal(later[1].inclusion.isReintroduction, false);
  assert.equal(later[2].inclusion.index, 2);
});
const versions = JSON.parse(fs.readFileSync(new URL('cube-data.json', import.meta.url))).versions;
const pairings = JSON.parse(fs.readFileSync(new URL('default-pairings.json', import.meta.url))).pairings;
const history = indexHistory(versions, pairings);
test('Shelldock Isle includes its June 2015 return replacing Windbrisk Heights', () => {
  const id = identity(versions[0].cards.find(c => c.name === 'Shelldock Isle'));
  const paths = followEvolution(versions, pairings, 0, id, history);
  assert.equal(paths.length, 2, 'no branches from Valki, Mana Confluence, or other replacements');
  const branch = paths.find(path => path.reintroduction?.card.name === 'Shelldock Isle' && versions[path.reintroduction.index].date === 'Jun 2015');
  assert(branch);
  assert.equal(branch.reintroduction.replacedCard.name, 'Windbrisk Heights');
  assert.deepEqual(stackLineage(branch.nodes).map(n => n.card.name), ['Shelldock Isle', 'Seal of Removal', 'Stern Scolding']);
  assert(paths.every(path => path.nodes.at(-1).index === versions.length - 1));
});
test('Kytheon branches only when selected as the starting card, not from Elite Vanguard', () => {
  const kytheon = versions[4].cards.find(c => c.name.startsWith('Kytheon,'));
  const own = followEvolution(versions, pairings, 4, identity(kytheon), history);
  assert.equal(own.length, 2);
  assert.equal(own[1].reintroduction.replacedCard.name, 'Student of Warfare');
  assert.equal(own[0].nodes[0].card.name, 'Elite Vanguard', 'a later introduction includes the full slot back-history');
  assert.equal(own[0].nodes.length, versions.length);
  const vanguard = versions[0].cards.find(c => c.name === 'Elite Vanguard');
  assert.equal(followEvolution(versions, pairings, 0, identity(vanguard), history).length, 1);
});
test('selecting a later Shelldock inclusion promotes its slot and preserves the earlier inclusion', () => {
  const id = identity(versions[3].cards.find(c => c.name === 'Shelldock Isle'));
  const paths = followEvolution(versions, pairings, 3, id, history);
  assert.equal(paths.length, 2);
  assert.deepEqual(stackLineage(paths[0].nodes).map(n => n.card.name), ['Windbrisk Heights', 'Shelldock Isle', 'Seal of Removal', 'Stern Scolding']);
  assert.equal(paths[1].inclusion.index, 0);
  assert.equal(paths[1].inclusion.isReintroduction, false);
  assert.equal(paths[1].nodes[0].card.name, 'Shelldock Isle');
  assert.equal(paths[1].nodes.at(-1).card.name, 'Shelldock Isle');
  const faded = alignEvolution(followEvolution(versions, pairings, 0, id, history)).rows[1].cells.find(cell => cell?.ghost);
  const promoted = followSlot(versions, pairings, faded.index, identity(faded.card));
  assert.deepEqual(promoted, paths[0].nodes, 'the faded predecessor leads to the exact same slot');
});
test('selecting Kytheon’s 2023 return retains its 2015 first inclusion on the other slot', () => {
  const id = identity(versions[27].cards.find(c => c.name.startsWith('Kytheon,')));
  const paths = followEvolution(versions, pairings, 27, id, history);
  assert.equal(paths.length, 2);
  assert.equal(paths[0].nodes[27].card.name, versions[27].cards.find(c => identity(c) === id).name);
  assert.equal(paths[0].nodes[26].card.name, 'Student of Warfare');
  assert.equal(paths[1].inclusion.index, 4);
  assert.equal(paths[1].inclusion.isReintroduction, false);
  assert.equal(paths[1].inclusion.replacedCard.name, 'Dragon Hunter');
  const aligned = alignEvolution(paths);
  assert.equal(aligned.rows[1].cells.find(cell => cell?.ghost).index, 3);
});
test('incomplete history stops at a missing link without inventing a predecessor', () => {
  const snapshots = [makeVersion('a', ['A']), makeVersion('b', ['B']), makeVersion('c', ['C'])];
  assert.deepEqual(followSlot(snapshots, { b__c: [{ cut: 'B', add: 'C' }] }, 2, 'C').map(node => node.card.name), ['B', 'C']);
  assert.deepEqual(followSlot(snapshots, {}, 0, 'absent'), []);
});
test('shared columns split retained runs and put the faded predecessor immediately before its return', () => {
  const id = identity(versions[0].cards.find(c => c.name === 'Shelldock Isle'));
  const { columns, rows } = alignEvolution(followEvolution(versions, pairings, 0, id, history));
  const ghostColumn = columns.findIndex(column => column.index === 2);
  assert.equal(columns[ghostColumn].endIndex, 2);
  assert.equal(rows[1].cells[ghostColumn].card.name, 'Windbrisk Heights');
  assert(rows[1].cells[ghostColumn].ghost);
  assert(rows[1].cells.slice(0, ghostColumn).every(cell => cell === null));
  assert.equal(rows[1].cells[ghostColumn + 1].card.name, 'Shelldock Isle');
  assert.equal(rows[1].cells[ghostColumn + 1].index, 3);
  const ruins = rows[0].cells.filter(cell => cell?.card?.name === 'Academy Ruins');
  assert(ruins.length > 1);
  assert.equal(ruins[0].continued, false);
  assert(ruins.slice(1).every(cell => cell.continued));
  assert(ruins.every(cell => cell.runCount === 23));
  assert.equal(ruins.reduce((n, cell) => n + cell.count, 0), 23);
});
test('never-replaced cards are last, remain selectable, and are defined across the whole archive', () => {
  const groups = lineageCardGroups(versions[0].cards, history);
  assert.equal(groups.at(-1).name, 'Never replaced');
  assert.equal(groups.flatMap(group => group.cards).length, 540);
  assert(groups.at(-1).cards.some(c => c.name === 'Black Lotus'));
  assert(!groups.at(-1).cards.some(c => c.name === 'Shelldock Isle'));
  for (const group of groups.slice(0, -1)) assert(group.cards.every(c => !history.neverReplaced.has(identity(c))));
});
test('all 540 starting families are complete, without duplicate occurrences or missing reintroduction branches', () => {
  normalizePairings(pairings, versions);
  for (const card of versions[0].cards) {
    const paths = followEvolution(versions, pairings, 0, identity(card), history);
    const covered = new Set();
    for (const path of paths) {
      assert.equal(path.nodes.at(-1).index, versions.length - 1);
      assert(path.nodes.every(n => n.card));
      for (const node of path.nodes) {
        const key = `${node.index}:${identity(node.card)}`;
        assert(!covered.has(key), 'same occurrence displayed twice'); covered.add(key);
      }
      if (path.parentId !== null) assert(path.parentId < path.id, 'branches must point to an existing parent');
    }
    assert(paths.slice(1).every(path => path.reintroduction.id === identity(card)));
    for (const event of history.reintroductions) if (event.id === identity(card)) assert(covered.has(`${event.index}:${event.id}`));
    const aligned = alignEvolution(paths);
    for (const row of aligned.rows) {
      assert.equal(row.cells.length, aligned.columns.length);
      const expanded = row.cells.filter(cell => cell && !cell.ghost).flatMap(cell => Array.from({ length: cell.count }, (_, offset) => `${cell.index + offset}:${identity(cell.card)}`));
      assert.deepEqual(expanded, row.nodes.map(node => `${node.index}:${identity(node.card)}`), 'alignment must preserve every actual snapshot exactly once');
    }
  }
});
test('every card inclusion and every latest occurrence can navigate back and show all other inclusions exactly once', () => {
  const latest = new Map();
  versions.forEach((version, index) => version.cards.forEach(card => latest.set(identity(card), { index, id: identity(card) })));
  const selections = [...history.inclusions, ...latest.values()];
  for (const selection of selections) {
    const paths = followEvolution(versions, pairings, selection.index, selection.id, history);
    assert.equal(paths[0].nodes[0].index, 0);
    assert.equal(paths[0].nodes.length, versions.length);
    assert.equal(identity(paths[0].nodes[selection.index].card), selection.id);
    const covered = new Set();
    for (const path of paths) {
      assert.equal(path.nodes.at(-1).index, versions.length - 1);
      for (const node of path.nodes) {
        assert(node.card);
        const key = `${node.index}:${identity(node.card)}`;
        assert(!covered.has(key), `duplicate occurrence for ${selection.id}`);
        covered.add(key);
      }
      if (path.inclusion) assert.equal(path.inclusion.id, selection.id);
    }
    for (const event of history.inclusions) if (event.id === selection.id) assert(covered.has(`${event.index}:${event.id}`), 'missing earlier or later inclusion');
    for (const row of alignEvolution(paths).rows) {
      for (const cell of row.cells.filter(cell => cell?.card)) {
        assert(versions[cell.index].cards.some(card => identity(card) === identity(cell.card)), 'every visual link, even faded, must identify a real occurrence');
      }
    }
  }
});
