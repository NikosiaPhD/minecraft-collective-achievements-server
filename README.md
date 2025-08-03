
# Collective Minecraft Achievements Server

This is a simple python server that receives updates from the **Collective Minecraft Achievements Plugin** (TODO: add link) and creates a visual list that can be shown in OBS.

It is a lot trickier to set up and not necessary if you are happy with tracking progress just in minecraft chat.


## Setup

Clone this repo to a VM, then start the server with

- either Python:
    - install dependencies
    - `python server.py`

- or Node:
    - `npm install`
    - `npm run dev` or `npm start`

to make sure this runs even if SSH connection is severed, do

`nohup node server.js > out.log 2>&1 &`

or

```
npm install -g pm2
pm2 start server.js
pm2 save
pm2 startup
```

put the URL with :8080 into OBS and with :8080/update into the minecraft plugin (with the `/ca url` command)

## Contact, Future Plans, etc.

You are free to use and modify this for your own stream. Instead of sharing the code with anyone ("redistribution"), refer them to this github repository. 

Feel free to contact me with suggestions or questions.

Features I want to add at some point:
- use TextFit to fit longer achievement titles, requirement names, or descriptions
- add confetti particles when something gets unlocked