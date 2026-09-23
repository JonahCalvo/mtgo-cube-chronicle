import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { identity, indexHistory, lineageCardGroups, followEvolution, stackLineage, normalizePairings } from './cube-model.mjs';

const card = (name, colors = ['U'], cmc = 1) => ({ name, oracleId: name, colors, cmc, typeLine: 'Creature' });
const makeVersion = (id, names) => ({ id, cards: names.map(name => card(name)) });
test('off-slot returns branch recursively, same-path returns do not duplicate, and retained cards carry forward', () => {
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
  assert.equal(paths.length, 3);
  assert.equal(paths[1].parentId, 0);
  assert.equal(paths[1].reintroduction.replacedCard.name, 'X');
  assert.deepEqual(paths[1].nodes.map(n => n.card.name), ['A', 'C', 'C', 'C']);
  assert.equal(paths[2].reintroduction.card.name, 'B');
  assert(paths.every(path => path.nodes.at(-1).index === versions.length - 1));
});
test('a return of a card on a new branch creates a child branch', () => {
  const versions = [makeVersion('a', ['A', 'X', 'Y']), makeVersion('b', ['B', 'X', 'Y']), makeVersion('c', ['B', 'A', 'Y']), makeVersion('d', ['B', 'C', 'Y']), makeVersion('e', ['B', 'C', 'A'])];
  const links = { a__b: [{ cut: 'A', add: 'B' }], b__c: [{ cut: 'X', add: 'A' }], c__d: [{ cut: 'A', add: 'C' }], d__e: [{ cut: 'Y', add: 'A' }] };
  const paths = followEvolution(versions, links, 0, 'A');
  assert.equal(paths.length, 3);
  assert.equal(paths[2].parentId, 1);
  assert.equal(paths[2].reintroduction.replacedCard.name, 'Y');
  assert.equal(followEvolution(versions, links, 3, 'C').length, 1, 'do not add branches from history before the chosen start');
});
const versions = JSON.parse(fs.readFileSync(new URL('cube-data.json', import.meta.url))).versions;
const pairings = JSON.parse(fs.readFileSync(new URL('default-pairings.json', import.meta.url))).pairings;
const history = indexHistory(versions, pairings);
test('Shelldock Isle includes its June 2015 return replacing Windbrisk Heights', () => {
  const id = identity(versions[0].cards.find(c => c.name === 'Shelldock Isle'));
  const paths = followEvolution(versions, pairings, 0, id, history);
  const branch = paths.find(path => path.reintroduction?.card.name === 'Shelldock Isle' && versions[path.reintroduction.index].date === 'Jun 2015');
  assert(branch);
  assert.equal(branch.reintroduction.replacedCard.name, 'Windbrisk Heights');
  assert.deepEqual(stackLineage(branch.nodes).map(n => n.card.name), ['Shelldock Isle', 'Seal of Removal', 'Stern Scolding']);
  assert(paths.every(path => path.nodes.at(-1).index === versions.length - 1));
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
    for (const event of history.reintroductions) if (covered.has(`${event.previousIndex}:${event.id}`)) assert(covered.has(`${event.index}:${event.id}`));
  }
});
