var EventEmitter = require('events').EventEmitter,
	util = require('util'),
	spawn = require("child_process").spawn,
    exec = require("child_process").exec,
    pathlib = require("path"),
    enginelib = require("./engine"),
    fs = require("fs"),
    crypto = require("crypto"),
    config = require("./config.json");

module.exports.Documentor = Documentor;

var VENDOR = pathlib.join(__dirname,"vendor");

function Documentor(repo, options){
	EventEmitter.call(this);
	this.repo = repo;
	this.options = options || {};
	this.options.vendor = VENDOR;
}
util.inherits(this.Documentor, EventEmitter);

Documentor.prototype.generateDocs = function(){
	this.cleanUp((function(){
	    if(this.repo.match(/\.(tar\.gz|zip)$/i)){
	        // create directory
	        this.emit("data", new Buffer("<div class=\"documentor cmd\">&gt; mkdir " + this.options.checkoutDirectory + "</div>\n", "utf-8"));
                fs.mkdir(this.options.checkoutDirectory, 0755, (function(err){
                    if(err){
                        this.emit("error", err);
                        return;
                    }
                    this.checkoutSource();
                }).bind(this));
	    }else{
	        this.checkoutSource();
	    }
	}).bind(this));
}

Documentor.prototype.checkoutSource = function(){
    
    var cmd, params;
    
    if(this.repo.match(/\.(tar\.gz|zip)$/i)){
        return this.unpacker();
    }else if(this.repo.match(/\.git$/i)){
        cmd = "git",
    	params = ["clone", this.repo, this.options.checkoutDirectory];
    }else{
        cmd = "svn",
        params = ["checkout", this.repo, this.options.checkoutDirectory];
    }
    
    this.spawner(cmd, params, (function(){
        
        this.loadRepoOptions((function(){
            process.nextTick(this.spawnEngine.bind(this));
        }).bind(this));
        
    }).bind(this));
}

Documentor.prototype.unpacker = function(){
    var curState,
        wget = spawn('wget', ['-O', '-', this.repo]),
        unpack;
    
    if(this.repo.match(/\.tar\.gz/i)){
        unpack = spawn('tar', ['xzf', '-', '-C', this.options.checkoutDirectory]);
    }else if(this.repo.match(/\.zip/i)){
        unpack = spawn('python', ['-c', "import zipfile,sys,StringIO;zipfile.ZipFile(StringIO.StringIO(sys.stdin.read())).extractall(sys.argv[1] if len(sys.argv) == 2 else '.')", this.options.checkoutDirectory]);
    }else{
        this.cleanUp((function(){
            this.emit("error", new Error('Unknown archive format (detected by file extension)'));
        }).bind(this));
        return;
    }

    this.emit("data", new Buffer("<div class=\"documentor info\">Downloading and unpacking archive to "+this.options.checkoutDirectory+"...</div>", "utf-8"));

    wget.stdout.on('data', function (data) {
        unpack.stdin.write(data);
    });
    
    wget.stderr.on('data', function(data){});
    
    wget.on('exit', function (code) {
        if(curState){
            this.emit("data", new Buffer("</div>", "utf-8"));
            curState = false;
        }
        unpack.stdin.end();
        if(code){
            this.cleanUp((function(){
                this.emit("error", new Error('wget exited with code ' + code));
            }).bind(this));
            return;
        }
    });
    
    unpack.stdout.on('data', function(data){});
    
    unpack.stderr.on('data', function (data) {
        if(curState != "stderr"){
            if(curState == "stdout"){
                this.emit("data", new Buffer("</div>\n<div class=\"documentor stderr\">", "utf-8"));
            }else{
                this.emit("data", new Buffer("<div class=\"documentor stderr\">", "utf-8"));
            }
        }
        curState = "stderr";
        this.emit("data", this.escapeHTML(data));
    });
    
    unpack.on('exit', (function (code) {
        if(curState){
            this.emit("data", new Buffer("</div>", "utf-8"));
            curState = false;
        }
        if(code){
            this.cleanUp((function(){
                this.emit("error", new Error('Unpacker exited with code ' + code));
            }).bind(this));
            return;
        }
        this.emit("data", new Buffer("<div class=\"documentor info\">Archive unpacked successfully</div>", "utf-8"));
        
        this.loadRepoOptions((function(){
            process.nextTick(this.spawnEngine.bind(this));
        }).bind(this));
        
    }).bind(this));
}

