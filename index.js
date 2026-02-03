const express = require('express');
const promClient = require('prom-client');
const { GameDig } = require('gamedig');

// Configuration from environment variables
const GAME_TYPE = process.env.GAME_TYPE || 'minecraft';
const GAME_HOST = process.env.GAME_HOST || 'localhost';
const GAME_PORT = process.env.GAME_PORT ? parseInt(process.env.GAME_PORT) : 25565;
const HTTP_PORT = process.env.HTTP_PORT ? parseInt(process.env.HTTP_PORT) : 9090;

// Create Express app
const app = express();

// Create a Registry to register metrics
const register = new promClient.Registry();

// Add default metrics (process, nodejs metrics)
promClient.collectDefaultMetrics({ register });

// Define custom metrics
const serverOnline = new promClient.Gauge({
  name: 'gameserver_online',
  help: 'Whether the game server is online (1) or offline (0)',
  registers: [register]
});

const playerCount = new promClient.Gauge({
  name: 'gameserver_players_current',
  help: 'Current number of players on the game server',
  registers: [register]
});

const maxPlayers = new promClient.Gauge({
  name: 'gameserver_players_max',
  help: 'Maximum number of players allowed on the game server',
  registers: [register]
});

const queryDuration = new promClient.Gauge({
  name: 'gameserver_query_duration_seconds',
  help: 'Time taken to query the game server in seconds',
  registers: [register]
});

const serverInfo = new promClient.Gauge({
  name: 'gameserver_info',
  help: 'Information about the game server',
  labelNames: ['game_type', 'server_name', 'map', 'version'],
  registers: [register]
});

const playerInfo = new promClient.Gauge({
  name: 'gameserver_player_info',
  help: 'Information about players on the server',
  labelNames: ['player_name'],
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
    serverOnline.set(1);
    queryDuration.set(duration);

    // Player counts
    const currentPlayers = result.players ? result.players.length : 0;
    const maxPlayerCount = result.maxPlayers || 0;
    playerCount.set(currentPlayers);
    maxPlayers.set(maxPlayerCount);

    // Server info
    serverInfo.set(
      {
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
        playerInfo.set({ player_name: playerName }, 1);
      });
    }

    lastQueryResult = result;
    lastQueryError = null;
  } catch (error) {
    console.error('Error querying game server:', error.message);

    // Mark server as offline
    serverOnline.set(0);

    const duration = (Date.now() - startTime) / 1000;
    queryDuration.set(duration);

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
  res.json({
    status: 'ok',
    config: {
      gameType: GAME_TYPE,
      gameHost: GAME_HOST,
      gamePort: GAME_PORT
    },
    lastQuery: lastQueryResult ? {
      name: lastQueryResult.name,
      map: lastQueryResult.map,
      players: lastQueryResult.players ? lastQueryResult.players.length : 0,
      maxPlayers: lastQueryResult.maxPlayers
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
app.listen(HTTP_PORT, () => {
  console.log(`Game Server Monitor listening on port ${HTTP_PORT}`);
  console.log(`Monitoring ${GAME_TYPE} server at ${GAME_HOST}:${GAME_PORT}`);
  console.log(`Metrics available at http://localhost:${HTTP_PORT}/metrics`);
});
