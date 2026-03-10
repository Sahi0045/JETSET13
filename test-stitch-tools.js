/**
 * Test script for refactored Stitch MCP server.
 * Handles the initialize handshake and session ID tracking.
 */
async function testStitchTools() {
    const MCP_URL = "http://localhost:8080/mcp";
    let sessionId = null;

    async function callRaw(payload) {
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream'
        };
        if (sessionId) {
            headers['mcp-session-id'] = sessionId;
        }

        const response = await fetch(MCP_URL, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        });

        if (response.headers.has('mcp-session-id')) {
            sessionId = response.headers.get('mcp-session-id');
        }

        const data = await response.json();
        return data;
    }

    try {
        console.log("--- 1. Initializing Session ---");
        const initResponse = await callRaw({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
                protocolVersion: "2024-11-05",
                capabilities: {},
                clientInfo: { name: "test-client", version: "1.0.0" }
            }
        });
        console.log("Init Response:", JSON.stringify(initResponse, null, 2));
        console.log("Assigned Session ID:", sessionId);

        if (!sessionId) {
            throw new Error("Failed to obtain session ID");
        }

        console.log("\n--- 2. Listing Tools ---");
        const listResponse = await callRaw({
            jsonrpc: "2.0",
            id: 2,
            method: "tools/list",
            params: {}
        });
        console.log("Tools List:", JSON.stringify(listResponse, null, 2));

        console.log("\n--- 3. Testing Tool: stitch_get_project ---");
        const projectResponse = await callRaw({
            jsonrpc: "2.0",
            id: 3,
            method: "tools/call",
            params: {
                name: "stitch_get_project",
                arguments: {}
            }
        });
        console.log("Project Details:", JSON.stringify(projectResponse, null, 2));

        console.log("\n--- 4. Testing Tool: stitch_list_screens ---");
        const screensResponse = await callRaw({
            jsonrpc: "2.0",
            id: 4,
            method: "tools/call",
            params: {
                name: "stitch_list_screens",
                arguments: {}
            }
        });
        console.log("Screens List Summary:", screensResponse.result.content[0].text.substring(0, 500) + "...");

        console.log("\n--- 5. Testing Tool: stitch_get_screen ---");
        const screenResponse = await callRaw({
            jsonrpc: "2.0",
            id: 5,
            method: "tools/call",
            params: {
                name: "stitch_get_screen",
                arguments: {
                    screen_id: "c94e8a91afcb438f86d406faf1432000"
                }
            }
        });
        console.log("Single Screen Details:", JSON.stringify(screenResponse, null, 2));

    } catch (error) {
        console.error("❌ Test failed:", error.message);
    }
}

testStitchTools();
