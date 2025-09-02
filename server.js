const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const EventEmitter = require('events');

const FALLBACK_ICON = "https://minecraft.wiki/images/Invicon_Grass_Block.png";

// 1. --- Basic Express App Setup ---
const app = express();
app.use(express.json());

// 2. --- In-Memory Data Storage ---
let CHALLENGE_METADATA = {};

// The actual challenge list with augmented format
let augmented_challenge_list = {
    "setup": {"done": true, "name": "This", "icon": FALLBACK_ICON, "description": "", "team": "Team A"},
    "design": {"done": true, "name": "Widget", "icon": FALLBACK_ICON, "description": "", "team": "Team B"},
    "frontend": {"done": true, "name": "Was", "icon": FALLBACK_ICON, "description": "", "team": "Team B"},
    "backend": {"done": false, "name": "Created", "icon": FALLBACK_ICON, "description": ""},
    "testing": {"done": false, "name": "By", "icon": FALLBACK_ICON, "description": ""},
    "deployment": {"done": false, "name": "NikosiaPhD", "icon": FALLBACK_ICON, "description": "nikosiaphd.github.io"},
    "documentation": {"done": false, "name": "on", "icon": FALLBACK_ICON, "description": ""},
    "review": {"done": false, "name": "Twitch", "icon": FALLBACK_ICON, "description": "twitch.tv/NikosiaPhD"}
};

// Store the challenge title separately
let challenge_title = "Minecraft Challenge Tracker";

// Default teams and colors
const DEFAULT_TEAM_COLORS = ["#229cc5", "#d1433b"];
const DEFAULT_TEAMS = [
    { name: "Team A", color: DEFAULT_TEAM_COLORS[0] },
    { name: "Team B", color: DEFAULT_TEAM_COLORS[1] }
];

// Store teams info
let TEAM_INFO = {
    teams: null
};

// Load challenge metadata from data.json at startup
async function loadChallengeMetadata() {
    try {
        const data = await fs.readFile("data.json", "utf-8");
        CHALLENGE_METADATA = JSON.parse(data);
        console.log("Challenge metadata loaded successfully");
    } catch (error) {
        console.error("Error loading challenge metadata:", error);
        CHALLENGE_METADATA = {};
    }
}

function augmentChallengeData(challengeData, teamInfo) {
    /**
     * Convert challenge format {"challengeId": {"done": boolean, "description": string, "team": string}} to complete format
     * {"challengeId": {"done": boolean, "name": string, "icon": string, "description": string, "team": string, "team_color": string}}
     */
    const augmentedChallenges = {};
    const teamColorMap = {};
    if (teamInfo && teamInfo.teams) {
        teamInfo.teams.forEach((team, idx) => {
            teamColorMap[team.name] = team.color || DEFAULT_TEAM_COLORS[idx % DEFAULT_TEAM_COLORS.length];
        });
    }

    for (const [challengeId, challengeInfo] of Object.entries(challengeData)) {
        // Extract the actual challenge name by removing domain qualifier
        const displayName = challengeId.includes(":") ? challengeId.split(":").pop() : challengeId;
        
        let augmented = null;
        if (challengeId in CHALLENGE_METADATA) {
            augmented = {
                "done": challengeInfo.done,
                "name": CHALLENGE_METADATA[challengeId].name || toTitleCase(displayName),
                "icon": CHALLENGE_METADATA[challengeId].icon || FALLBACK_ICON
            };
            
            // Prioritize provided description, then metadata description, then empty
            if (challengeInfo.description && challengeInfo.description.trim()) {
                augmented.description = challengeInfo.description;
            } else if (CHALLENGE_METADATA[challengeId].description) {
                augmented.description = CHALLENGE_METADATA[challengeId].description;
            } else {
                augmented.description = "";
            }
        } else {
            // Fallback for unknown challenges
            augmented = {
                "done": challengeInfo.done,
                "name": toTitleCase(displayName),
                "icon": FALLBACK_ICON,
                "description": challengeInfo.description || ""
            };
        }
        // Team info
        if (challengeInfo.team && teamColorMap[challengeInfo.team]) {
            augmented.team = challengeInfo.team;
            augmented.team_color = teamColorMap[challengeInfo.team];
        } else {
            augmented.team = "";
            augmented.team_color = "";
        }
        augmentedChallenges[challengeId] = augmented;
    }
    
    return augmentedChallenges;
}

