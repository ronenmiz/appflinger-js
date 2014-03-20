// Network state enum literals
var appflingerNetworkStateEmpty = 0;
var appflingerNetworkStateIdle = 1;
var appflingerNetworkStateLoading = 2;
var appflingerNetworkStateLoaded = 3;
var appflingerNetworkStateFormatError = 4;
var appflingerNetworkStateNetworkError = 5;
var appflingerNetworkStateDecodeError = 6;

// Ready state enum literal 
var appflingerReadyStateHaveNothing = 0;
var appflingerReadyStateHaveMetaData = 1;
var appflingerReadyStateHaveCurrentData = 2;
var appflingerReadyStateHaveFutureData = 3;
var appflingerReadyStateHaveEnoughData = 4;

function appflinger(controlChannelURL, sessionID, cb)
{
    function getHTTPObject ()
    {
	    var xmlhttp;
	    if (!xmlhttp && typeof XMLHttpRequest != 'undefined')
	    {
		    try
		    {
			    xmlhttp = new XMLHttpRequest ();
		    }
		    catch (e)
		    {
			    xmlhttp = false;
		    }
	    }

	    return xmlhttp;
    }

    function httpRequest (method, url, params, data, successCB, errorCB)
    {
		var http = getHTTPObject ();		
		if (http)
		{
			url += (url.indexOf("?") >= 0) ? "&" : "?";
			url += "?ts=" + ((new Date()).getTime());;
			if (params != null)
			{
				url += "&" + params;
			}
			try
			{
				http.open(method, url, true);
				http.onreadystatechange = function() 
				{
					if (http.readyState == 4)
					{	
						if (http.status == 200)
						{
							var response;
							try
							{
								response = http.responseText;
							}
							catch(e)
							{
								console.log("Error reading the response: " + e.toString());
							}
							if (typeof successCB == "function")	
								successCB(http, response);
						}
						else
						{
							// display status message
						    console.log("Failed HTTP request -- " +  http.statusText);
							if (typeof errorCB == "function")	
								errorCB(http);						
						}
					}
				};
				http.send (data);
			}
			catch (e)
			{
				console.log("Can't connect to server:\n" + e.toString());
			}
		}
    }

    function httpGet (url, params, successCB, errorCB)
    {
    	httpRequest("GET", url, params, null, successCB, errorCB);
    }
    
    function httpPost (url, params, data, successCB, errorCB)
    {
    	httpRequest("POST", url, params, data, successCB, errorCB);
    }

    function processRPCRequest(response)
    {
    	var json = JSON.parse(response);
    	
    	if (typeof json != "object" || typeof json.service == "undefined")
    	{
    		console.log("Failed to parse json: " + response);
    		return;
    	}

    	if (json.service == "load")
    	{
    		return cb.load(json.URL);
    	}
    	else if (json.service == "cancelLoad")
    	{
    		return cb.cancelLoad();
    	}
    	else if (json.service == "play")
    	{
    		return cb.play();
    	}
    	else if (json.service == "pause")
    	{
    		return cb.pause();
    	}
    	else if (json.service == "seek")
    	{
    		return cb.seek(parseFloat(json.time));
    	}
    	else if (json.service == "getPaused")
    	{
    		return cb.getPaused();
    	}
    	else if (json.service == "getSeeking")
    	{
    		return cb.getSeeking();
    	}
    	else if (json.service == "getDuration")
    	{
    		return cb.getDuration();
    	}
    	else if (json.service == "getCurrentTime")
    	{
    		return cb.getCurrentTime();
    	}
    	else if (json.service == "getMaxTimeSeekable")
    	{
    		return cb.getMaxTimeSeekable();
    	}
    	else if (json.service == "getNetworkState")
    	{
    		return cb.getNetworkState();
    	}
    	else if (json.service == "getReadyState")
    	{
    		return cb.getReadyState();
    	}
    	else if (json.service == "setRect")
    	{
    		return cb.setRect(parseInt(json.x), parseInt(json.y), parseInt(json.width), parseInt(json.height));
    	}
    	else if (json.service == "setVisible")
    	{
    		return cb.setVisible(json.visible == "true" || json.visible == "yes" || json.visible == "1");
    	}
    	else
    	{
    		console.log("Unknown service: " + json.service);
    		return {error: true, message: "Unknown service: " + json.service};
    	}
    }
    
    function resultToJSON(result)
    {    	
    	if (typeof result != "undefined" && result != null)
    	{
        	var objResult = new Object();
    		objResult.result = "OK";
    		objResult.message = "";
    		
    		if (typeof result == "object")
    		{
    			resultStr = typeof result.success == "undefined" ? "OK" : 
    			resultMessage = typeof result.message != "undefined" ? result.message : "";
    			
        		for(var prop in result)
        		{
        			if (prop == "success")
        				objResult.result = result.success ? "OK" : "ERROR";
        			else if (prop == "error")
        				objResult.result = !result.error ? "OK" : "ERROR";
        			else if (prop == "paused" || prop == "seeking")
        				objResult[prop] = result[prop] ? "1" : "0";
        			else
        				objResult[prop] = "" + result[prop];
     			}
    		}
    		else if (typeof result == "boolean")
    		{
    			objResult.result = result ? "OK" : "ERROR";
    		}
    		else
    		{
    			console.log("Invalid result: " + result);
    			objResult.result = "ERROR";
    		}
    		return JSON.stringify(objResult);
    	}

    	return null;
    }
    
    function longPoll(url, sessionID, data, isFirst)
    {
        if (url == null)
        	url = "/osb/session/control";
        var params = "session_id=" + sessionID;
        
        if (isFirst)
        	params += "&reset=1";

    	httpPost(url, params, data,
    	    function (http, response) {
    			json = resultToJSON(processRPCRequest(response));
        		console.log("json: " + json);
    			// post result and wait for another request
    			setTimeout(function() {
    				longPoll(url, sessionID, json, false);
    			}, 0);
    		},
    		function (http) {
    			console.log("Error posting to control channel URL");
    			cb.error();
    		});	
    }
    
    longPoll(controlChannelURL, sessionID, null, true); 
}
