# gameservermon

Game server monitor that utilizes node-gamedig to provide valuable Prometheus metrics about a running game server.

## Overview

This is a lightweight Node.js application designed to run as a container sidecar that monitors game servers and exposes Prometheus metrics. It uses the [gamedig](https://github.com/gamedig/node-gamedig) library to query game servers and provides detailed metrics about server status, player information, and performance.

## Features

- **Server Status Monitoring**: Track whether your game server is online or offline
- **Player Metrics**: Monitor current player count, maximum players, and individual player names
- **Server Information**: Expose server name, map, game type, and version
- **Query Performance**: Track query response times
- **Prometheus Integration**: Standard Prometheus metrics endpoint for easy scraping
- **Health Check Endpoint**: Simple health check for container orchestration
- **Multi-Game Support**: Supports all game types supported by node-gamedig (Minecraft, CS:GO, ARK, Rust, etc.)

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

| Variable | Description | Default |
|----------|-------------|---------|
| `GAME_TYPE` | Type of game server (see [supported games](https://github.com/gamedig/node-gamedig#games-list)) | `minecraft` |
| `GAME_HOST` | Hostname or IP of the game server | `localhost` |
| `GAME_PORT` | Port of the game server | `25565` |
| `SCRAPE_INTERVAL` | How often to query the server (in milliseconds) | `30000` (30s) |
| `HTTP_PORT` | Port for the HTTP metrics server | `9090` |

## Usage

### Running Locally

1. Install dependencies:
```bash
npm install
```

2. Set environment variables and run:
```bash
export GAME_TYPE=minecraft
export GAME_HOST=your-server.com
export GAME_PORT=25565
npm start
```

3. Access metrics at `http://localhost:9090/metrics`

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

### Running as a Kubernetes Sidecar

Example pod configuration with a game server and monitoring sidecar:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: minecraft-server
  labels:
    app: minecraft
spec:
  containers:
  - name: minecraft
    image: itzg/minecraft-server
    ports:
    - containerPort: 25565
    env:
    - name: EULA
      value: "TRUE"
  
  - name: monitor
    image: gameservermon:latest
    ports:
    - containerPort: 9090
      name: metrics
    env:
    - name: GAME_TYPE
      value: "minecraft"
    - name: GAME_HOST
      value: "localhost"
    - name: GAME_PORT
      value: "25565"
    - name: SCRAPE_INTERVAL
      value: "30000"
```

### Prometheus Configuration

Add the following to your Prometheus scrape configuration:

```yaml
scrape_configs:
  - job_name: 'gameservers'
    static_configs:
      - targets: ['gameserver-monitor:9090']
```

Or use Kubernetes service discovery with pod annotations:

```yaml
annotations:
  prometheus.io/scrape: "true"
  prometheus.io/port: "9090"
  prometheus.io/path: "/metrics"
```

## Endpoints

- `GET /` - Basic information page
- `GET /metrics` - Prometheus metrics endpoint
- `GET /health` - Health check endpoint with current server status

## Supported Games

This monitor supports all games that node-gamedig supports. Popular examples include:

- Minecraft (Java & Bedrock)
- Counter-Strike: Global Offensive
- ARK: Survival Evolved
- Rust
- Team Fortress 2
- Valheim
- 7 Days to Die
- And many more...

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
- **prom-client** - Prometheus metrics library
- **@gamedig/node-gamedig** - Game server query library

## License

MIT
