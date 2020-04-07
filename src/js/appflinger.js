//Network state enum literals
var appflingerNetworkStateEmpty = 0;
var appflingerNetworkStateIdle = 1;
var appflingerNetworkStateLoading = 2;
var appflingerNetworkStateLoaded = 3;
var appflingerNetworkStateFormatError = 4;
var appflingerNetworkStateNetworkError = 5;
var appflingerNetworkStateDecodeError = 6;

//Ready state enum literal 
var appflingerReadyStateHaveNothing = 0;
var appflingerReadyStateHaveMetaData = 1;
var appflingerReadyStateHaveCurrentData = 2;
var appflingerReadyStateHaveFutureData = 3;
var appflingerReadyStateHaveEnoughData = 4;

function appflinger(controlChannelURL, sessionID, cb)
{
	function str2abv (str) {
		return (new TextEncoder).encode(str);
	}
	
	function str2ab (str) {
		return str2abv(str).buffer;
	}
	
	function abv2str(abv) {
		return (new TextDecoder).decode(abv);
	}
	
	function ab2str(ab) {
		return (new TextDecoder).decode(new Uint8Array(ab));
	}
	
	function abConcat(a, b)
	{
		if (a == null)
			return b;
		
		if (b == null)
			return a;

	    var c = new (a.constructor)(a.length + b.length);
	    c.set(a, 0);
	    c.set(b, a.length);
	    return c;
	}

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
			url += "ts=" + ((new Date()).getTime());
			if (params != null)
			{
				url += "&" + params;
			}
			try
			{
				http.open(method, url, true);
				http.responseType = "arraybuffer";
				http.onreadystatechange = function() 
				{
					if (http.readyState == 4)
					{	
						if (http.status == 200)
						{
							var response;
							try
							{
								response = http.response;
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
				http.send(data);
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

	function processRPCRequest(json, payload, resultCB, responseCB)
	{
		var result;
		if (json.service == "onPageLoad")
		{
			result = cb.onPageLoad();
		}
		else if (json.service == "onPageClose")
		{
			result = cb.onPageClose();
		}
		else if (json.service == "onAddressBarChanged")
		{
			result = cb.onAddressBarChanged(json.URL);
		}
		else if (json.service == "onTitleChanged")
		{
			result = cb.onTitleChanged(json.title);
		}
		else if (json.service == "onAccessibilityTreeChanged")
		{
			result = cb.onAccessibilityTreeChanged(json.value);
		}
		else if (json.service == "load")
		{
			result = cb.load(json.instanceId, json.URL);
		}
		else if (json.service == "cancelLoad")
		{
			result = cb.cancelLoad(json.instanceId);
		}
		else if (json.service == "play")
		{
			result = cb.play(json.instanceId);
		}
		else if (json.service == "pause")
		{
			result = cb.pause(json.instanceId);
		}
		else if (json.service == "seek")
		{
			result = cb.seek(json.instanceId, parseFloat(json.time));
		}
		else if (json.service == "getPaused")
		{
			result = cb.getPaused(json.instanceId);
		}
		else if (json.service == "getSeeking")
		{
			result = cb.getSeeking(json.instanceId);
		}
		else if (json.service == "getDuration")
		{
			result = cb.getDuration(json.instanceId);
		}
		else if (json.service == "getCurrentTime")
		{
			result = cb.getCurrentTime(json.instanceId);
		}
		else if (json.service == "getMaxTimeSeekable")
		{
			result = cb.getMaxTimeSeekable(json.instanceId);
		}
		else if (json.service == "getNetworkState")
		{
			result = cb.getNetworkState(json.instanceId);
		}
		else if (json.service == "getReadyState")
		{
			result = cb.getReadyState(json.instanceId);
		}
		else if (json.service == "getBuffered")
		{
			var sourceId = json.hasOwnProperty("sourceId") ? json.sourceId : null;
			result = cb.getBuffered(json.instanceId, sourceId);
		}
		else if (json.service == "setRect")
		{
			result = cb.setRect(json.instanceId, parseInt(json.x), parseInt(json.y), parseInt(json.width), parseInt(json.height));
		}
		else if (json.service == "setVisible")
		{
			result = cb.setVisible(json.instanceId, json.visible == "true" || json.visible == "yes" || json.visible == "1");
		}
		else if (json.service == "addSourceBuffer")
		{
			result = cb.addSourceBuffer(json.instanceId, json.sourceId, json.type);
		}
		else if (json.service == "removeSourceBuffer")
		{
			result = cb.removeSourceBuffer(json.instanceId, json.sourceId);
		}
		else if (json.service == "resetSourceBuffer")
		{
			result = cb.resetSourceBuffer(json.instanceId, json.sourceId);
		}
		else if (json.service == "appendBuffer")
		{
			var start = json.appendWindowStart == "inf" ? Infinity : Number(json.appendWindowStart);
			var end = json.appendWindowEnd == "inf" ? Infinity : Number(json.appendWindowEnd);
			var hasBufferId = json.hasOwnProperty("bufferId");
			var bufferId = hasBufferId ? json.bufferId : null;
			var bufferOffset = 0;
			var bufferLength = 0;
			if (hasBufferId)
			{
				bufferOffset = parseInt(json.bufferOffset);
				bufferLength = parseInt(json.bufferLength);
			}
			result = cb.appendBuffer(json.instanceId, json.sourceId, start, end, bufferId, bufferOffset, bufferLength, payload, responseCB);
		}
		else if (json.service == "sendMessage")
		{
			result = cb.sendMessage(json.message);
		}
		else if (json.service == "loadResource")
		{
			var resourceId = json.hasOwnProperty("resourceId") ? json.resourceId : null;
			var rangeStr = json.hasOwnProperty("byteRange") ? json.byteRange : null;
			var sequenceNumber = json.hasOwnProperty("sequenceNumber") ? parseInt(json.sequenceNumber) : null;
			
			// Convert the range string to an array of two numbers
			var range = null;
			if (rangeStr != null)
			{
				range = rangeStr.split("-");
				if (range.length != 2)
				{
					console.log("Invalid range:", rangeStr);
					range = null;
				}
				else
				{
					range[0] = range[0].trim() == "" ? 0 : parseInt(range[0]);
					range[1] = range[1].trim() == "" ? Infinity : parseInt(range[1]);
					
					// Make sure the parsing succeeded
					if (isNaN(range[0]) || isNaN(range[1]))
						range = null;
				}
			}

			result = cb.loadResource(json.url, json.method, json.headers, resourceId, range, sequenceNumber, payload, responseCB);
		}
		else if (json.service == "selectKeySystem")
		{
			try {
				 var conf = JSON.parse(json.supportedConfigurations);
				 result = cb.selectKeySystem(json.keySystem, conf, responseCB);
			} catch (e) { 
				console.log(e, " -- in", json.supportedConfigurations);
				result = false;
			}
		}
		else
		{
			console.log("Unknown service: " + json.service);
			result = {error: true, message: "Unknown service: " + json.service};
		}
		resultCB(result);
	}

	function resultToPostData(result, requestId)
	{    	
		if (typeof result != "undefined" && result != null)
		{
			var payload = "";
			var objResult = new Object();
			objResult.result = "OK";
			objResult.message = "";
			if (typeof requestId != "undefined" && requestId != null)
				objResult.requestId = requestId;

			if (typeof result == "object")
			{
				for(var prop in result)
				{
					if (prop == "success")
						objResult.result = result.success ? "OK" : "ERROR";
					else if (prop == "error")
						objResult.result = !result.error ? "OK" : "ERROR";
					else if (prop == "paused" || prop == "seeking")
						objResult[prop] = result[prop] ? "1" : "0";
					else if (prop == "payload")
					{
						payload = result[prop];
						objResult["payloadSize"] = "" + (typeof payload == "string" ? payload.length : payload.byteLength);
					}
					else if (typeof result[prop] == "object")
						objResult[prop] = result[prop];
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
			
			var header = JSON.stringify(objResult) + "\n\n";

			// We need to convert to array buffer when we have a payload
			// since there is no way to send binary data via XHR that does
			// not involve array buffers or blobs
			if (typeof payload == "string")
				return str2abv(header + payload);
			else
				return abConcat(str2abv(header), payload);
		}

		return null;
	}

	function indexOfMessage(uint8Response) {
		// Look for two consecutive newline characters
		var newlineCode = "\n".charCodeAt(0);
		var ix = 0;
		while (ix < uint8Response.byteLength) {
			ix = uint8Response.indexOf(newlineCode, ix);
			if (ix < 0 || ix + 1 >= uint8Response.byteLength)
				return -1;
			
			if (uint8Response[ix+1] == newlineCode)
				return ix;
			
			ix++; // skip the single newline char we found
		}
		return -1;
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
			var uint8Response = new Uint8Array(response);
			var msgEndPos = indexOfMessage(uint8Response);
			if (msgEndPos < 0)
			{
				console.log("Missing end of message separator in", abv2str(uint8Response));
				return;	
			}

			var msg = abv2str(uint8Response.subarray(0, msgEndPos));
			
			// The response is empty when the server sends something after
			// a timeout to avoid the half open connection problem
			if (msg.trim() != "")
			{
				var msgObj;
				try {
					msgObj = JSON.parse(msg);
				} catch (e) { 
					console.log(e, " -- in", msg);
					return;
				}
				if (typeof msgObj != "object")
				{
					console.log("Failed to parse json: " + response);
					return;
				}

                                // Check for a response to a request we posted
                                if (typeof msgObj.service == "undefined") {
                                        // Nothing to do with the response so just continue the long polling
					setTimeout(function() {
						longPoll(url, sessionID, null, false);
					}, 0);

                                        return;
                                }

                                // If we are here it is a request that we need to process

				var requestId = msgObj["requestId"];

				processRPCRequest(msgObj, uint8Response.subarray(msgEndPos + 2),
				function (result) { // This is immediate responses so that longPolling resumes quickly
					// post result and wait for another request
					var postData = result == null ? null : resultToPostData(result, requestId);
					setTimeout(function() {
						longPoll(url, sessionID, postData, false);
					}, 0);
				},
				function (result) { // This is for async responses, i.e. it can take a while before they are ready to be sent
					if (result == null)
					{
						console.log("Internal error");
						return;
					}
					var postData = resultToPostData(result, requestId);
					var params = "session_id=" + sessionID;
					
					setTimeout(function () {
							httpPost(url == null ? "/osb/session/control/response" : (url + "/response"), params, postData,
							function (http, response) {
								// Nothing to do with the response
							},
							function (http) {
								console.log("Error posting to control channel response URL");
							});
					});
				});
			}
			else
				setTimeout(function() {
					longPoll(url, sessionID, "", false);
				}, 0);
		},
		function (http) {
			console.log("Error posting to control channel URL");
			cb.error();
		});	
	}

	longPoll(controlChannelURL, sessionID, null, true); 
}
