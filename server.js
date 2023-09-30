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

var clients = [];
fs.watch('./public', (eventType, filename) => {
    console.log("watch", eventType, filename);
    clients.forEach(ws => {
        ws.send(JSON.stringify({type: "reload"}));
    });
});

var nPlayers = 0;
var state = {
    players: [],
    map: [
        [0,0,0],
        [0,0,0]
    ]
};
var inputState = [];

function updateState() {
}

setInterval(updateState, 10);

function sendState() {
    var tempState = JSON.stringify({type: "state", data: state});
    clients.forEach(ws => {
        ws.send(tempState);
    });
    setTimeout(sendState,10);
}
sendState();

var uuidToId = {};
var idToUuid = [];

function createUuid() {
    var uuid = null;
    do {
        uuid = 'K' + Math.floor(Math.random() * 100000);
    } while(uuidToId[uuid]);
    return uuid;
}

function sendId(uuid) {
    uuidToId[uuid].ws.send(JSON.stringify({
        type: "id",
        data: {id: uuidToId[uuid].id}
    }));
}

wss.on('connection', function connection(ws) {
    var uuid = createUuid();

    uuidToId[uuid] = { id: nPlayers, ws: ws };
    nPlayers += 1;
    var x = (Math.random() - 0.5) * 2;
    var y = (Math.random() - 0.5) * 2;


    idToUuid.push(uuid);
    clients.push(ws);

    ws.on('message', function incoming(message) {
        var me = uuidToId[uuid].id;
        if (message) {
            console.log(message);
        }
    });
    ws.on('close', () => {
        var lplayer = state.players.pop();
        var luuid   = idToUuid.pop();
        var linput  = inputState.pop();
        var lclient = clients.pop();
        nPlayers -= 1;

        if (luuid != uuid) {
            var me = uuidToId[uuid].id;

            state.players[me]   = lplayer;
            idToUuid[me]        = luuid;
            inputState[me]      = linput;
            clients[me]         = lclient;

            uuidToId[luuid].id  = me;
            sendId(luuid)
            //uuidToId[luuid].ws.send(JSON.stringify({id: uuidToId[luuid].id}));
        }
        delete uuidToId[uuid];
    });
    sendId(uuid)
    //ws.send(JSON.stringify({id: uuidToId[uuid].id}));
});

server.listen(8080);
console.log('go: http://localhost:8080/');
