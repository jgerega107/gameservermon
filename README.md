# gameservermon

Game server monitor that utilizes node-gamedig to provide valuable Prometheus metrics about a running game server.

## Features

- **Server Status Monitoring**: Track whether your game server is online or offline
- **Player Metrics**: Monitor current player count, maximum players, and individual player names
- **Server Information**: Expose server name, map, game type, and version
- **Health Check Endpoint**: Simple health check
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
- **prom-client** - Prometheus metrics library
- **gamedig** - Game server query library
