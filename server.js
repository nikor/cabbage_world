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
function setMapPos(p,state) {
    map[genPosKey(p)] = state;
}

var map = {};
var grass = [
    [0,0], [1,0], [0,1], [0,2], [0,3], [0,4]
].forEach((x) => setMapPos(x,2));

var inputState = {};

function add(p1, p2) {
    return [
        p1[0] + p2[0],
        p1[1] + p2[1]
    ];
}

function updateState() {
    Object.keys(inputState).forEach(k => {
        if (clients[k].life <= 0) {
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
        let v = inputState[k];
        if (crot[v] != clients[k].rot) {
            clients[k].rot = crot[v];
        } else if (v in cmap) {
            var players = playerPositions();
            var newPos = add(clients[k].pos, cmap[v]);
            var newPosK = genPosKey(newPos);
            if (newPosK in players) {
                //attack player
                var l = players[newPosK].life;
                players[newPosK].life = l <= 0 ? 0 : l-1;
            } else if (! (newPosK in map)) {
                map[newPosK] = 0;
            } else if (map[newPosK] == 0) {
                map[newPosK] = 2;
            } else if (map[newPosK] == 2) {
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

function generateMap(players, pos) {
    let out = [];
    for (var y = -2; y <= 2; y += 1) {
        out.push([]);
        for (var x = -2; x <= 2; x += 1) {
            var k = genPosKey([pos[0] + x, pos[1] + y]);
            if (k in players) {
                out[out.length-1].push({id: 1, rot: players[k].rot});
            } else {
                var o = k in map ? map[k] : 0;
                out[out.length-1].push({id: o, rot: 0});
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
            map: generateMap(players, c.pos)
        }});
        c.ws.send(tempState);
    });
    setTimeout(sendState,10);
}
sendState();

function growTrees() {
    var keys = Object.keys(map)
    var l = keys.length -1;
    delete map[keys[Math.floor(Math.random() * l)]];
    setTimeout(growTrees,50000/(l + 2));
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
wss.on('connection', function connection(ws) {
    var uuid = createUuid();
    var sPos = findStartPos();
    clients[uuid] = {
        ws: ws,
        pos: sPos,
        life: 3,
        rot: 0
    };
    //Destroy tree on spawnin
    map[genPosKey(sPos)] = 2;

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
