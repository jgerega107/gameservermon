const assert = require('node:assert/strict');
const { once } = require('node:events');
const { test } = require('node:test');
const { createMonitor, loadConfig } = require('../index');

const env = { GAME_TYPE: 'minecraft', GAME_HOST: 'localhost', GAME_PORT: '25565' };
const game = {
  name: 'Test server', map: 'world', version: '1.21',
  numplayers: 2, maxplayers: 20, players: [{ name: 'Alex' }, { name: 'Steve' }]
};

async function fixture(t, options = {}) {
  const monitor = createMonitor({ config: loadConfig(env), query: async () => game, ...options });
  const server = monitor.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    monitor.register.clear();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  return { ...monitor, server, get: path => fetch(base + path, { signal: AbortSignal.timeout(5000) }) };
}

test('configuration trims values and defaults the HTTP port', () => {
  assert.deepEqual(loadConfig({ GAME_TYPE: ' minecraft ', GAME_HOST: ' localhost ', GAME_PORT: ' 25565 ' }), {
    gameType: 'minecraft', gameHost: 'localhost', gamePort: 25565, httpPort: 9090
  });
});

test('configuration rejects missing values and unknown game types', () => {
  for (const name of ['GAME_TYPE', 'GAME_HOST', 'GAME_PORT']) {
    assert.throws(() => loadConfig({ ...env, [name]: ' ' }), new RegExp(`${name} environment variable is required`));
  }
  assert.throws(() => loadConfig({ ...env, GAME_TYPE: 'not-a-game' }), /Invalid GAME_TYPE/);
});

test('ports must be whole decimal numbers in range', () => {
  for (const name of ['GAME_PORT', 'HTTP_PORT']) {
    for (const value of ['0', '65536', '-1', '9090oops', '9090.5', '1e3', '0xFF']) {
      assert.throws(() => loadConfig({ ...env, [name]: value }), new RegExp(`${name} must be a valid port`));
    }
    for (const value of ['1', '65535']) {
      assert.doesNotThrow(() => loadConfig({ ...env, [name]: value }));
    }
  }
});

test('liveness is healthy before a scrape without querying the game', async t => {
  let calls = 0;
  const { get } = await fixture(t, { query: async () => { calls++; return game; } });
  const live = await get('/live');
  assert.equal(live.status, 200);
  assert.deepEqual(await live.json(), { status: 'ok' });
  assert.equal((await get('/health')).status, 503);
  assert.equal(calls, 0);
});

test('metrics expose game and process values with the Prometheus content type', async t => {
  const { get } = await fixture(t, { query: async options => {
    assert.deepEqual(options, { type: 'minecraft', host: 'localhost', port: 25565 });
    return game;
  } });
  const response = await get('/metrics');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/plain.*version=0\.0\.4/);
  const text = await response.text();
  assert.match(text, /gameserver_online\{host="localhost",port="25565"\} 1/);
  assert.match(text, /gameserver_players_current\{host="localhost",port="25565"\} 2/);
  assert.match(text, /gameserver_players_max\{host="localhost",port="25565"\} 20/);
  assert.match(text, /player_name="Alex"/);
  assert.match(text, /process_cpu_user_seconds_total/);
  const health = await get('/health');
  assert.equal(health.status, 200);
  assert.equal((await health.json()).lastQuery.name, game.name);
});

test('concurrent scrapes share a query and both wait for fresh metrics', { timeout: 10000 }, async t => {
  const finished = Promise.withResolvers();
  const requestsSeen = Promise.withResolvers();
  let calls = 0;
  let requests = 0;
  t.after(() => finished.resolve(game));
  const { get, server } = await fixture(t, { query: () => { calls++; return finished.promise; } });
  server.on('request', req => {
    if (req.url === '/metrics' && ++requests === 2) requestsSeen.resolve();
  });
  const first = get('/metrics');
  const second = get('/metrics');
  await requestsSeen.promise;
  assert.equal(calls, 1);
  finished.resolve(game);
  for (const response of await Promise.all([first, second])) {
    assert.match(await response.text(), /gameserver_online\{[^\n]+\} 1/);
  }
});

test('the cache expires five seconds after a slow query completes', async t => {
  let clock = 1000;
  let calls = 0;
  const { get } = await fixture(t, { now: () => clock, query: async () => {
    calls++;
    clock += 10000;
    return game;
  } });
  await (await get('/metrics')).text();
  clock += 4999;
  await (await get('/metrics')).text();
  assert.equal(calls, 1);
  clock += 1;
  await (await get('/metrics')).text();
  assert.equal(calls, 2);
});

test('changing the server map and players removes old metric labels', async t => {
  let clock = 1000;
  let result = game;
  const { get } = await fixture(t, { now: () => clock, query: async () => result });
  await (await get('/metrics')).text();
  clock += 5000;
  result = { ...game, name: 'New server', map: 'new-world', numplayers: 0, players: [] };
  const metrics = await (await get('/metrics')).text();
  assert.match(metrics, /server_name="New server",map="new-world"/);
  assert.doesNotMatch(metrics, /server_name="Test server"|player_name="Alex"|player_name="Steve"/);
  assert.match(metrics, /gameserver_players_current\{[^\n]+\} 0/);
});

test('failed queries clear stale data, stay cached, and recover on the next query', async t => {
  let clock = 1000;
  let fail = false;
  let calls = 0;
  t.mock.method(console, 'error', () => {});
  const { get } = await fixture(t, { now: () => clock, query: () => {
    calls++;
    if (fail) throw new Error('Server unavailable');
    return game;
  } });
  await (await get('/metrics')).text();
  clock += 5000;
  fail = true;
  const response = await get('/metrics');
  assert.equal(response.status, 200);
  const metrics = await response.text();
  assert.match(metrics, /gameserver_online\{[^\n]+\} 0/);
  assert.doesNotMatch(metrics, /^gameserver_(players_current|players_max|info|player_info)\{/m);
  const health = await get('/health');
  assert.equal(health.status, 503);
  const body = await health.json();
  assert.equal(body.lastQuery, null);
  assert.equal(body.lastError, 'Server unavailable');
  assert.equal((await get('/live')).status, 200);
  await (await get('/metrics')).text();
  assert.equal(calls, 2);
  fail = false;
  clock += 5000;
  await (await get('/metrics')).text();
  assert.equal((await get('/health')).status, 200);
  assert.equal(calls, 3);
});

test('the information page escapes configured HTML', async t => {
  const { get } = await fixture(t, {
    config: loadConfig({ ...env, GAME_HOST: '<script>alert("test")</script>' })
  });
  const response = await get('/');
  assert.equal(response.headers.get('x-powered-by'), null);
  const html = await response.text();
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;alert\(&quot;test&quot;\)&lt;\/script&gt;/);
});
