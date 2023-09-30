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
    Object.values(clients).forEach(ws => {
        ws.send(JSON.stringify({type: "reload"}));
    });
});

var nPlayers = 0;
var state = {
    players: {},
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
    Object.values(clients).forEach(ws => {
        ws.send(tempState);
    });
    setTimeout(sendState,10);
}
sendState();

function createUuid() {
    var uuid = null;
    do {
        uuid = 'K' + Math.floor(Math.random() * 100000);
    } while(uuid in clients);
    return uuid;
}

wss.on('connection', function connection(ws) {
    var uuid = createUuid();
    clients[uuid] = ws;

    ws.on('message', function incoming(message) {
        console.log("message from ", uuid, message);
    });
    ws.on('close', () => {
        delete clients[uuid];
    });
});

server.listen(8080);
console.log('go: http://localhost:8080/');
