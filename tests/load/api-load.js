import { buildOptions, setupAuth, apiRead, randomPause, recentDateIso, todayIso } from './helpers.js';

export const options = buildOptions({
  scenarios: {
    read_only_api: {
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.K6_API_RATE || 5),
      timeUnit: '1s',
      duration: __ENV.K6_API_DURATION || '2m',
      preAllocatedVUs: Number(__ENV.K6_API_PREALLOCATED_VUS || 10),
      maxVUs: Number(__ENV.K6_API_MAX_VUS || 100),
    },
  },
});

export function setup() {
  return setupAuth({ required: true });
}

export default function (auth) {
  const from = recentDateIso(30);
  const to = todayIso();
  const operations = [
    () => apiRead(auth, 'auth/me'),
    () => apiRead(auth, 'requests', '?per_page=50&sort=created_at&direction=desc'),
    () => apiRead(auth, 'requests/queue', '?limit=100'),
    () => apiRead(auth, 'requests/summary', `?date_from=${from}&date_to=${to}`),
    () => apiRead(auth, 'dispatch/intraday', `?date=${to}`),
    () => apiRead(auth, 'notifications'),
    () => apiRead(auth, 'clusters', `?search=${encodeURIComponent(__ENV.K6_CLUSTER_SEARCH || 'hub')}`),
  ];

  operations[(__ITER + __VU) % operations.length]();
  randomPause(1, 4);
}
