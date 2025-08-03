const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const EventEmitter = require('events');

const FALLBACK_ICON = "https://minecraft.wiki/images/Invicon_Grass_Block.png";

// 1. --- Basic Express App Setup ---
const app = express();
app.use(express.json());

// 2. --- In-Memory Data Storage ---
// Node.js is single-threaded by nature, so no need for locks like Python's threading.Lock()
let TASK_METADATA = {};

// The actual to-do list with augmented format
let augmented_task_list = {
    "setup": {"done": true, "name": "Setup", "icon": FALLBACK_ICON, "description": ""},
    "design": {"done": false, "name": "Design", "icon": FALLBACK_ICON, "description": ""},
    "frontend": {"done": false, "name": "Frontend", "icon": FALLBACK_ICON, "description": ""},
    "backend": {"done": true, "name": "Backend", "icon": FALLBACK_ICON, "description": ""},
    "testing": {"done": false, "name": "Testing", "icon": FALLBACK_ICON, "description": ""},
    "deployment": {"done": false, "name": "Deployment", "icon": FALLBACK_ICON, "description": ""},
    "documentation": {"done": false, "name": "Documentation", "icon": FALLBACK_ICON, "description": ""},
    "review": {"done": false, "name": "Review", "icon": FALLBACK_ICON, "description": ""}
};

// Store the title separately
let project_title = "Progress Tracker";

// Load task metadata from data.json at startup
async function loadTaskMetadata() {
    try {
        const data = await fs.readFile("data.json", "utf-8");
        TASK_METADATA = JSON.parse(data);
        console.log("Task metadata loaded successfully");
    } catch (error) {
        console.error("Error loading task metadata:", error);
        TASK_METADATA = {};
    }
}

function augmentTaskData(taskData) {
    /**
     * Convert task format {"taskId": {"done": boolean, "description": string}} to complete format
     * {"taskId": {"done": boolean, "name": string, "icon": string, "description": string}}
     */
    const augmentedTasks = {};
    
    for (const [taskId, taskInfo] of Object.entries(taskData)) {
        // Extract the actual task name by removing domain qualifier
        const displayName = taskId.includes(":") ? taskId.split(":").pop() : taskId;
        
        if (taskId in TASK_METADATA) {
            augmentedTasks[taskId] = {
                "done": taskInfo.done,
                "name": TASK_METADATA[taskId].name || toTitleCase(displayName),
                "icon": TASK_METADATA[taskId].icon || FALLBACK_ICON
            };
            
            // Prioritize provided description, then metadata description, then empty
            if (taskInfo.description && taskInfo.description.trim()) {
                augmentedTasks[taskId].description = taskInfo.description;
            } else if (TASK_METADATA[taskId].description) {
                augmentedTasks[taskId].description = TASK_METADATA[taskId].description;
            } else {
                augmentedTasks[taskId].description = "";
            }
        } else {
            // Fallback for unknown tasks
            augmentedTasks[taskId] = {
                "done": taskInfo.done,
                "name": toTitleCase(displayName),
                "icon": FALLBACK_ICON,
                "description": taskInfo.description || ""
            };
        }
    }
    
    return augmentedTasks;
}

// Helper function to convert string to title case
function toTitleCase(str) {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// EventEmitter for SSE instead of Queue system
const taskUpdates = new EventEmitter();

// 3. --- The Main HTML Page ---
// This serves the user-facing page with the necessary JavaScript.
app.get('/', async (req, res) => {
    try {
        // The initial_data is passed to the template to render the list on first load,
        // so the user doesn't see a blank page before the first SSE event arrives.
        const initialData = JSON.stringify({
            "title": project_title,
            "tasks": augmented_task_list
        });

        const htmlTemplate = await fs.readFile("index.html", "utf-8");

        // Replace the placeholder JavaScript variable with the current task list
        const html = htmlTemplate.replace(
            "const initialTaskStatus = {};",
            `const initialTaskStatus = ${initialData};`
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
     * "tasks" : { "task1": {"done": true, "description": "Task 1 description"}, "task2": {"done": false, "description": null}, ... } }
     */
    
    try {
        const data = req.body;
        
        if (!data || typeof data !== 'object') {
            return res.status(400).json({"error": "Invalid JSON format. Expected a dictionary."});
        }
        
        // Validate the structure
        if (!("title" in data) || !("tasks" in data)) {
            return res.status(400).json({"error": "Missing 'title' or 'tasks' in request data."});
        }
        
        // Update the title
        project_title = data.title;
        
        // Store the augmented task data directly
        augmented_task_list = augmentTaskData(data.tasks);
        
        // Notify all listeners of the change
        const message = JSON.stringify({
            "title": project_title,
            "tasks": augmented_task_list
        });
        
        taskUpdates.emit('update', message);
        
        return res.json({"status": "ok", "message": "Task list updated."});
        
    } catch (error) {
        console.error("Error updating task list:", error);
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
    
    taskUpdates.on('update', updateHandler);
    
    // Cleanup on client disconnect
    req.on('close', () => {
        taskUpdates.removeListener('update', updateHandler);
        console.log('Client disconnected from SSE stream');
    });
    
    req.on('error', (error) => {
        console.error('SSE stream error:', error);
        taskUpdates.removeListener('update', updateHandler);
    });
});

// Start server
const PORT = process.env.PORT || 5001;

async function startServer() {
    // Load task metadata before starting the server
    await loadTaskMetadata();
    
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
