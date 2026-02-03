# Security

## Known Vulnerabilities

### fast-xml-parser (Transitive Dependency)

**Status**: Accepted Risk  
**Severity**: High  
**CVE**: GHSA-37qj-frw5-hhjh  
**Description**: fast-xml-parser has a RangeError DoS vulnerability related to numeric entities

**Affected Versions**: 4.3.6 - 5.3.3  
**Current Version**: Used by gamedig >= 5.3.0

**Mitigation**: 
- This vulnerability is in a transitive dependency (gamedig -> fast-xml-parser)
- The XML parser is used by gamedig to parse game server responses
- Since this application only queries trusted game servers configured by the administrator (not untrusted user input), the risk is minimal
- The application is designed to run as a container sidecar with limited network access
- The vulnerability requires specially crafted XML with malicious numeric entities, which is unlikely from legitimate game servers

**Workaround**:
- Use gamedig version 5.2.0 or earlier (breaking change)
- Monitor for updates to gamedig that include a patched version of fast-xml-parser

## Reporting Security Issues

If you discover a security issue in this project, please report it by opening a GitHub issue.

## Security Best Practices

When deploying this application:

1. **Limit Network Access**: Run the container with minimal network permissions
2. **Use Environment Variables**: Store sensitive configuration in environment variables, not in code
3. **Monitor Logs**: Regularly review application logs for unusual activity
4. **Keep Dependencies Updated**: Regularly check for and apply security updates
5. **Use Read-Only Filesystem**: Where possible, run the container with a read-only filesystem
6. **Run as Non-Root**: The Dockerfile should be updated to run as a non-root user in production

## Recommended Docker Security Flags

```bash
docker run -d \
  --read-only \
  --security-opt=no-new-privileges \
  --cap-drop=ALL \
  -e GAME_TYPE=minecraft \
  -e GAME_HOST=your-server.com \
  -e GAME_PORT=25565 \
  -p 9090:9090 \
  gameservermon
```
