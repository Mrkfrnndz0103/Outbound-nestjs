import { buildOptions, getTargetConfig, publicApiRead, readOnlyRequest, setupAuth, apiRead, randomPause, todayIso } from './helpers.js';

const stageDuration = __ENV.K6_STAGE_DURATION || '30s';

const allStages = [
    { target: 10, duration: stageDuration },
    { target: 10, duration: stageDuration },
    { target: 25, duration: stageDuration },
    { target: 25, duration: stageDuration },
    { target: 50, duration: stageDuration },
    { target: 50, duration: stageDuration },
    { target: 100, duration: stageDuration },
    { target: 100, duration: stageDuration },
    { target: 200, duration: stageDuration },
    { target: 200, duration: stageDuration },
    { target: 300, duration: stageDuration },
    { target: 300, duration: stageDuration },
    { target: 0, duration: stageDuration },
];

const requestedMaxUsers = Number(__ENV.K6_MAX_USERS || 300);
const maximumStage = [10, 25, 50, 100, 200, 300].find((level) => level >= requestedMaxUsers) || 300;
const stages = allStages.filter((stage) => stage.target <= maximumStage);

export const options = buildOptions({
  stages,
});

export function setup() {
  return setupAuth({ required: false });
}

export default function (auth) {
  const { frontend, backend } = getTargetConfig();
  readOnlyRequest(frontend, '', { headers: { Accept: 'text/html' } });
  randomPause(1, 3);
  readOnlyRequest(backend, 'up');
  randomPause(1, 3);
  publicApiRead('auth/status');

  if (auth.token) {
    randomPause(1, 3);
    apiRead(auth, 'auth/me');
    randomPause(1, 3);
    apiRead(auth, 'requests', '?per_page=50&sort=created_at&direction=desc');
    randomPause(1, 3);
    apiRead(auth, 'requests/summary');
    randomPause(1, 3);
    randomPause(1, 3);
    apiRead(auth, 'dispatch/intraday', `?date=${todayIso()}`);
  }
  randomPause(2, 5);
}
