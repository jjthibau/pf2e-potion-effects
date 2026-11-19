import assert from 'node:assert/strict';
import {test} from 'node:test';

const callbacks = new Map();
globalThis.Hooks = {once: (name, callback) => callbacks.set(name, callback), on() {}};
const {ID} = await import('../scripts/main.js');

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return {promise, resolve};
}

function fixture({choices = 1, updater = 'local', beforeConsume = async () => {}, choose = async () => false} = {}) {
  const local = {id: 'local'};
  const remote = {id: 'remote', active: true};
  const effectItems = new Map();
  const events = new Map();
  const nativeAmounts = [];
  let nextId = 0;
  const actor = {
    uuid: 'Actor.practice', isOwner: true,
    primaryUpdater: updater === 'unavailable' ? null : updater === 'remote' ? remote : local,
    isOfType: type => type === 'character', testUserPermission: () => true,
    getActiveTokens: () => [], items: new Map(),
    async createEmbeddedDocuments(_type, sources) {
      return sources.map(source => {
        const id = String(++nextId);
        const item = {...source, id};
        effectItems.set(id, item);
        return item;
      });
    },
    async deleteEmbeddedDocuments(_type, ids) { for (const id of ids) effectItems.delete(id); },
  };
  const effects = Array.from({length: choices}, (_, index) => ({
    name: `Effect ${index}`, uuid: `Effect.${index}`, isOfType: type => type === 'effect',
    toObject: () => ({system: {}}),
  }));
  class Potion {
    actor = actor;
    id = 'potion';
    uuid = 'Actor.practice.Item.potion';
    name = 'Practice potion';
    category = 'potion';
    uses = {value: 1};
    quantity = 4;
    system = {description: {value: effects.map(effect => `@UUID[${effect.uuid}]`).join(' ')}};
    getFlag() {}
    isOfType(type) { return type === 'consumable'; }
    async consume(amount = 1) {
      nativeAmounts.push(amount);
      await beforeConsume();
      this.quantity -= amount;
    }
  }
  local.active = updater !== 'unavailable';
  const users = [local, remote].filter(user => user === local || updater === 'remote');
  users.get = id => users.find(user => user.id === id);
  const moduleRecord = {};
  globalThis.game = {user: local, users, modules: new Map([[ID, moduleRecord]]), socket: {
    on: (channel, callback) => events.set(channel, callback),
    emit: (_channel, data) => { socketCalls.push(data); emitted.resolve(); },
  }};
  const socketCalls = [];
  const emitted = deferred();
  globalThis.CONFIG = {PF2E: {Item: {documentClasses: {consumable: Potion}}}};
  globalThis.foundry = {utils: {randomID: () => `request-${++nextId}`}, applications: {api: {DialogV2: {wait: choose}}}};
  globalThis.fromUuid = async uuid => uuid === actor.uuid ? actor : effects.find(effect => effect.uuid === uuid);
  const potion = new Potion();
  actor.items.set(potion.id, potion);
  callbacks.get('ready')();
  return {potion, effectItems, nativeAmounts, socketCalls, emitted, events, remote};
}

test('a local double tap creates one effect and spends one dose until settled', async () => {
  const release = deferred();
  const started = deferred();
  const {potion, effectItems, nativeAmounts} = fixture({beforeConsume: () => { started.resolve(); return release.promise; }});
  const first = potion.consume();
  await started.promise;
  assert.equal(potion.quantity, 4);
  await potion.consume();
  assert.equal(effectItems.size, 1);
  release.resolve();
  await first;
  assert.equal(potion.quantity, 3);
  await potion.consume();
  assert.equal(potion.quantity, 2);
  assert.equal(effectItems.size, 2);
  assert.deepEqual(nativeAmounts, [1, 1]);
});

test('a remote authority reply retains the guard until the transaction finishes', async () => {
  const {potion, effectItems, socketCalls, emitted, events, remote} = fixture({updater: 'remote'});
  const result = potion.consume();
  await emitted.promise;
  await potion.consume();
  assert.equal(socketCalls.length, 1);
  const player = game.user;
  game.user = remote;
  await events.get(`module.${ID}`)(socketCalls[0]);
  game.user = player;
  await events.get(`module.${ID}`)(socketCalls[1]);
  await result;
  assert.equal(effectItems.size, 1);
  assert.equal(potion.quantity, 3);
});

test('cancelled choice and unavailable updater preserve the inventory and effects', async () => {
  const cancelled = fixture({choices: 2});
  assert.equal(await cancelled.potion.consume(), undefined);
  assert.equal(cancelled.effectItems.size, 0);
  assert.equal(cancelled.potion.quantity, 4);
  const offline = fixture({updater: 'unavailable'});
  await assert.rejects(offline.potion.consume(), /No character updater/);
  assert.equal(offline.effectItems.size, 0);
  assert.equal(offline.potion.quantity, 4);
});

test('a rejected native write rolls back the created effect and permits a later tap', async () => {
  let fail = true;
  const {potion, effectItems} = fixture({beforeConsume: async () => { if (fail) throw Error('write rejected'); }});
  await assert.rejects(potion.consume(), /write rejected/);
  assert.equal(effectItems.size, 0);
  assert.equal(potion.quantity, 4);
  fail = false;
  await potion.consume();
  assert.equal(effectItems.size, 1);
  assert.equal(potion.quantity, 3);
});

test('plain healing keeps native dose amounts and effect potions explicitly require one dose', async () => {
  const plain = fixture({choices: 0});
  await plain.potion.consume(1);
  await plain.potion.consume(2);
  assert.deepEqual(plain.nativeAmounts, [1, 2]);
  assert.equal(plain.potion.quantity, 1);
  const mapped = fixture();
  await assert.rejects(mapped.potion.consume(2), /one dose at a time/);
  assert.equal(mapped.potion.quantity, 4);
  assert.equal(mapped.effectItems.size, 0);
  await mapped.potion.consume(1);
  assert.equal(mapped.potion.quantity, 3);
  assert.equal(mapped.effectItems.size, 1);
});