Documentor.prototype.spawnEngine = function(){

    var engine = enginelib.spawnEngine(this.options.engine, this.options, this);
    
    if(!engine){
        this.emit("error", new Error("Engine error"));
        return;
    }
    
    this.spawner(engine.cmd, engine.params, this.publishDocs.bind(this));
    
}

Documentor.prototype.publishDocs = function(){
	var cmd = "s3cmd",
		params = ["sync",
		          "--config",
		          "/etc/s3cfg",
                  "--acl-public",
                  "--delete-removed",
                  this.options.destination+"/",
                  "s3://"+this.options.bucketName+"/"+this.options.project+"/"];

    this.spawner(cmd, params, (function(){
        var url = "http://"+this.options.bucketName+"/"+this.options.project+"/index.html";
    	this.cleanUp(this.emit.bind(this, "end", url));
    }).bind(this));

}

Documentor.prototype.loadRepoOptions = function(callback){
    var defaultOptions = {
        project: parseInt(md5(this.repo).substr(0, 13), 16).toString("32"),
        engine: this.options.engine || "jsdoc-toolkit",
        source: this.options.source && pathlib.join(this.options.checkoutDirectory, this.options.source) || this.options.checkoutDirectory
    };

    fs.readFile(pathlib.join(this.options.checkoutDirectory, ".documentor.json"), (function(err, data){
        var options = {};
        if(err){
            this.emit("data", new Buffer("<div class=\"documentor info\">Settings file .documentor.json not found from root, using defaults</div>", "utf-8"));
        }
        
        if((data = (data || "").toString("utf-8"))){
            this.emit("data", new Buffer("<div class=\"documentor info\">Settings file .documentor.json found from root</div>", "utf-8"));
            try{
                options = Object(JSON.parse(data) || {});
            }catch(E){
                this.emit("data", new Buffer("<div class=\"documentor error\">Settings file .documentor.json parsing failed: "+E.message+"</div>", "utf-8"));
            }
        }
        
        if(options.source){
            options.source = pathlib.join(this.options.checkoutDirectory, (options.source || "").toString("utf-8").trim());
        }
        
        if(options.project){
            options.project = (options.project || "").toString("utf-8").
                replace(/[^a-z0-9\-\.]/i, "").trim();
        }
        
        Object.keys(defaultOptions).forEach((function(key){
            this.options[key] = (options[key] || defaultOptions[key] || "").toString("utf-8").trim();
        }).bind(this));

        options.params = {
            "-E": "abc!",
            "-e": "cde!",
            "-r": "34"
        }

        if(typeof options.params == "object"){
            this.handleParams(options.params);
        }
        
        if(this.options.source.substr(0, this.options.checkoutDirectory.length) != this.options.checkoutDirectory){
            this.options.source = this.options.checkoutDirectory;
        }
        
        process.nextTick(callback);
    }).bind(this));
}

Documentor.prototype.handleParams = function(params){
    var engine = config.engines[this.options.engine],
        curdefault,
        defaults = [],
        usedKeys = {};
        
    if(!engine || !engine["allowed-params"]){
        return;
    }
    
    Object.keys(params).forEach((function(key){
        if(engine["allowed-params"].indexOf(key)<0)return; // not allowed
        userKeys[key] = true;
        this.addParamValue(defaults, engine, key, params[key]);
    }).bind(this));
    
    if(engine.cmd["default-params"]){
        Object.keys(engine.cmd["default-params"]).forEach((function(key){
            if(!userKeys[key]){
                this.addParamValue(defaults, engine, key, engine.cmd["default-params"][key]);
            }
        }).bind(this));
    }
    
    console.log(defaults);
}

