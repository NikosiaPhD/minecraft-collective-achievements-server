import json
import threading
from queue import Queue
from flask import Flask, Response, request, render_template_string, jsonify


FALLBACK_ICON = "https://minecraft.wiki/images/Invicon_Grass_Block.png"


# 1. --- Basic Flask App Setup ---
app = Flask(__name__)

# 2. --- In-Memory Data Storage (Thread-Safe) ---
# We use a lock to ensure that our shared data is not corrupted by concurrent requests.
lock = threading.Lock()

# Task metadata lookup - maps simple task IDs to complete task information
# Load task metadata from data.json at startup
with open("data.json", "r", encoding="utf-8") as f:
    TASK_METADATA = json.load(f)

# The actual to-do list with augmented format
augmented_task_list = {
    "setup": {"done": True, "name": "Setup", "icon": FALLBACK_ICON, "description": ""},
    "design": {"done": False, "name": "Design", "icon": FALLBACK_ICON, "description": ""},
    "frontend": {"done": False, "name": "Frontend", "icon": FALLBACK_ICON, "description": ""},
    "backend": {"done": True, "name": "Backend", "icon": FALLBACK_ICON, "description": ""},
    "testing": {"done": False, "name": "Testing", "icon": FALLBACK_ICON, "description": ""},
    "deployment": {"done": False, "name": "Deployment", "icon": FALLBACK_ICON, "description": ""},
    "documentation": {"done": False, "name": "Documentation", "icon": FALLBACK_ICON, "description": ""},
    "review": {"done": False, "name": "Review", "icon": FALLBACK_ICON, "description": ""}
}

# Store the title separately
project_title = "Progress Tracker"

def augment_task_data(task_data):
    """
    Convert task format {"taskId": {"done": boolean, "description": string}} to complete format
    {"taskId": {"done": boolean, "name": string, "icon": string, "description": string}}
    """
    augmented_tasks = {}
    for task_id, task_info in task_data.items():
        # Extract the actual task name by removing domain qualifier
        display_name = task_id.split(":")[-1] if ":" in task_id else task_id
        
        if task_id in TASK_METADATA:
            augmented_tasks[task_id] = {
                "done": task_info["done"],
                "name": TASK_METADATA[task_id].get("name", display_name.title()),
                "icon": TASK_METADATA[task_id].get("icon", FALLBACK_ICON)
            }
            # Prioritize provided description, then metadata description, then empty
            if "description" in task_info and task_info["description"]:
                augmented_tasks[task_id]["description"] = task_info["description"]
            elif "description" in TASK_METADATA[task_id]:
                augmented_tasks[task_id]["description"] = TASK_METADATA[task_id]["description"]
            else:
                augmented_tasks[task_id]["description"] = ""
        else:
            # Fallback for unknown tasks
            augmented_tasks[task_id] = {
                "done": task_info["done"],
                "name": display_name.title(),
                "icon": FALLBACK_ICON,
                "description": task_info.get("description", "")
            }
    return augmented_tasks


# A list to hold listener queues. Each connected client will have its own queue.
listeners = []

# 3. --- The Main HTML Page ---
# This serves the user-facing page with the necessary JavaScript.
# render_template_string is used to keep everything in one file.
@app.route('/')
def index():
    # The initial_data is passed to the template to render the list on first load,
    # so the user doesn't see a blank page before the first SSE event arrives.
    with lock:
        initial_data = json.dumps({
            "title": project_title,
            "tasks": augmented_task_list
        })

    with open("index.html", "r", encoding="utf-8") as f:
        html_template = f.read()

    # Replace the placeholder JavaScript variable with the current task list
    html_template = html_template.replace(
        "const initialTaskStatus = {};",
        f"const initialTaskStatus = {initial_data};"
    )
    
    return render_template_string(html_template)


# 4. --- The API Endpoint to Update the List ---
@app.route('/update', methods=['POST'])
def update_task_list():
    """
    This should be in the format 
    { "title" : title,
    "tasks" : { "task1": {"done": true, "description": "Task 1 description"}, "task2": {"done": false, "description": null}, ... } }
    """

    global augmented_task_list, project_title
    try:
        data = request.get_json()
        if not isinstance(data, dict):
            return jsonify({"error": "Invalid JSON format. Expected a dictionary."}), 400
        
        # Validate the structure
        if "title" not in data or "tasks" not in data:
            return jsonify({"error": "Missing 'title' or 'tasks' in request data."}), 400
            
    except Exception:
        return jsonify({"error": "Malformed JSON."}), 400

    with lock:
        # Update the title
        project_title = data["title"]
        
        # Store the augmented task data directly
        augmented_task_list = augment_task_data(data["tasks"])
        
        # Notify all listeners of the change
        message = json.dumps({
            "title": project_title,
            "tasks": augmented_task_list
        })
        for q in listeners:
            q.put(message)

    return jsonify({"status": "ok", "message": "Task list updated."})


# 5. --- The Server-Sent Events (SSE) Stream ---
# This is the endpoint the client connects to for real-time updates.
@app.route('/stream')
def stream():
    def event_stream():
        # Create a queue for this specific client
        q = Queue()
        # Add the queue to our list of listeners
        listeners.append(q)
        try:
            # Continuously check the queue for new messages
            while True:
                # The get() method blocks until an item is available
                message = q.get()
                # Yield the message in the SSE format
                yield f"data: {message}\n\n"
        finally:
            # When the client disconnects, remove their queue from the list
            listeners.remove(q)

    # Return a streaming response
    return Response(event_stream(), mimetype='text/event-stream')


if __name__ == '__main__':
    # Using threaded=True is important to handle concurrent requests:
    # one for the SSE stream and others for POSTing data.
    app.run(debug=True, threaded=True, port=5001)