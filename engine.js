var config = require("./config.json");

module.exports.spawnEngine = spawnEngine;

function spawnEngine(engineName, options){
    options = options || {};
    engineName = engineName || "";
    
    var engineData = config.engines[engineName],
        engineOptions = {},
        engineCmdParams;
    
    if(!engineData){
        return null;
    }
    
    // copy default and passed option variables
    if(engineData.vars){
        Object.keys(engineData.vars).forEach(function(key){
            engineOptions[key] = engineData.vars[key];
        });
    }
    
    Object.keys(options).forEach(function(key){
        engineOptions[key.toUpperCase()] = options[key];
    });
    
    return {
	    	cmd: engineData.cmd.main, 
	    	params: generateCmdParams(engineData.cmd.params, engineOptions)
    	};
}


function generateCmdParams(params, vars){
    params = params || [];
    vars = vars || {};
    
    var keys = Object.keys(vars),
        done, loopcounter=0,
        curparams = [];
    
    // copy params
    curparams = params.map(function(elm){return elm;});
    
    // loop until all keys have been replaced or  max threshold of 10 loops is passed 
    done = false;
    loopcounter = 10;
    while(!done && loopcounter--){
        
        // replace variables
        curparams = replaceParamVars(curparams, vars)
        
        // check if should rerun
        done = true;
        curparams.forEach(function(param){
            keys.forEach(function(key){
                if(param.match(new RegExp("\\$"+key))){
                    done = false;
                }
            });
        });
        
    }
    
    return curparams;
}

function replaceParamVars(params, vars){
    var output = [],
        keys = Object.keys(vars),
        curparams,
        param;

    while(param = params.shift()){
        curparams = [];
        
        keys.forEach(function(key){
            
            if(param.match(new RegExp("\\$"+key))){
                
                if(Array.isArray(vars[key])){
                    for(var i = vars[key].length-1; i>=0; i--){
                        curparams.unshift(param.replace(new RegExp("\\$"+key,"g"), vars[key][i]));
                    };
                }else{
                    curparams.push(param.replace(new RegExp("\\$"+key,"g"), vars[key]));
                }
                
            }

        });
        
        if(!curparams.length){
            curparams.push(param);
        }
        
        output = output.concat(curparams);
    };    

    return output;
}