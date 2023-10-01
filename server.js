const static = require('node-static');
const http = require('http');
const WebSocket = require('ws');
const url = require('url');
const fs = require('fs');

const file = new static.Server('./public');

const server = http.createServer(
    function (request, response) {
        const pathname = url.parse(request.url).pathname;
        console.log('static', pathname);
        request.addListener('end', function () {
            file.serve(request, response);
        }).resume();
    }
);
const wss = new WebSocket.Server({ noServer: true });

server.on('upgrade', function (request, socket, head) {
    const pathname = url.parse(request.url).pathname;
    if (pathname === '/ws') {
        wss.handleUpgrade(request, socket, head, function done(ws) {
            wss.emit('connection', ws, request);
        });
    } else {
        socket.destroy();
    }
});

var clients = {};
fs.watch('./public', (eventType, filename) => {
    console.log("watch", eventType, filename);
    Object.values(clients).forEach(c => {
        c.ws.send(JSON.stringify({type: "reload"}));
    });
});

function genPosKey(p) {
    return p[0] + "_" + p[1];
}

var map = {};

var inputState = {};

function add(p1, p2) {
    return [
        p1[0] + p2[0],
        p1[1] + p2[1]
    ];
}

function updateState() {
    //trees
    var now = new Date();
    var newTrees = Object.keys(map).filter(k => 'tree' in map[k] && now - map[k].tree > 3000);
    var players = playerPositions();
    newTrees.forEach(k => {
        if (players[k]) {
            players[k].life = 0;
            players[k].deaths += 1;
        }
        delete map[k];
    });

    //input
    Object.keys(inputState).forEach(k => {
        let v = inputState[k];
        if (clients[k].life <= 0) {
            if (v == 'respawn') {
                Object.assign(clients[k], defaultClient());
            }
            delete inputState[k];
            return;
        }
        let crot = {
            'down': 0,
            'right': 1,
            'up': 2,
            'left': 3
        };
        let cmap = {
            'up': [0,-1],
            'down': [0,1],
            'left': [-1,0],
            'right': [1,0]
        };
        if (v in cmap) {
            var players = playerPositions();
            var newPos = add(clients[k].pos, cmap[v]);
            var newPosK = genPosKey(newPos);
            if (crot[v] != clients[k].rot) {
                //rotate
                clients[k].rot = crot[v];
            } else if (newPosK in players) {
                //attack player
                clients[k].attackAnimation = new Date().toJSON();
                var l = players[newPosK].life;
                players[newPosK].life = l <= 0 ? 0 : l-1;
                if (players[newPosK].life < 1) {
                    clients[k].kills += 10;
                    players[newPosK].deaths += 1;
                }
            } else if (! (newPosK in map)) {
                //attack tree
                clients[k].attackAnimation = new Date().toJSON();
                map[newPosK] = {state: 0};
            } else if (map[newPosK].state == 0) {
                //attack tree
                clients[k].attackAnimation = new Date().toJSON();
                clients[k].kills += 1;
                map[newPosK] = {state: 2};
            } else if (map[newPosK].state == 2) {
                //move
                clients[k].pos = newPos;
            } else {
                console.log("dont know how to updateState", map[newPosK]);
            }
        } else {
            console.log("unknown input for", k, v);
        }
        delete inputState[k];
    });
}

setInterval(updateState, 10);

function makeTree() {
    return {
        state: 0,
        rot: Math.floor(Math.random() * 4)
    };
}

function generateMap(players, pos) {
    let out = [];
    let size = 7;
    for (var y = -size; y <= size; y += 1) {
        out.push([]);
        for (var x = -size; x <= size; x += 1) {
            var k = genPosKey([pos[0] + x, pos[1] + y]);
            if (k in players) {
                out[out.length-1].push({
                    id: 1,
                    rot: players[k].rot,
                    shake: (k in map && 'tree' in map[k]),
                    attackAnimation: players[k].attackAnimation
                });
            } else {
                if (! (k in map)) {
                    map[k] = makeTree();
                }
                var o = map[k].state;
                var oo = {
                    id: o,
                    rot: ('rot' in map[k] ? map[k].rot : 0),
                    shake: (k in map && 'tree' in map[k])
                };
                out[out.length-1].push(oo);
            }
        }
    }
    return out;
}
function playerPositions() {
    return Object.values(clients).reduce((acc, c) => {
        if (c.life > 0) {
            acc[genPosKey(c.pos)] = c;
        }
        return acc
    }, {});
}

function sendState() {
    var players = playerPositions();
    Object.values(clients).forEach(c => {
        var tempState = JSON.stringify({type: "state", data: {
            map: generateMap(players, c.pos),
            dead: c.life == 0,
            splash: c.life == -1,
            kills: c.kills,
            deaths: c.deaths,
            now: new Date().toJSON()
        }});
        c.ws.send(tempState);
    });
    setTimeout(sendState,10);
}
sendState();

function growTrees() {
    let keys = Object.keys(map).filter(x => map[x].state != 0 && !map[x].tree);
    let l = keys.length;
    let k = keys[Math.floor(Math.random() * l)];
    if (k in map) {
        map[k]['tree'] = new Date();
    }

    setTimeout(growTrees,50000/(l + 20));
}
growTrees();

function createUuid() {
    var uuid = null;
    do {
        uuid = 'K' + Math.floor(Math.random() * 100000);
    } while(uuid in clients);
    return uuid;
}

function findStartPos() {
    var players = playerPositions();
    var x = 0;
    var y = 0;
    var k = genPosKey([x, y]);
    while(k in players) {
        x += 1;
        k = genPosKey([x, y]);
    }
    return [x,y];
}
function defaultClient() {
    var sPos = findStartPos();
    //Destroy tree on spawnin
    for (var x = -1; x <= 1; x += 1) {
        for (var y = -1; y <= 1; y += 1) {
            map[genPosKey(add(sPos, [x, y]))] = {state: 2};
        }
    }
    return {
        life: 3,
        pos: sPos,
        rot: 0,
        attackAnimation: null
    }
};

wss.on('connection', function connection(ws) {
    var uuid = createUuid();
    clients[uuid] = {
        ws: ws,
        kills: 0,
        deaths: 0,
        life: -1,
        pos: [0,0],
        rot: 0
    };

    ws.on('message', function incoming(message) {
        let msg = {};
        try {
            msg = JSON.parse(message);
        } catch (e) {
            console.log("broken data from", uuid, message)
            return;
        }
        if (msg.type == 'debug') {
            console.log("debug message from", uuid, msg.data);
        } else if (msg.type == 'input') {
            inputState[uuid] = msg.data;
        } else {
            console.log("unknown message from", uuid, msg);
        }
    });
    ws.on('close', () => {
        delete clients[uuid];
    });
});

server.listen(8080);
console.log('go: http://localhost:8080/');
