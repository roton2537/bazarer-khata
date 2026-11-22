import { test } from 'node:test';
import assert from 'node:assert/strict';
import {queueKey, sameOwner, queueable, legacyQueueKey} from '../src/lib/offline-core.js';

const a='11111111-1111-4111-8111-111111111111';
const b='22222222-2222-4222-8222-222222222222';
test('offline queue has distinct keys by owner and status', () => {
  assert.notEqual(queueKey(a), queueKey(b));
  assert.notEqual(queueKey(a), queueKey(a, 'failed'));
  assert.equal(legacyQueueKey,'bk_queue_v1');
});
test('only supported operations and correctly owned entries can replay', () => {
  assert.equal(queueable('add_purchase'), true);
  assert.equal(queueable('add_payment'), true);
  assert.equal(queueable('delete_purchase'), false);
  const item={userId:a,args:{p_group:'group-1',p_token:'token-1'}};
  assert.equal(sameOwner(item,a),true);
  assert.equal(sameOwner(item,b),false);
  assert.equal(sameOwner({args:item.args},a),false);
  assert.equal(sameOwner({...item,args:{}},a),false);
});
test('invalid identity cannot create an account-less journal', () => {
  assert.throws(()=>queueKey(''), /ব্যবহারকারী/);
  assert.throws(()=>queueKey('../token'), /ব্যবহারকারী/);
});
