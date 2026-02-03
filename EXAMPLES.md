# Example Usage

This document provides practical examples of using the Game Server Monitor.

## Quick Start Example

### 1. Running Locally with Node.js

```bash
# Install dependencies
npm install

# Monitor a Minecraft server
export GAME_TYPE=minecraft
export GAME_HOST=mc.example.com
export GAME_PORT=25565
npm start

# Access the metrics at http://localhost:9090/metrics
```

### 2. Running with Docker

```bash
# Build the image
docker build -t gameservermon .

# Run monitoring a CS:GO server
docker run -d \
  --name csgo-monitor \
  -e GAME_TYPE=csgo \
  -e GAME_HOST=csgo.example.com \
  -e GAME_PORT=27015 \
  -p 9090:9090 \
  gameservermon
  
# Check the health
curl http://localhost:9090/health

# View metrics
curl http://localhost:9090/metrics
```

### 3. Running with Docker Compose

The included `docker-compose.yml` provides a complete example with a Minecraft server:

```bash
# Start both Minecraft server and monitor
docker-compose up -d

# View monitor logs
docker-compose logs -f monitor

# Access metrics
curl http://localhost:9090/metrics

# Stop everything
docker-compose down
```

## Supported Game Types

Here are some popular game types you can monitor:

- `minecraft` - Minecraft (Java Edition)
- `minecraftbe` - Minecraft Bedrock Edition
- `csgo` - Counter-Strike: Global Offensive
- `rust` - Rust
- `ark` - ARK: Survival Evolved
- `valheim` - Valheim
- `7d2d` - 7 Days to Die
- `tf2` - Team Fortress 2
- `gmod` - Garry's Mod
- `squad` - Squad
- `insurgency` - Insurgency: Sandstorm

See the full list at: https://github.com/gamedig/node-gamedig#games-list

## Example Metrics Output

When monitoring a Minecraft server with 5 players, the `/metrics` endpoint will include:

```
# HELP gameserver_online Whether the game server is online (1) or offline (0)
# TYPE gameserver_online gauge
gameserver_online 1

# HELP gameserver_players_current Current number of players on the game server
# TYPE gameserver_players_current gauge
gameserver_players_current 5

# HELP gameserver_players_max Maximum number of players allowed on the game server
# TYPE gameserver_players_max gauge
gameserver_players_max 20

# HELP gameserver_query_duration_seconds Time taken to query the game server in seconds
# TYPE gameserver_query_duration_seconds gauge
gameserver_query_duration_seconds 0.234

# HELP gameserver_info Information about the game server
# TYPE gameserver_info gauge
gameserver_info{game_type="minecraft",server_name="My Server",map="world",version="1.20.1"} 1

# HELP gameserver_player_info Information about players on the server
# TYPE gameserver_player_info gauge
gameserver_player_info{player_name="Player1"} 1
gameserver_player_info{player_name="Player2"} 1
gameserver_player_info{player_name="Player3"} 1
gameserver_player_info{player_name="Player4"} 1
gameserver_player_info{player_name="Player5"} 1
```

## Prometheus Configuration

Add this to your Prometheus configuration:

```yaml
scrape_configs:
  - job_name: 'gameservers'
    scrape_interval: 30s
    static_configs:
      - targets: ['localhost:9090']
        labels:
          service: 'minecraft-server'
```

## Grafana Dashboard Queries

Example Prometheus queries for a Grafana dashboard:

### Player Count Over Time
```promql
gameserver_players_current
```

### Server Uptime (%)
```promql
avg_over_time(gameserver_online[24h]) * 100
```

### Average Response Time
```promql
avg_over_time(gameserver_query_duration_seconds[5m])
```

### Server Capacity Utilization (%)
```promql
(gameserver_players_current / gameserver_players_max) * 100
```

### Active Players List
```promql
gameserver_player_info
```

## Troubleshooting

### Monitor shows server offline
- Verify the game server is running and accessible
- Check firewall rules allow UDP/TCP traffic
- Confirm GAME_HOST and GAME_PORT are correct
- Some game servers may require additional configuration

### Metrics not appearing in Prometheus
- Verify Prometheus can reach the monitor endpoint
- Check Prometheus scrape configuration
- Ensure port 9090 is accessible
- Review Prometheus logs for scrape errors

### High query duration
- Game server may be overloaded
- Network latency between monitor and game server
