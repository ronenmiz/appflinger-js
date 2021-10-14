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
	function parseFloatStr(str)
	{
		return str == "inf" ? Infinity : str == "nan" ? NaN : parseFloat(str);
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

	function createRPCMessage(objProps, payload)
	{
		var header = JSON.stringify(objProps) + "\n\n";

		// We need to convert to array buffer when we have a payload
		// since there is no way to send binary data via XHR that does
		// not involve array buffers or blobs
		if (typeof payload == "string")
			return str2abv(header + payload);
		else
			return abConcat(str2abv(header), payload);
	}

	function createRPCEvent(props)
	{
		let obj = new Object();
		let payload = null;

		if (typeof props == "object")
		{
			if (props.payload)
			{
				payload = props.payload;
				delete props.payload;
				obj.payloadSize = "" + (typeof payload == "string" ? payload.length : payload.byteLength);
			}

			for(var prop in props)
				obj[prop] = props[prop];
		}
		
		return createRPCMessage(obj, payload);
	}

	function createRPCRequest(service, instanceId, props, payload)
	{
		let obj = new Object();
		obj.sessionId = sessionID;
		obj.requestId = uuid();
		obj.service = service;

		if (instanceId)
			obj.instanceId = instanceId;

		if (typeof props == "object")
			for(var prop in props)
				obj[prop] = props[prop];

		if (payload)
			obj.payloadSize = "" + (typeof payload == "string" ? payload.length : payload.byteLength);
		
		return createRPCMessage(obj, payload);
	}

	function createRPCResponse(result, requestId)
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
			
			return createRPCMessage(objResult, payload);
		}

		return null;
	}

	function processRPCRequest(json, payload, resultCB, responseCB)
	{
		function eventCB(instanceId, props)
		{
			// Create a request and send it same as we do for an async response
			responseCB(createRPCRequest("eventNotification", instanceId, null, createRPCEvent(props)));
		}

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
			result = cb.load(json.instanceId, json.URL, eventCB);
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
			result = cb.seek(json.instanceId, parseFloatStr(json.time));
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
		else if (json.service == "getSeekable")
		{
			result = cb.getSeekable(json.instanceId);
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
		else if (json.service == "setRate")
		{
			result = cb.setRate(json.instanceId, parseFloatStr(json.rate));
		}
		else if (json.service == "setVolume")
		{
			result = cb.setVolume(json.instanceId, parseFloatStr(json.volume));
		}
		else if (json.service == "addSourceBuffer")
		{
			result = cb.addSourceBuffer(json.instanceId, json.sourceId, json.type);
		}
		else if (json.service == "removeSourceBuffer")
		{
			result = cb.removeSourceBuffer(json.instanceId, json.sourceId);
		}
		else if (json.service == "abortSourceBuffer")
		{
			result = cb.abortSourceBuffer(json.instanceId, json.sourceId);
		}
		else if (json.service == "changeSourceBufferType")
		{
			result = cb.changeSourceBufferType(json.instanceId, json.sourceId, json.type);
		}
		else if (json.service == "appendBuffer")
		{
			var start = parseFloatStr(json.appendWindowStart);
			var end = parseFloatStr(json.appendWindowEnd);
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
		else if (json.service == "removeBufferRange")
		{
			result = cb.removeBufferRange(json.instanceId, json.sourceId, parseFloatStr(json.start), parseFloatStr(json.end), responseCB);
		}
		else if (json.service == "setAppendMode")
		{
			result = cb.setAppendMode(json.instanceId, json.sourceId, parseInt(json.mode));
		}
		else if (json.service == "setAppendTimestampOffset")
		{
			result = cb.setAppendTimestampOffset(json.instanceId, json.sourceId, parseFloatStr(json.timestampOffset));
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
		else if (json.service == "deleteResource")
		{
			result = cb.deleteResource(json.bufferId);
		}
		else if (json.service == "requestKeySystem")
		{
			try {
				 var conf = JSON.parse(json.supportedConfigurations);
				 result = cb.requestKeySystem(json.keySystem, conf, responseCB);
			} catch (e) { 
				console.log(e, " -- in", json.supportedConfigurations);
				result = false;
			}
		}
		else if (json.service == "cdmCreate")
		{
			result = cb.cdmCreate(json.keySystem, json.securityOrigin, json.allowDistinctiveIdentifier, json.allowPersistentState, responseCB);
		}
		else if (json.service == "setCdm")
		{
			result = cb.setCdm(json.instanceId, json.cdmId, responseCB);
		}
		else if (json.service == "cdmSetServerCertificate")
		{
			result = cb.cdmSetServerCertificate(json.cdmId, payload, responseCB);
		}
		else if (json.service == "cdmSessionCreate")
		{
			result = cb.cdmSessionCreate(json.instanceId, json.cdmId, json.sessionType, json.initDataType, payload, responseCB, eventCB);
		}
		else if (json.service == "cdmSessionUpdate")
		{
			result = cb.cdmSessionUpdate(json.instanceId, json.cdmId, json.cdmSessionId, payload, responseCB, eventCB);
		}
		else if (json.service == "cdmSessionLoad")
		{
			result = cb.cdmSessionLoad(json.instanceId, json.cdmId, json.cdmSessionId, responseCB, eventCB);
		}
		else if (json.service == "cdmSessionRemove")
		{
			result = cb.cdmSessionRemove(json.instanceId, json.cdmId, json.cdmSessionId, responseCB);
		}
		else if (json.service == "cdmSessionClose")
		{
			result = cb.cdmSessionClose(json.instanceId, json.cdmId, json.cdmSessionId, responseCB);
		}
		else
		{
			console.log("Unknown service: " + json.service);
			result = {error: true, message: "Unknown service: " + json.service};
		}
		resultCB(result);
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
					var postData = result == null ? null : createRPCResponse(result, requestId);
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

					// If we get an array buffer we post it as is, otherwise we assume it is a result that need to be converted
					// to an RPC response
					var postData = (typeof result.byteLength != "undefined") ? result : createRPCResponse(result, requestId);
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
