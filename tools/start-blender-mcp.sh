#!/usr/bin/env bash
# Launch Blender with the MCP addon enabled and its socket server listening.
#
# The addon refuses to run in Blender's --background mode (it needs a GUI event
# loop to execute queued commands), so this opens a real Blender window. Leave
# it open for as long as you want Claude to be able to drive Blender.
set -euo pipefail

BLENDER="${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}"
BOOT="$(mktemp -t blender-mcp-boot).py"

cat > "$BOOT" <<'PY'
import bpy
bpy.ops.preferences.addon_enable(module='blender_mcp')
bpy.ops.blendermcp.start_server()
print("MCP server listening on localhost:9876", flush=True)
PY

echo "Starting Blender with the MCP server..."
exec "$BLENDER" --python "$BOOT"
