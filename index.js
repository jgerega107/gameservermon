const express = require('express');
const promClient = require('@prometheus-io/client');
const { GameDig, games } = require('gamedig');

const QUERY_CACHE_TTL = 5000;

function loadConfig(env = process.env) {
  function readEnv(name, defaultValue) {
    const value = env[name]?.trim();
    if (value) return value;
    if (defaultValue !== undefined) return defaultValue;
    throw new Error(`${name} environment variable is required`);
  }

  function readPort(name, defaultValue) {
    const value = readEnv(name, defaultValue);
    const port = Number(value);
    if (!/^\d+$/.test(value) || !Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(`${name} must be a valid port number (1-65535), got '${value}'`);
    }
    return port;
  }

  const gameType = readEnv('GAME_TYPE');
  if (!Object.hasOwn(games, gameType)) {
    throw new Error(`Invalid GAME_TYPE '${gameType}'. See https://github.com/gamedig/node-gamedig#games-list for supported games.`);
  }

  return {
    gameType,
    gameHost: readEnv('GAME_HOST'),
    gamePort: readPort('GAME_PORT'),
    httpPort: readPort('HTTP_PORT', '9090')
  };
}

function escapeHtml(value) {
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value).replace(/[&<>"']/g, character => entities[character]);
}

function createMonitor({ config, query = options => GameDig.query(options), now = Date.now }) {
  const app = express();
  app.disable('x-powered-by');
  const register = new promClient.Registry();
  promClient.collectDefaultMetrics({ register });

  const commonLabels = { host: config.gameHost, port: config.gamePort };
  function gauge(name, help, extraLabels = []) {
    return new promClient.Gauge({
      name,
      help,
      labelNames: ['host', 'port', ...extraLabels],
      registers: [register]
    });
  }

  const serverOnline = gauge('gameserver_online', 'Whether the game server is online (1) or offline (0)');
  const playerCount = gauge('gameserver_players_current', 'Current number of players on the game server');
  const maxPlayers = gauge('gameserver_players_max', 'Maximum number of players allowed on the game server');
  const queryDuration = gauge('gameserver_query_duration_seconds', 'Time taken to query the game server in seconds');
  const serverInfo = gauge('gameserver_info', 'Information about the game server', ['game_type', 'server_name', 'map', 'version']);
  const playerInfo = gauge('gameserver_player_info', 'Information about players on the server', ['player_name']);

  let lastQueryResult = null;
  let lastQueryError = null;
  let lastQueryTime = null;
  let pendingQuery = null;

  function queryGameServer() {
    // All concurrent scrapes wait for the same query, including slow queries.
    if (pendingQuery) return pendingQuery;
    if (lastQueryTime !== null && now() - lastQueryTime < QUERY_CACHE_TTL) {
      return Promise.resolve();
    }

    pendingQuery = Promise.resolve().then(async () => {
      const startTime = now();
      try {
        const result = await query({
          type: config.gameType,
          host: config.gameHost,
          port: config.gamePort
        });

        serverOnline.set(commonLabels, 1);
        playerCount.set(commonLabels, result.numplayers ?? 0);
        maxPlayers.set(commonLabels, result.maxplayers ?? 0);

        // Remove old label combinations when the server changes its name or map.
        serverInfo.reset();
        serverInfo.set({
          ...commonLabels,
          game_type: config.gameType,
          server_name: result.name || 'Unknown',
          map: result.map || 'Unknown',
          version: result.version || 'Unknown'
        }, 1);

        playerInfo.reset();
        for (const player of result.players || []) {
          playerInfo.set({ ...commonLabels, player_name: player.name || 'Unknown' }, 1);
        }

        lastQueryResult = result;
        lastQueryError = null;
      } catch (error) {
        console.error('Error querying game server:', error.message);
        serverOnline.set(commonLabels, 0);
        playerCount.remove(commonLabels);
        maxPlayers.remove(commonLabels);
        playerInfo.reset();
        serverInfo.reset();
        lastQueryResult = null;
        lastQueryError = error.message;
      } finally {
        queryDuration.set(commonLabels, (now() - startTime) / 1000);
        // Cache successful and failed queries from completion, not their start.
        lastQueryTime = now();
      }
    }).finally(() => {
      pendingQuery = null;
    });

    return pendingQuery;
  }

  app.get('/metrics', async (req, res) => {
    try {
      await queryGameServer();
      res.set('Content-Type', register.contentType);
      res.end(await register.metrics());
    } catch (error) {
      console.error('Error collecting metrics:', error.message);
      res.status(500).send('Error collecting metrics');
    }
  });

  // Container liveness does not depend on the monitored game being online.
  app.get('/live', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/health', (req, res) => {
    const isHealthy = lastQueryError === null && lastQueryResult !== null;
    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'ok' : 'error',
      config: {
        gameType: config.gameType,
        gameHost: config.gameHost,
        gamePort: config.gamePort
      },
      lastQuery: lastQueryResult ? {
        name: lastQueryResult.name,
        map: lastQueryResult.map,
        players: lastQueryResult.numplayers ?? 0,
        maxPlayers: lastQueryResult.maxplayers
      } : null,
      lastError: lastQueryError
    });
  });

  app.get('/', (req, res) => {
    const gameType = escapeHtml(config.gameType);
    const gameHost = escapeHtml(config.gameHost);
    res.send(`
      <html>
        <head><title>Game Server Monitor</title></head>
        <body>
          <h1>Game Server Monitor</h1>
          <p>Monitoring ${gameType} server at ${gameHost}:${config.gamePort}</p>
          <ul>
            <li><a href="/metrics">Prometheus Metrics</a></li>
            <li><a href="/health">Health Check</a></li>
          </ul>
          <h2>Configuration</h2>
          <ul>
            <li>Game Type: ${gameType}</li>
            <li>Game Host: ${gameHost}</li>
            <li>Game Port: ${config.gamePort}</li>
            <li>HTTP Port: ${config.httpPort}</li>
          </ul>
        </body>
      </html>
    `);
  });

  return { app, register };
}

function start() {
  const config = loadConfig();
  const { app } = createMonitor({ config });
  const server = app.listen(config.httpPort, () => {
    console.log(`Game Server Monitor listening on port ${config.httpPort}`);
    console.log(`Monitoring ${config.gameType} server at ${config.gameHost}:${config.gamePort}`);
    console.log(`Metrics available at http://localhost:${config.httpPort}/metrics`);
  });

  function gracefulShutdown(signal) {
    console.log(`\nReceived ${signal}. Shutting down gracefully...`);
    const timeout = setTimeout(() => {
      console.error('Forced shutdown after timeout.');
      process.exit(1);
    }, 10000);
    server.close(error => {
      clearTimeout(timeout);
      if (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
      }
      console.log('Shutdown complete.');
      process.exit(0);
    });
  }

  process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.once('SIGINT', () => gracefulShutdown('SIGINT'));
}

if (require.main === module) {
  try {
    start();
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { createMonitor, loadConfig };
