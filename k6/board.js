// Signs in once, then lists the work order board while the number of virtual users climbs, so
// `kubectl get hpa --watch` shows the replicas follow the load. k8s/README.md has the steps.
//
//   scripts/tool.sh k6 run -e ADMIN_EMAIL=... -e ADMIN_PASSWORD=... k6/board.js
//
// The environment sets the run:
//   BASE_URL        the address of the API, http://localhost:18080 for the local cluster
//   ADMIN_EMAIL     an account that holds work-orders:read, such as the SUPER_ADMIN
//   ADMIN_PASSWORD  its password
//   PEAK_VUS        the most virtual users, 50
//   RAMP_UP         how long they take to arrive, 2m
//   HOLD            how long they stay at the peak, 5m
//   RAMP_DOWN       how long they take to leave, 1m
// The access token lasts 15 minutes, so a run that outlasts it ends in 401 answers.
import http from 'k6/http';
import { check, fail } from 'k6';

const baseUrl = (__ENV.BASE_URL || 'http://localhost:18080').replace(/\/+$/, '');
const peak = Number(__ENV.PEAK_VUS || 50);

export const options = {
  scenarios: {
    board: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: __ENV.RAMP_UP || '2m', target: peak },
        { duration: __ENV.HOLD || '5m', target: peak },
        { duration: __ENV.RAMP_DOWN || '1m', target: 0 },
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    checks: ['rate>0.99'],
    http_req_failed: ['rate<0.01'],
  },
};

// Runs once, before the first virtual user, so the sign-in rate limit sees one request.
export function setup() {
  if (!__ENV.ADMIN_EMAIL || !__ENV.ADMIN_PASSWORD) {
    fail('Set ADMIN_EMAIL and ADMIN_PASSWORD to an account that can read the board.');
  }
  const response = http.post(
    `${baseUrl}/api/v1/auth/sessions`,
    JSON.stringify({ email: __ENV.ADMIN_EMAIL, password: __ENV.ADMIN_PASSWORD }),
    { headers: { 'Content-Type': 'application/json' }, tags: { name: 'sign-in' } },
  );
  if (!check(response, { 'sign-in answers 201': (r) => r.status === 201 })) {
    fail(`The sign-in answered ${response.status}: ${response.body}`);
  }
  return { accessToken: response.json('accessToken') };
}

export default function (session) {
  const response = http.get(`${baseUrl}/api/v1/work-orders?page=1&pageSize=20`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
    tags: { name: 'board' },
  });
  check(response, { 'board answers 200': (r) => r.status === 200 });
}