// Helper function to convert string to title case
function toTitleCase(str) {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// EventEmitter for SSE instead of Queue system
const challengeUpdates = new EventEmitter();

// 3. --- The Main HTML Page ---
// This serves the user-facing page with the necessary JavaScript.
app.get('/', async (req, res) => {
    try {
        // The initial_data is passed to the template to render the list on first load,
        // so the user doesn't see a blank page before the first SSE event arrives.
        const initialData = JSON.stringify({
            "title": challenge_title,
            "challenges": augmented_challenge_list,
            "teams": TEAM_INFO.teams
        });

        const htmlTemplate = await fs.readFile("index.html", "utf-8");

        // Replace the placeholder JavaScript variable with the current challenge list
        const html = htmlTemplate.replace(
            "const initialChallengeStatus = {};",
            `const initialChallengeStatus = ${initialData};`
        );
        
        res.send(html);
    } catch (error) {
        console.error("Error serving index page:", error);
        res.status(500).send("Error loading page");
    }
});

// 4. --- The API Endpoint to Update the List ---
app.post('/update', (req, res) => {
    /**
     * This should be in the format 
     * { "title" : title,
     * "challenges" : { "challenge1": {"done": true, "description": "Challenge 1 description"}, "challenge2": {"done": false, "description": null}, ... } }
     */
    
    try {
        const data = req.body;

        console.log("Received update:", data);

        if (!data || typeof data !== 'object') {
            return res.status(400).json({"error": "Invalid JSON format. Expected a dictionary."});
        }
        
        // Validate the structure
        if (!("title" in data) || !("challenges" in data)) {
            return res.status(400).json({"error": "Missing 'title' or 'challenges' in request data."});
        }
        
        // Handle teams
        if ("teams" in data && Array.isArray(data.teams) && data.teams.length === 2) {
            // Each team: { name, color }
            TEAM_INFO.teams = data.teams.map((team, idx) => ({
                name: team.name || DEFAULT_TEAMS[idx].name,
                color: team.color || DEFAULT_TEAM_COLORS[idx % DEFAULT_TEAM_COLORS.length]
            }));
        } else {
            TEAM_INFO.teams = null;
        }

        // Update the title
        challenge_title = data.title;
        
        // Store the augmented challenge data directly
        augmented_challenge_list = augmentChallengeData(data.challenges, TEAM_INFO);
        
        // Notify all listeners of the change
        const message = JSON.stringify({
            "title": challenge_title,
            "challenges": augmented_challenge_list,
            "teams": TEAM_INFO.teams
        });
        
        challengeUpdates.emit('update', message);
        
        return res.json({"status": "ok", "message": "Challenge list updated."});
        
    } catch (error) {
        console.error("Error updating challenge list:", error);
        return res.status(400).json({"error": "Malformed JSON."});
    }
});

// 5. --- The Server-Sent Events (SSE) Stream ---
// This is the endpoint the client connects to for real-time updates.
app.get('/stream', (req, res) => {
    // Set SSE headers
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
    });
    
    // Send initial heartbeat
    res.write('data: connected\n\n');
    
    // Listen for updates
    const updateHandler = (message) => {
        res.write(`data: ${message}\n\n`);
    };
    
    challengeUpdates.on('update', updateHandler);
    
    // Cleanup on client disconnect
    req.on('close', () => {
        challengeUpdates.removeListener('update', updateHandler);
        console.log('Client disconnected from SSE stream');
    });
    
    req.on('error', (error) => {
        console.error('SSE stream error:', error);
        challengeUpdates.removeListener('update', updateHandler);
    });
});

// Start server
const PORT = process.env.PORT || 8080;

async function startServer() {
    // Load challenge metadata before starting the server
    await loadChallengeMetadata();
    
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
        console.log('Press Ctrl+C to stop the server');
    });
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\nReceived SIGINT. Graceful shutdown...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\nReceived SIGTERM. Graceful shutdown...');
    process.exit(0);
});

// Start the server
startServer().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
});
