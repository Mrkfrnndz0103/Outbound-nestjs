import assert from 'node:assert/strict';
import test from 'node:test';
import { HealthController } from './health.controller.js';

test('health endpoint reports service availability', () => {
  const response = new HealthController().getHealth();

  assert.equal(response.status, 'ok');
  assert.equal(response.service, 'backend-nest');
  assert.match(response.timestamp, /^\d{4}-\d{2}-\d{2}T/);
});
