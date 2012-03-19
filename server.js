var cluster = require('cluster'),
    numCPUs = 1;

if (cluster.isMaster) {
    // Fork workers.
    for (var i = 0; i < numCPUs; i++) {
        forkChild();
    }

    cluster.on('death', function(worker) {
        console.log('Worker ' + worker.pid + ' died');
        forkChild();
    });
 
    var http = require('http');
    http.createServer(function (req, res) {
        res.writeHead(200, {'Content-Type': 'text/plain'});
        res.end('Hi there! Documentor is running smoothly with '+numCPUs+' workers\n');
    }).listen(9031);
    console.log('Web server running on port 9031'); 
    
}else{
    require("./worker");
}

function forkChild(){
    var fork = cluster.fork();
    console.log("Created worker " + fork.pid);
};