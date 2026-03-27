# OpenClaw Adapter Setup

This guide walks through connecting the OpenClaw adapter to your OpenClaw gateway. The adapter uses WebSocket JSON-RPC with signed device authentication (V3 protocol).

## Prerequisites

- OpenClaw installed and gateway running
- Node.js 18+

Check that the gateway is running:

```bash
openclaw gateway status
```

You should see something like:

```
Service: systemd (enabled)
Runtime: running
Listening: 127.0.0.1:18789
```

If it's not running: `openclaw gateway start`

### Remote access (Tailscale / LAN)

If Lattice runs on a different machine than the OpenClaw gateway, the gateway must not be bound to loopback only:

```bash
# Check current bind mode
openclaw config get gateway.bind

# Allow LAN/Tailscale connections
openclaw config set gateway.bind lan
openclaw gateway restart
```

After restart, `openclaw gateway status` should show `Listening: *:18789` instead of `127.0.0.1:18789`.

Update the `gatewayUrl` in `lattice.config.json` to match (e.g., your Tailscale IP):

```json
"openclaw": {
  "gatewayUrl": "http://<YOUR_HOST_IP>:18789"
}
```

## Step 1: Get the gateway token

The gateway token authenticates the WebSocket connection itself.

```bash
openclaw config get gateway.auth.token
```

This prints the token directly, e.g.:

```
aee3b16240377c4bec60e61a1d96c5a5e37c4462bdbeac1d
```

You can also find it in `~/.openclaw/openclaw.json` under `gateway.auth.token`:

```bash
jq -r '.gateway.auth.token' ~/.openclaw/openclaw.json
```

Export it:

```bash
export OPENCLAW_GATEWAY_TOKEN="$(openclaw config get gateway.auth.token)"
```

## Step 2: Get the device token

The device token is a scoped operator token tied to a specific device identity. It carries the permissions that determine what the adapter can do.

### Find your device ID

```bash
openclaw devices list --json
```

Output:

```json
[
  {
    "deviceId": "d7a4dd4e...",
    "role": "operator",
    "scopes": ["operator.read", "operator.write"]
  }
]
```

If no device exists yet, running `openclaw devices list` will usually create the device identity automatically.

### Rotate a scoped token

Use the device ID from above. The `--scope` flags set what permissions the token carries:

```bash
openclaw devices rotate \
  --device <DEVICE_ID> \
  --role operator \
  --scope operator.admin \
  --scope operator.read \
  --scope operator.write \
  --scope operator.approvals \
  --url ws://127.0.0.1:18789 \
  --token "$(openclaw config get gateway.auth.token)" \
  --json
```

Output:

```json
{
  "deviceId": "d7a4dd4e...",
  "role": "operator",
  "token": "BbEU26iU8T0r3f0X73yHWML_Erdy2q99YauQm1EcJrA",
  "scopes": [
    "operator.admin",
    "operator.approvals",
    "operator.read",
    "operator.write"
  ],
  "rotatedAtMs": 1774589748667
}
```

The `token` field is your `OPENCLAW_DEVICE_TOKEN`. Export it:

```bash
export OPENCLAW_DEVICE_TOKEN="BbEU26iU8T0r3f0X73yHWML_Erdy2q99YauQm1EcJrA"
```

> The device token is not consumed on connection -- you don't need to rotate on every restart.

## Step 3: Set up the device identity file

The adapter needs an Ed25519 keypair to sign the connect handshake. OpenClaw stores this at:

```
~/.openclaw/identity/device.json
```

Verify it exists:

```bash
ls -l ~/.openclaw/identity/device.json
```

If it doesn't exist, running any device command (like `openclaw devices list`) typically creates it automatically.

Copy or symlink it into the Lattice project root as `.openclaw-device.json`:

```bash
cp ~/.openclaw/identity/device.json /path/to/lattice/.openclaw-device.json
```

The file should look like:

```json
{
  "deviceId": "d7a4dd4e...",
  "publicKeyPem": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----\n",
  "privateKeyPem": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "platform": "linux"
}
```

> **Important:** The `platform` field must match the platform where the device was originally paired. If you paired on Linux, it must say `"linux"` even if you later run Lattice on macOS.

The identity file path is configured in `lattice.config.json`:

```json
"openclaw": {
  "deviceIdentityPath": ".openclaw-device.json"
}
```

## Step 4: Start Lattice

With both env vars exported and the device identity file in place:

```bash
export OPENCLAW_GATEWAY_TOKEN="<your-gateway-token>"
export OPENCLAW_DEVICE_TOKEN="<your-device-token>"
npm start
```

You should see:

```
  Adapters:
  ...
  ✓ openclaw        ready
```

If it shows `⚠ openclaw` instead, check the error message -- it usually indicates a missing env var or unreachable gateway.

## Troubleshooting

### "OPENCLAW_GATEWAY_TOKEN and OPENCLAW_DEVICE_TOKEN not set"

The env vars aren't reaching the relay process. Make sure they're exported in the same shell where you run `npm start`:

```bash
echo $OPENCLAW_GATEWAY_TOKEN  # should print the token
echo $OPENCLAW_DEVICE_TOKEN   # should print the token
```

### "Gateway auth failed" or connection rejected

- Verify the gateway is running: `openclaw gateway status`
- Check the gateway URL in `lattice.config.json` matches where the gateway is actually listening
- If connecting remotely, make sure `gateway.bind` is set to `lan`
- Whitespace in token values can cause auth failures -- make sure there are no trailing spaces or newlines

### "connect.challenge missing nonce" or timeout

The WebSocket endpoint might be wrong. The correct path is the root (`ws://host:18789`), **not** `ws://host:18789/ws`.

### OpenClaw shows as "offline" after startup

The health check runs on connect. If auth succeeds but the health check fails, openclaw registers but shows offline. Check the relay logs for the specific reason.

### Platform mismatch

If the `platform` in `.openclaw-device.json` doesn't match the platform where the device was paired, the signature verification will fail. The `platform` field is part of the signed payload.

## Quick reference

```bash
# Get gateway token
openclaw config get gateway.auth.token

# List devices
openclaw devices list --json

# Rotate device token with operator scopes
openclaw devices rotate \
  --device <DEVICE_ID> \
  --role operator \
  --scope operator.admin \
  --scope operator.read \
  --scope operator.write \
  --scope operator.approvals \
  --url ws://127.0.0.1:18789 \
  --token "$(openclaw config get gateway.auth.token)" \
  --json

# Check device identity file
jq '{deviceId, publicKeyPem}' ~/.openclaw/identity/device.json

# Allow remote connections
openclaw config set gateway.bind lan
openclaw gateway restart
```
