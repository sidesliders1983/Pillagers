"""Start the community addon in an isolated Blender session, without changing preferences.

blender --factory-startup --python scripts/blender-mcp-start.py -- tools/mcp-for-blender/addon.py
"""
import importlib.util
import sys
from pathlib import Path

import bpy

addon_path = Path(sys.argv[sys.argv.index("--") + 1]).resolve()
spec = importlib.util.spec_from_file_location("pillagers_blender_mcp", addon_path)
addon = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = addon
spec.loader.exec_module(addon)
addon.register()
server = addon.BlenderMCPServer(host="127.0.0.1", port=9876)
bpy.types.blendermcp_server = server
server.start()
bpy.context.scene.blendermcp_server_running = True
print("PILLAGERS_MCP_READY", flush=True)
