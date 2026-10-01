# gameservermon

Game server monitor that utilizes [node-gamedig](https://github.com/gamedig/node-gamedig) to provide Prometheus metrics about a running game server.

## Disclaimer
This tool was created with the assistance of AI tools, specifically Github Copilot.

## Features

- **Server Status Monitoring**: Track whether your game server is online or offline
- **Player Metrics**: Monitor current player count, maximum players, and individual player names
- **Server Information**: Expose server name, map, game type, and version
- **Health Check Endpoint**: Simple health check
- **Container Liveness**: Health checks keep the exporter healthy even when the game server is offline
- **Multi-Game Support**: Supports all game types supported by node-gamedig

## Prometheus Metrics

The following custom metrics are exposed:

- `gameserver_online` - Whether the game server is online (1) or offline (0)
- `gameserver_players_current` - Current number of players on the server
- `gameserver_players_max` - Maximum number of players allowed
- `gameserver_query_duration_seconds` - Time taken to query the server
- `gameserver_info{game_type, server_name, map, version}` - Server information as labels
- `gameserver_player_info{player_name}` - Individual player information

Additionally, default Node.js metrics are included (memory usage, CPU, etc.)

## Configuration

Configuration is done via environment variables:

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `GAME_TYPE` | Type of game server (see [supported games](https://github.com/gamedig/node-gamedig#games-list)) | Yes | - |
| `GAME_HOST` | Hostname or IP of the game server | Yes | - |
| `GAME_PORT` | Port of the game server | Yes | - |
| `HTTP_PORT` | Port for the HTTP metrics server | No | `9090` |

## Usage

### Running Locally

Requires Node.js 24 LTS when running outside Docker.

```bash
npm ci
GAME_TYPE=minecraft GAME_HOST=localhost GAME_PORT=25565 npm start
```

To run the example Minecraft server and monitor together:

1. Run the compose project locally. `docker compose up -d --build`

2. Access metrics at `http://localhost:9090/metrics`

### Running with Docker

Build the image:
```bash
docker build -t gameservermon .
```

Run the container:
```bash
docker run -d \
  -e GAME_TYPE=minecraft \
  -e GAME_HOST=your-server.com \
  -e GAME_PORT=25565 \
  -p 9090:9090 \
  gameservermon
```

### Prometheus Configuration

Add the following to your Prometheus scrape configuration:

```yaml
scrape_configs:
  - job_name: 'gameservers'
    static_configs:
      - targets: ['gameserver-monitor:9090']
```

## Endpoints

- `GET /` - Basic information page
- `GET /metrics` - Prometheus metrics endpoint
- `GET /health` - Health check endpoint with current server status
- `GET /live` - Exporter liveness endpoint, independent of game server availability

Game queries run on demand during `/metrics` scrapes. Concurrent scrapes wait for the same query, and results (including failures) are cached for five seconds after the query completes. `/health` returns `503` before the first scrape and after a failed query; `/live` remains `200` while the exporter is running.

## Automated Maintenance

Dependabot checks npm, Docker, Docker Compose, and GitHub Actions dependencies every Monday at 06:00 America/New_York. npm patch and minor upgrades are grouped; major upgrades are proposed separately. Security fixes are grouped separately and require Dependabot alerts and security updates to be enabled in the repository's **Settings → Advanced Security** page.

The Docker workflow tests and audits dependencies before publishing signed images to `ghcr.io/jgerega107/gameservermon`. It runs on changes to `main`, published releases, manual dispatch, and daily at **06:23 UTC** (02:23 EDT / 01:23 EST). Daily builds pull the current Node.js 24 Alpine base image and rebuild without layer caching.

- `latest` tracks successful builds from `main` and stable releases.
- `nightly` tracks the most recent scheduled build.
- Release tags, semantic version tags, and full Git commit tags are also published.
- Pull requests run tests, an npm vulnerability audit, and a Docker build without publishing or receiving registry/signing permissions.

Scheduled builds and the expanded Dependabot configuration take effect when these workflow files are on the default branch. GitHub can pause Dependabot after prolonged inactivity and scheduled workflows in inactive public repositories; check the repository's update and Actions pages if automation stops.

## Supported Games

This monitor supports all games that node-gamedig supports. Popular examples include:

- Minecraft (Java & Bedrock)
- Counter-Strike 2
- Team Fortress 2 (or any Source Engine game)
And more

See the [full list of supported games](https://github.com/gamedig/node-gamedig#games-list).

## Example Queries

Some useful Prometheus queries:

```promql
# Check if server is online
gameserver_online == 1

# Current player count
gameserver_players_current

# Player utilization percentage
(gameserver_players_current / gameserver_players_max) * 100

# Average query response time
avg_over_time(gameserver_query_duration_seconds[5m])

# List of all current players
gameserver_player_info
```

## Development

The application is built with:
- **Express.js** - HTTP server
- [**@prometheus-io/client**](https://github.com/prometheus/client_js) - Maintained Prometheus metrics library (formerly `prom-client`)
- [**node-gamedig**](https://github.com/gamedig/node-gamedig) - Game server query library

```bash
npm run check
npm test
npm audit --omit=dev
```

Tests use Node.js's built-in test runner and a local HTTP server with stubbed game queries, so no live game server is required.
