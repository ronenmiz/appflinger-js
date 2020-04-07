function appflingerCB(uistream, sessionID, errorCB) {
	// Maps the instance id to the video element, media source, etc.)
	var videostreamDict = {};

	// Maps the buffer id to the XHR data
	var resourceDict = {};
	
	// Store id of some maximum number of recently loaded resources, older ones will be freed from the
	// resource dictionary (this is how we restrict the memory used by it). 
	var resourceRecentlyLoaded = [];
	var maxResourcesRecentlyLoaded = 30;

	var curHostPath = null;

	// Buffers passed to appendBuffer represents changes to a buffer previously loaded by loadResource()
	// as such they are a collection of chunks, each chunk has an 8 byte header and some data. The chunk header
	// is such that the first 4 bytes are the offset within the original buffer and the second 4 bytes are the
	// length of the chunk data.
	var MSEBufHeaderSize = 8;

	// Apply changes to a given buffer. The changes are formatted as a collection of data segments preceded
	// by an 8 byte header holding the offset (first 4 bytes) and length of segment (remaining 4 bytes).
	function applyMSEBufferChanges(origBuffer, deltaBuffer) {
		var pos = 0;

		while (pos < deltaBuffer.byteLength) {
			var modBuffer = null;
			var chunkHeader = deltaBuffer
			.slice(pos, pos + MSEBufHeaderSize);
			var offset = ab2unsignedLE(chunkHeader);
			var len = ab2unsignedLE(chunkHeader.slice(4));

			// Saftey measure againat infinite loops
			if (len == 0) {
				console.log("Internal Error");
				break;
			}

			modBuffer = abConcat(modBuffer, origBuffer.slice(0, offset));
			modBuffer = abConcat(modBuffer, deltaBuffer.slice(pos
					+ MSEBufHeaderSize, pos + MSEBufHeaderSize + len));
			if (offset + len < origBuffer.byteLength)
				modBuffer = abConcat(modBuffer, origBuffer.slice(offset
						+ len, origBuffer.byteLength));

			pos += MSEBufHeaderSize + len;
			origBuffer = modBuffer;
		}

		return origBuffer;
	}

	function onSourceOpen() {
	}

	function setVidRect(vid, x, y, width, height) {
		vid.style.left = x + "px";
		vid.style.top = y + "px";
		vid.style.width = width + "px";
		vid.style.height = height + "px";
	}

	function bufferedToStartEndArrays(buffered, start, end)
	{
		for (var i=0; i<buffered.length; i++)
		{
			start.push("" + buffered.start(i));
			end.push("" + buffered.end(i));
		}
	}

	function canSeek(vid, time)
	{
		for (var i=0; i<vid.seekable.length; i++) {
			if (time >= vid.seekable.start(i) && time <= vid.seekable.end(i))
				return true;
		}
		return false;
	}
	
	function seekWhenPossible(vid, time) {
		if (canSeek(vid, time))
		{
			try {
				vid.currentTime = time;
			} catch (e) // InvalidStateError is expected
			{
				console.log(e);
				return false;
			}
		}
		else
			setTimeout(function() {
				seekWhenPossible(vid, time);
			}, 100);
		
		return true;
	}

	function lastPosOfHeader(uint8Response) {
		// Look for last instance of HTTP/ followed by \r\n\r\n
		var prefix = str2abv("HTTP/");
		var start = indexOfBinary(uint8Response, prefix);
		if (start < 0)
			return [];
		
		while (start < uint8Response.byteLength) {
			// Look for end of headers i.e. \r\n\r\n
			var cur = uint8Response.subarray(start);
			var len = indexOfBinary(cur, str2abv("\r\n\r\n"));
			if (len < 0)
				return [];
			
			// Make sure this is not followed by another HTTP/
			cur = cur.subarray(len + 4, len + 4 + prefix.byteLength);
			if (indexOfBinary(cur, prefix) < 0)
				return [start, start + len + 4];
			
			start += len + 4;
		}

		return [];
	}
	
	return {
		onPageLoad : function() {
			console.log("onPageLoad");
			return true;
		},
		onPageClose : function() {
			console.log("onPageClose");
			return true;
		},
		onAddressBarChanged : function(url) {
			console.log("onAddressBarChanged -- " + url);
			var hostPath = getURLHostPath(url);
			if (curHostPath != null && curHostPath != hostPath) {
				for ( var iid in videostreamDict) {
					entry = videostreamDict[iid];
					document.body.removeChild(entry.vid);
					delete videostreamDict[iid];
				}
				videostreamDict = {};
				for (var rid in resourceDict) {
					delete resourceDict[rid];
				}
				resourceDict = {};
				mp4EncodeClearState();
			}
			curHostPath = hostPath;
			return true;
		},
		onTitleChanged : function(title) {
			console.log("onTitleChanged -- " + title);
			return true;
		},
                onAccessibilityTreeChanged: function(value) {
			console.log("onAccessibilityTreeChanged -- " + value);
			return true;
                },
		load : function(instanceId, url) {
			var mediaSource = null;
			var videostream = document.createElement('video');
			videostream.className = "layer1 vid";

			if (typeof url == "undefined") // media source used
			{
			        console.log("load -- " + instanceId);
				mediaSource = new MediaSource();
				mediaSource.addEventListener('sourceopen', onSourceOpen);
				videostream.src = window.URL.createObjectURL(mediaSource);
			} else {
			        console.log("load -- " + instanceId + ", " + url);
				videostream.src = url;
			}

			videostream.load();

			// load also resets visibilty
			videostream.style.display = "block";
			videostream.onerror = function() {
				console.log("Video error:" + videostream.error.code);
				videostream.style.display = "none";
			}
			setVidRect(videostream, 0, 0, 0, 0);
			document.body.insertBefore(videostream, uistream);
			videostreamDict[instanceId] = {
					"vid" : videostream,
					"mediaSource" : mediaSource,
					"sourceBuffers" : {}
			};
			return true;
		},
		cancelLoad : function(instanceId) {
			console.log("cancelLoad");
			var entry = videostreamDict[instanceId];
			if (!entry) {
				console.log("Unknown instance id: ", instanceId);
				return false;
			}
			document.body.removeChild(entry.vid);
			delete videostreamDict[instanceId];
			return true;
		},
		addSourceBuffer : function(instanceId, sourceId, type) {
			console.log("addSourceBuffer -- " + sourceId + ", " + type);
			var entry = videostreamDict[instanceId];
			if (!entry) {
				console.log("Unknown instance id: ", instanceId);
				return false;
			}

			try {
				entry.sourceBuffers[sourceId] = entry.mediaSource.addSourceBuffer(type);
			} catch (e) // NotSupportedError is expected
			{
				alert(e.message);
				console.log(e);
				return false;
			}
			return true;
		},
		removeSourceBuffer : function(instanceId, sourceId) {
			console.log("removeSourceBuffer -- " + sourceId);
			var entry = videostreamDict[instanceId];
			if (!entry) {
				console.log("Unknown instance id: ", instanceId);
				return false;
			}

			if (typeof entry.sourceBuffers[sourceId] == "undefined") {
				console.log("Unexpected source buffer id -- " + sourceId);
				return false;
			}

			try {
				entry.mediaSource.removeSourceBuffer(entry.sourceBuffers[sourceId]);
				delete entry.sourceBuffers[sourceId];
			} catch (e) // NotSupportedError is expected
			{
				alert(e.message);
				console.log(e);
				return false;
			}
			return true;
		},
		resetSourceBuffer : function(instanceId, sourceId) {
			console.log("resetSourceBuffer -- " + sourceId);
			var entry = videostreamDict[instanceId];
			if (!entry) {
				console.log("Unknown instance id: ", instanceId);
				return false;
			}

			if (typeof entry.sourceBuffers[sourceId] == "undefined") {
				console.log("Unexpected source buffer id -- " + sourceId);
				return false;
			}

			try {
		        // Abort current segment append
			    if (entry.mediaSource.readyState == "open") {
			    	entry.sourceBuffers[sourceId].abort();
			    }
			} catch (e) // NotSupportedError is expected
			{
				alert(e.message);
				console.log(e);
				return false;
			}
			return true;
		},
		appendBuffer : function(instanceId, sourceId, appendWindowStart,
				appendWindowEnd, bufferId, bufferOffset, bufferLength,
				payload, responseCB) {
			console.log("appendBuffer -- " + sourceId + ", "
					+ appendWindowStart + ", " + appendWindowEnd + ", "
					+ bufferId + ", " + bufferOffset + ", " + bufferLength
					+ ", " + payload.length);
			var entry = videostreamDict[instanceId];
			if (!entry) {
				console.log("Unknown instance id: ", instanceId);
				return false;
			}

			if (typeof entry.sourceBuffers[sourceId] == "undefined") {
				console.log("Unexpected source buffer id -- " + sourceId);
				return false;
			}
			//entry.sourceBuffers[sourceId].appendWindowStart = appendWindowStart; 
			//entry.sourceBuffers[sourceId].appendWindowEnd = appendWindowEnd;
			if (bufferId != null) {
				if (!resourceDict[bufferId]) {
					console.log("Unknown buffer id: ", bufferId);
					return false;					
				}

				var resource = resourceDict[bufferId];

				// The payload includes changes to sections of the buffer so we need to apply them
				if (payload.length > 0)
					resourceDict[bufferId] = resource = applyMSEBufferChanges(resource, payload);

				payload = resource.slice(bufferOffset, bufferOffset + bufferLength);
			}

			// We want to return to caller quickly and append can take
			// a while so we do not wait for it to complete
			setTimeout(function() {
				try {
					entry.sourceBuffers[sourceId].appendBuffer(payload);

					// We want to return the buffered so that getBuffered won't be called periodically
					var start = [], end = [];
					bufferedToStartEndArrays(entry.sourceBuffers[sourceId].buffered, start, end);

					responseCB({
						"start" : start,
						"end" : end
					});
				} catch (e) {
					console.log(e);
					responseCB(false);
				}
			}, 0);
			return null;  // No response for now, it will be sent asynchronously later via responseCB()
		},
		play : function(instanceId) {
			console.log("play");
			var entry = videostreamDict[instanceId];
			if (!entry) {
				console.log("Unknown instance id: ", instanceId);
				return false;
			}
			entry.vid.play();
			//uistream.style.opacity = 0.5;
			return true;
		},
		pause : function(instanceId) {
			console.log("pause");
			var entry = videostreamDict[instanceId];
			if (!entry) {
				console.log("Unknown instance id: ", instanceId);
				return false;
			}
			entry.vid.pause();
			//uistream.style.opacity = 1.0;
			return true;
		},
		seek : function(instanceId, time) {
			console.log("seek -- " + time);
			var entry = videostreamDict[instanceId];
			if (!entry) {
				console.log("Unknown instance id: ", instanceId);
				return false;
			}
			
			// We may not be able to seek to the desired time because the seekable range
			// may not allow it. We still always do it so that when resuming after a long pause we won't be
			// playing briefly at the old position and then jump to the new position.
			try {
				entry.vid.currentTime = time;
			} catch (e) // InvalidStateError is expected
			{
				console.log(e);
				return false;
			}
			
			return entry.mediaSource == null ? true : seekWhenPossible(entry.vid, time);
		},
		getPaused : function(instanceId) {
			console.log("getPaused");
			var entry = videostreamDict[instanceId];
			if (!entry) {
				console.log("Unknown instance id: ", instanceId);
				return false;
			}
			return {
				"paused" : entry.vid.paused
			};
		},
		getSeeking : function(instanceId) {
			console.log("getSeeking");
			var entry = videostreamDict[instanceId];
			if (!entry) {
				console.log("Unknown instance id: ", instanceId);
				return false;
			}
			return {
				"seeking" : false
			};
		},
		getDuration : function(instanceId) {
			console.log("getDuration");
			var entry = videostreamDict[instanceId];
			if (!entry) {
				console.log("Unknown instance id: ", instanceId);
				return false;
			}
			return (typeof entry.vid.duration == "number" && entry.vid.duration > 0) ? {
				"duration" : entry.vid.duration
			}
			: false;
		},
		getCurrentTime : function(instanceId) {
			console.log("getCurrentTime");
			var entry = videostreamDict[instanceId];
			if (!entry) {
				console.log("Unknown instance id: ", instanceId);
				return false;
			}
			return (typeof entry.vid.currentTime == "number") ? {
				"currentTime" : entry.vid.currentTime
			} : false;
		},
		getMaxTimeSeekable : function(instanceId) {
			console.log("getMaxTimeSeekable");
			var entry = videostreamDict[instanceId];
			if (!entry) {
				console.log("Unknown instance id: ", instanceId);
				return false;
			}
			return (typeof entry.vid.duration == "number") ? {
				"maxTimeSeekable" : entry.vid.duration
			} : false;
		},
		getNetworkState : function(instanceId) {
			console.log("getNetworkState");
			var entry = videostreamDict[instanceId];
			if (!entry) {
				console.log("Unknown instance id: ", instanceId);
				return false;
			}
			return {
				"networkState" : appflingerNetworkStateLoaded
			};
		},
		getReadyState : function(instanceId) {
			console.log("getReadyState");
			var entry = videostreamDict[instanceId];
			if (!entry) {
				console.log("Unknown instance id: ", instanceId);
				return false;
			}
			return {
				"readyState" : appflingerReadyStateHaveEnoughData
			};
		},
		getBuffered : function(instanceId, sourceId) {
			console.log("getBuffered -- " + sourceId);
			var entry = videostreamDict[instanceId];
			if (!entry) {
				console.log("Unknown instance id: ", instanceId);
				return false;
			}
			if (sourceId && !entry.sourceBuffers.hasOwnProperty(sourceId))
			{
				console.log("Unknown source id: ", sourceId);
				return false;			
			}
			var start = [], end = [];
			var buffered = sourceId == null ? entry.vid.buffered : entry.sourceBuffers[sourceId].buffered;
			bufferedToStartEndArrays(buffered, start, end);

			return {
				"start" : start,
				"end" : end
			};
		}, 
		setRect : function(instanceId, x, y, width, height) {
			console.log("setRect -- " + x + ", " + y + ", " + width + ", "
					+ height);
			var entry = videostreamDict[instanceId];
			if (!entry) {
				console.log("Unknown instance id: ", instanceId);
				return false;
			}
			setVidRect(entry.vid, x, y, width, height);
			return true;
		},
		setVisible : function(instanceId, visible) {
			console.log("setVisible -- " + visible);
			var entry = videostreamDict[instanceId];
			if (!entry) {
				console.log("Unknown instance id: ", instanceId);
				return false;
			}
			entry.vid.style.display = visible ? "block" : "none";
			return true;
		},
		sendMessage : function(message) {
			console.log("sendMessage -- " + message);
			return {
				"message" : "Message received"
			};
		},

		loadResource : function(url, method, headers, resourceId, byteRange, sequenceNumber, payload, responseCB) {
			console.log("loadResource -- " + url + ", " + method + ", "
					+ headers + ", " + resourceId + ", [" + byteRange + "], " + sequenceNumber);

			// We do it via a service provided by the server
			// because there is no way we can do this in the
			// browser with all the required headers (origin,
			// cookie, etc).
			// Therefore this is useful for testing purposes only
			// since doing it via the server defeats the purpose.
			var xhrProxyURL = "/osb/session/xhr?session_id="
				+ encodeURIComponent(sessionID);
			var msgObj = {
					"url" : url,
					"method" : method,
					"headers" : headers
			};
			var data = abConcat(str2abv(JSON.stringify(msgObj) + "\n\n"), payload);

			httpRequest(
					"POST",
					xhrProxyURL,
					"",
					data,
					function(http, response) {
						if (http.status != 200) {
							responseCB(false);
							return;
						}

						// Break response to headers and payload and extract the status code from the status line
						// There could be multiple sets of headers due to redirects so look for the last one
						response = new Uint8Array(response);
						var range = lastPosOfHeader(response);
						if (typeof range != "object" || range.length != 2) {
							responseCB(false);
							return;
						}
						
						var responseHeaders = abv2str(response.subarray(range[0], range[1]));
						var responsePayload = response.subarray(range[1]);
						var statusCode = parseInt(responseHeaders.substring(responseHeaders.indexOf(" ")));
						responseHeaders = responseHeaders.substring(responseHeaders.indexOf("\r\n") + 2); // skip the status line

						var resultObj = {
								"code" : statusCode,
								"headers" : responseHeaders,
								"payload" : responsePayload
						};

						if (responsePayload.length > 0) {
							// When resourceId is provided we need to store the buffer for later reference by appendBuffer
							// and return to the server only headers (if any) and the buffer id.
							// Currently we only support MP4
							if (resourceId != null) {
								// Sanity check, since only MP4 is currently supported
								var mimeMatch = responseHeaders.match(/Content-Type\s*:\s*(.*)\r\n/i);
								if (mimeMatch != null && mimeMatch.length > 1 && !mp4MimeType(mimeMatch[1]))
									console.log("Warn - resourceId provided for mime type:", mimeMatch[1], ",url:", url);

								// Exclude actual media from the payload (to save bandwidth)
								var newPayload = mp4EncodeWithoutMDAT(resourceId, byteRange, sequenceNumber, responsePayload);
								if (newPayload != null) {
									var bufferId = uuid();
									console.log("Generated buffer id:", bufferId, " for:", url);
									
									if (resourceRecentlyLoaded.length >= maxResourcesRecentlyLoaded)
										delete resourceDict[resourceRecentlyLoaded.shift()]

									resourceRecentlyLoaded.push(bufferId);
									resourceDict[bufferId] = responsePayload;
									
									resultObj["bufferId"] = bufferId;
									resultObj["bufferLength"] = responsePayload.byteLength;

									if (newPayload.byteLength > 0) {
										resultObj["payload"] = newPayload;
									} else
										delete resultObj["payload"];
								}
							}
						} else
							// Properly handle absence of payload
							delete resultObj["payload"];

						responseCB(resultObj);
					}, function() {
						responseCB(false);
					});
			return null;  // No response for now, it will be sent asynchronously later via responseCB()
		},
		selectKeySystem : function(keySystem, supportedConfigurations, responseCB) {
			console.log("selectKeySystem -- " + keySystem, ",", supportedConfigurations);
			navigator.requestMediaKeySystemAccess(keySystem, supportedConfigurations).then(
					function(keySystemAccess) {
						responseCB({
							"configuration" : JSON.stringify(keySystemAccess.getConfiguration())
						});
					},
					function(error) {
						console.log("Failed to create key session", error);
						responseCB(false);
					});
			return null;  // No response for now, it will be sent asynchronously later via responseCB()
		},
		error : function() {
			console.log("AppFlinger Error");

			for ( var iid in videostreamDict) {
				entry = videostreamDict[iid];
				entry.vid.src = "";
			}
			errorCB();
		}
	};
}
