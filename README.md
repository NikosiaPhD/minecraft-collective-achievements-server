
# Collective Minecraft Achievements Server

This is a simple python server that receives updates from the [**Collective Minecraft Achievements Plugin**](https://github.com/NikosiaPhD/minecraft-collective-achievements-plugin) and creates a visual list that can be shown in OBS.

It is a lot trickier to set up and not necessary if you are happy with tracking progress just in minecraft chat.


## Setup

Clone this repo to a VM, then start the server with Node:
- `npm install`
- `npm run dev` or `npm start`

to make sure this runs even if SSH connection is severed, do

```
npm install -g pm2
pm2 start server.js
pm2 save
pm2 startup
```

put the IP/URL of your server with `http:` and port 8080 into OBS and with `/update` into the minecraft plugin (with the `/ca url` command)


## Sending Updates Specification

This is only a technical note for myself; this is what the Minecraft plugin needs to send to this server as a PUT request to `/update`.

If `teams` is not provided, the widget renders the tasks in regular single player mode.

```json
{
  "title": "string", // The title for the challenge tracker
  "challenges": { // Dictionary of challenges
    "challengeId1": {
      "done": true, // Boolean: whether the challenge is completed
      "description": "string", // Optional: description of the challenge
      "team": "string" // Optional: team name assigned to the challenge
    },
    "challengeId2": {
      "done": false,
      "description": "string",
      "team": "string"
    }
    // ... more challenges
  },
  "teams": [  // Optional: array of two teams
    {
      "name": "Team A", // Team name
      "color": "#229cc5" // Team color (hex code)
    },
    {
      "name": "Team B",
      "color": "#d1433b"
    }
  ]
}
```


## Contact, Future Plans, etc.

You are free to use and modify this for your own stream. Instead of sharing the code with anyone ("redistribution"), refer them to this github repository. 

Feel free to contact me with suggestions or questions.

Features I might add at some point:
- more than 2 teams
- use TextFit to fit longer achievement titles, requirement names, or descriptions
- add confetti particles when something gets unlocked