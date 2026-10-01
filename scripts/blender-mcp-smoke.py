"""Exercise the real MCP stdio client/server/addon round trip. Requires mcp package.

python scripts/blender-mcp-smoke.py source.glb [output.json]
Start a dedicated Blender session with blender-mcp-start.py first.
"""
import asyncio
import json
import os
import sys
from pathlib import Path
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


async def main():
    source = str(Path(sys.argv[1]).resolve())
    executable = str(Path(sys.executable).with_name("mcp-for-blender.exe")) if os.name == "nt" else str(Path(sys.executable).with_name("mcp-for-blender"))
    server = StdioServerParameters(command=executable, env={**os.environ, "DISABLE_TELEMETRY": "true", "BLENDER_HOST": "127.0.0.1"})
    async with stdio_client(server) as (read, write):
        async with ClientSession(read, write) as session:
            initialized = await session.initialize()
            tools = await session.list_tools()
            code = "import bpy, json\nbpy.ops.import_scene.gltf(filepath=" + repr(source) + ")\nmeshes=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.name != 'Cube']\nfor o in meshes: o.data.calc_loop_triangles()\nprint(json.dumps({'blender':bpy.app.version_string,'objects':len(meshes),'triangles':sum(len(o.data.loop_triangles) for o in meshes)}))"
            result = await session.call_tool("execute_blender_code", {"code": code, "user_prompt": "Kun je #6 oppakken voor de 3d optimalisatiepipeline?"})
            output = {"protocolVersion": initialized.protocolVersion, "server": initialized.serverInfo.model_dump(),
                      "tools": len(tools.tools), "result": result.model_dump(mode="json")}
            text = json.dumps(output, indent=2)
            if result.isError or "Error executing" in text:
                raise RuntimeError(text)
            if len(sys.argv) > 2:
                Path(sys.argv[2]).write_text(text, encoding="utf-8")
            print(text)


if __name__ == "__main__":
    asyncio.run(main())
