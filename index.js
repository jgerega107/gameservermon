const express = require('express');
const promClient = require('prom-client');
const { GameDig, games } = require('gamedig');

// Get list of valid game types from gamedig
const validGameTypes = Object.keys(games);

// Configuration from environment variables with sanitization
function getRequiredEnvVar(name) {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    console.error(`Error: ${name} environment variable is required`);
    process.exit(1);
  }
  return value.trim();
}

function getOptionalEnvVar(name, defaultValue) {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    return defaultValue;
  }
  return value.trim();
}

// Validate required environment variables
const GAME_TYPE = getRequiredEnvVar('GAME_TYPE');
const GAME_HOST = getRequiredEnvVar('GAME_HOST');
const GAME_PORT_STR = getRequiredEnvVar('GAME_PORT');
const HTTP_PORT_STR = getOptionalEnvVar('HTTP_PORT', '9090');

// Validate GAME_TYPE is a valid gamedig game type
if (!validGameTypes.includes(GAME_TYPE)) {
  console.error(`Error: Invalid GAME_TYPE '${GAME_TYPE}'.`);
  console.error(`Valid game types include: ${validGameTypes.slice(0, 20).join(', ')}...`);
  console.error(`See https://github.com/gamedig/node-gamedig#games-list for the full list of supported games.`);
  process.exit(1);
}

// Validate and parse numeric environment variables
const GAME_PORT = parseInt(GAME_PORT_STR, 10);
if (isNaN(GAME_PORT) || GAME_PORT < 1 || GAME_PORT > 65535) {
  console.error(`Error: GAME_PORT must be a valid port number (1-65535), got '${GAME_PORT_STR}'`);
  process.exit(1);
}

const HTTP_PORT = parseInt(HTTP_PORT_STR, 10);
if (isNaN(HTTP_PORT) || HTTP_PORT < 1 || HTTP_PORT > 65535) {
  console.error(`Error: HTTP_PORT must be a valid port number (1-65535), got '${HTTP_PORT_STR}'`);
  process.exit(1);
}

// Create Express app
const app = express();

// Create a Registry to register metrics
const register = new promClient.Registry();

// Add default metrics (process, nodejs metrics)
promClient.collectDefaultMetrics({ register });

// Common labels for all game server metrics
const commonLabels = { host: GAME_HOST, port: GAME_PORT };

// Define custom metrics
const serverOnline = new promClient.Gauge({
  name: 'gameserver_online',
  help: 'Whether the game server is online (1) or offline (0)',
  labelNames: ['host', 'port'],
  registers: [register]
});

const playerCount = new promClient.Gauge({
  name: 'gameserver_players_current',
  help: 'Current number of players on the game server',
  labelNames: ['host', 'port'],
  registers: [register]
});

const maxPlayers = new promClient.Gauge({
  name: 'gameserver_players_max',
  help: 'Maximum number of players allowed on the game server',
  labelNames: ['host', 'port'],
  registers: [register]
});

const queryDuration = new promClient.Gauge({
  name: 'gameserver_query_duration_seconds',
  help: 'Time taken to query the game server in seconds',
  labelNames: ['host', 'port'],
  registers: [register]
});

const serverInfo = new promClient.Gauge({
  name: 'gameserver_info',
  help: 'Information about the game server',
  labelNames: ['host', 'port', 'game_type', 'server_name', 'map', 'version'],
  registers: [register]
});

const playerInfo = new promClient.Gauge({
  name: 'gameserver_player_info',
  help: 'Information about players on the server',
  labelNames: ['host', 'port', 'player_name'],
  registers: [register]
});

// Store last successful query result
let lastQueryResult = null;
let lastQueryError = null;
let lastQueryTime = 0;
let isQuerying = false;
const QUERY_CACHE_TTL = 5000; // 5 seconds cache to prevent duplicate queries