Documentor.prototype.addParamValue = function(defaults, engine, key, value){
    if(engine["params-format"]){
        if(key.match(/^\-[^\-]/)){
            if(engine["params-format"]["short"]){
                if((curdefault = this.replaceParam(engine["params-format"]["short"], key, value))){
                    defaults = defaults.concat(curdefault);
                }
            }
        }else if(key.match(/^\-\-/)){
            if(engine["params-format"]["full"]){
                if((curdefault = this.replaceParam(engine["params-format"]["full"], key, value))){
                    defaults = defaults.concat(curdefault);
                }
            }
        }
    }
}

Documentor.prototype.replaceParam = function(format, key, value){
    var response;
    
    value = (value || "").toString().trim();

    if(value === true || value.charAt(0) == "-"){
       value = "";
    }
    
    if(Array.isArray(format)){
        response = [];
        format.forEach((function(str){
            str = str.replace(/\%key\%/g, key).replace(/\%value\%/g, value).trim();
            if(str){
                response.push(str);
            }
        }).bind(this));
        return response;
    }
    
    return (format || "").toString().
            replace(/\%key\%/g, key).
            replace(/\%value\%/g, value).trim();
}

Documentor.prototype.spawner = function(cmd, params, callback){
	var curState,
    	command = spawn(cmd, params);
	
	this.emit("data", new Buffer("<div class=\"documentor cmd\">&gt; " + this.escapeHTML([cmd].concat(params).join(" ")) + "</div>\n", "utf-8"));

    command.stdout.on('data', (function (data) {
    	if(curState != "stdout"){
    		if(curState == "stderr"){
    			this.emit("data", new Buffer("</div><div class=\"documentor stdout\">", "utf-8"));
    		}else{
    			this.emit("data", new Buffer("<div class=\"documentor stdout\">", "utf-8"));
    		}
    	}
    	curState = "stdout";
        this.emit("data", this.escapeHTML(data));
    }).bind(this));
    
    command.stderr.on('data', (function (data) {
    	if(curState != "stderr"){
    		if(curState == "stdout"){
    			this.emit("data", new Buffer("</div>\n<div class=\"documentor stderr\">", "utf-8"));
    		}else{
    			this.emit("data", new Buffer("<div class=\"documentor stderr\">", "utf-8"));
    		}
    	}
    	curState = "stderr";
        this.emit("data", this.escapeHTML(data));
    }).bind(this));
    
    command.on('exit', (function (code) {
    	if(curState){
    		this.emit("data", new Buffer("</div>", "utf-8"));
    	}
    	
    	if(code){
    		this.cleanUp((function(){
        		this.emit("error", new Error('Child process exited with code ' + code));
        	}).bind(this));
            return;
        }

    	// READY
    	process.nextTick(callback);
    }).bind(this));
}

Documentor.prototype.cleanUp = function(callback){
	exec("rm -rf " + this.options.destination, (function(err){
		exec("rm -rf " + this.options.checkoutDirectory, (function(err){
			process.nextTick(callback);
		}).bind(this));
	}).bind(this));
}

Documentor.prototype.escapeHTML = function(input){
	var output, encoding = "utf-8";
	
	if(typeof input == "object"){
	    encoding = "binary";
	}
    
    output = (input || "").toString(encoding).
                replace(/</g, "&lt;").
                replace(/>/g, "&gt;").
                replace(/"/g, "&quot;").
                replace(/\r?\n/g, "<br/>\n");
    
	if(encoding == "binary"){
	    output = new Buffer(output, encoding);
	}
	
	return output;
}

function md5(str){
    var hash = crypto.createHash("md5");
    hash.update(str);
    return hash.digest("hex");
}