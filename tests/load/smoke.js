import { buildOptions, getTargetConfig, publicApiRead, readOnlyRequest, setupAuth, apiRead, randomPause } from './helpers.js';

export const options = buildOptions({ vus: 1, iterations: 1 });

export function setup() {
  return setupAuth({ required: false });
}

export default function (auth) {
  const { frontend, backend } = getTargetConfig();
  readOnlyRequest(frontend, '', { headers: { Accept: 'text/html' } });
  randomPause(0.5, 1.5);
  readOnlyRequest(backend, 'up');
  randomPause(0.5, 1.5);
  publicApiRead('auth/status');

  if (auth.token) {
    randomPause(0.5, 1.5);
    apiRead(auth, 'auth/me');
    randomPause(0.5, 1.5);
    apiRead(auth, 'requests', '?per_page=25&sort=created_at&direction=desc');
    randomPause(0.5, 1.5);
    apiRead(auth, 'requests/queue', '?limit=100');
    randomPause(0.5, 1.5);
    apiRead(auth, 'requests/summary');
  }
}
