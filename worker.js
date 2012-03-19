var Gearman = require("node-gearman"),
    Documentor = require("./gendoc").Documentor,
    
    gearmanHost = process.env.GEARMAN_SERVER || "localhost",
    gearmanPort = process.env.GEARMAN_PORT || "4730",
    
    gearmanClient = new Gearman(gearmanHost, gearmanPort),

    initialConnectTimeout = 15, // seconds
    nextTimeout = initialConnectTimeout;

process.on('uncaughtException', function (err) {
    console.log("uncaughtException");
    console.log(err.message);
    console.log(err.stack);
    try{
        gearmanClient.close();
    }catch(E){}
    process.exit(2);
});

//Connect to the server
console.log("Connecting to gearman");
gearmanClient.on("connect", function(){
    console.log("Connected to gearman server");
    nextTimeout = initialConnectTimeout; // reset timer
});

//Connection to the server is closed, reconnect
gearmanClient.on("close", function(){
    console.log("Lost connection to gearman server, reconnecting in " + nextTimeout + "sec");
    setTimeout(function(){
        console.log("Reconnecting...");
    
        // try to reconnect
        gearmanClient.connect();
    
        // workers are removed on connection close, readd
        registerWorker();
    
        nextTimeout *= 2; // if the connection still fails, wait 2x last interval
    }, nextTimeout * 1000);
});

registerWorker();

function registerWorker(){
    gearmanClient.registerWorker("documentor", documentor);
}

function documentor(payload, worker){
	var repo = (payload || "").toString("utf-8").trim(),
	    repoData,
		time = Date.now(),
		options = {
		        checkoutDirectory: "/tmp/checkout-"+time,
		        destination: "/tmp/gendoc-"+time,
		        bucketName: process.env.BUCKET_NAME || "docs.openbirdie.com"
		    },
		aborted = false,
		timeout = setTimeout(function(){
		    aborted = true;
		    worker.write(new Buffer("<div class=\"documentor error\">Process timeout</div>", "utf-8"));
		    worker.error();
		    process.nextTick(process.exit.bind(process, 1));;
		}, 15 * 60 * 1000);
	
	
	try{
	    repoData = JSON.parse(repo);
	    if(repoData.repo){
	        repo = repoData.repo;
	        Object.keys(repoData).forEach(function(key){
	            if(key == "repo") return;
	            options[key] = repoData[key];
	        });
	    }
	}catch(E){}
	
	console.log("Incoming job "+repo);
	
    var docs = new Documentor(repo, options);
    
    docs.on("data", function(data){
        if(aborted)return;
        worker.write(data);
    });
    
    docs.on("error", function(error){
        if(aborted)return;
        clearTimeout(timeout);
        worker.write(new Buffer("<div class=\"documentor error\">"+ error.message + "</div>", "utf-8"));
        process.nextTick(worker.error.bind(worker));
    });
    
    docs.on("end", function(url){
        if(aborted)return;
        clearTimeout(timeout);
        worker.write(new Buffer("<div class=\"documentor info\">Documentation generated successfully to <a href=\""+url+"\">"+url+"</a></div>", "utf-8"));
        process.nextTick(worker.end.bind(worker));
    });
    
    worker.write(new Buffer("<div class=\"documentor info\">Generating documentation</div>", "utf-8"));
    docs.generateDocs();
}