// Function to query game server
async function queryGameServer() {
  if (isQuerying) {
    // Another query is already in progress, wait for it
    return;
  }

  isQuerying = true;
  const startTime = Date.now();

  try {
    const result = await GameDig.query({
      type: GAME_TYPE,
      host: GAME_HOST,
      port: GAME_PORT
    });

    const duration = (Date.now() - startTime) / 1000;

    // Update metrics
    serverOnline.set(commonLabels, 1);
    queryDuration.set(commonLabels, duration);

    // Player counts
    const currentPlayers = result.numplayers || 0;
    const maxPlayerCount = result.maxplayers || 0;
    playerCount.set(commonLabels, currentPlayers);
    maxPlayers.set(commonLabels, maxPlayerCount);

    // Server info
    serverInfo.set(
      {
        ...commonLabels,
        game_type: GAME_TYPE,
        server_name: result.name || 'Unknown',
        map: result.map || 'Unknown',
        version: result.version || 'Unknown'
      },
      1
    );

    // Clear previous player info
    playerInfo.reset();

    // Player info
    if (result.players && result.players.length > 0) {
      result.players.forEach(player => {
        const playerName = player.name || 'Unknown';
        playerInfo.set({ ...commonLabels, player_name: playerName }, 1);
      });
    }

    lastQueryResult = result;
    lastQueryError = null;
  } catch (error) {
    console.error('Error querying game server:', error.message);

    // Mark server as offline
    serverOnline.set(commonLabels, 0);

    const duration = (Date.now() - startTime) / 1000;
    queryDuration.set(commonLabels, duration);

    // Remove player count metrics - don't show stale data when query fails
    playerCount.remove(commonLabels);
    maxPlayers.remove(commonLabels);
    playerInfo.reset();
    serverInfo.reset();

    lastQueryError = error.message;
  } finally {
    isQuerying = false;
  }
}

// Prometheus metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    // Query the game server on-demand when metrics are requested
    // Use cached result if query was done recently (within TTL)
    const now = Date.now();
    if (now - lastQueryTime > QUERY_CACHE_TTL) {
      lastQueryTime = now; // Set immediately to prevent race condition
      await queryGameServer();
    }

    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    res.status(500).end(error);
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  const isHealthy = lastQueryError === null && lastQueryResult !== null;
  const status = isHealthy ? 'ok' : 'error';
  const httpStatus = isHealthy ? 200 : 503;

  res.status(httpStatus).json({
    status: status,
    config: {
      gameType: GAME_TYPE,
      gameHost: GAME_HOST,
      gamePort: GAME_PORT
    },
    lastQuery: lastQueryResult ? {
      name: lastQueryResult.name,
      map: lastQueryResult.map,
      players: lastQueryResult.numplayers || 0,
      maxPlayers: lastQueryResult.maxplayers
    } : null,
    lastError: lastQueryError
  });
});

// Root endpoint with basic info
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><title>Game Server Monitor</title></head>
      <body>
        <h1>Game Server Monitor</h1>
        <p>Monitoring ${GAME_TYPE} server at ${GAME_HOST}:${GAME_PORT}</p>
        <ul>
          <li><a href="/metrics">Prometheus Metrics</a></li>
          <li><a href="/health">Health Check</a></li>
        </ul>
        <h2>Configuration</h2>
        <ul>
          <li>Game Type: ${GAME_TYPE}</li>
          <li>Game Host: ${GAME_HOST}</li>
          <li>Game Port: ${GAME_PORT}</li>
          <li>HTTP Port: ${HTTP_PORT}</li>
        </ul>
      </body>
    </html>
  `);
});

// Start the server
const server = app.listen(HTTP_PORT, () => {
  console.log(`Game Server Monitor listening on port ${HTTP_PORT}`);
  console.log(`Monitoring ${GAME_TYPE} server at ${GAME_HOST}:${GAME_PORT}`);
  console.log(`Metrics available at http://localhost:${HTTP_PORT}/metrics`);
});

// Graceful shutdown handler
function gracefulShutdown(signal) {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);

  // Force shutdown after 10 seconds if graceful shutdown fails
  const forceShutdownTimeout = setTimeout(() => {
    console.error('Forced shutdown after timeout.');
    process.exit(1);
  }, 10000);

  server.close((err) => {
    clearTimeout(forceShutdownTimeout);
    if (err) {
      console.error('Error during shutdown:', err);
      process.exit(1);
    }
    console.log('HTTP server closed.');
    console.log('Shutdown complete.');
    process.exit(0);
  });
}

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
