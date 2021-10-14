function appflingerCB(uistream, sessionID, videoStateCB, errorCB) {
	var maxWidth = 1280;
	var maxHeight = 720;

	// Maps the instance id to the video element, media source, etc.
	var videostreamDict = {};

	// Save deleted entries from videostreamDict
	var deletedVideostream = [];

	// Maps the buffer id to the XHR data
	var resourceDict = {};
	var resourceLoadedCount = 0;
	var maxResourceLoadedCount = 100;

	// Some dictionaries storing EME related state across RPC requests
	var keySystemAccessDict = {};
	var mediaKeysDict = {};
	var mediaKeySessionDict = {};

	// Store id of some maximum number of recently loaded resources, older ones will be freed from the
	// resource dictionary (this is how we restrict the memory used by it). 
	// var resourceRecentlyLoaded = [];
	// var maxResourcesRecentlyLoaded = 100;

	// Detect changes to the page host as a way to clean above dictionaries
	var curpageHost = null;

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
		if (x > maxWidth || y > maxHeight)
			return;
		if (x+width > maxWidth)
			width = maxWidth - x;
		if (y+height > maxHeight)
			height = maxHeight - x;			
		vid.style.left = x + "px";
		vid.style.top = y + "px";
		vid.style.width = width + "px";
		vid.style.height = height + "px";
	}

	function timeRangeToStartEndArrays(range, start, end)
	{
		for (var i=0; i<range.length; i++)
		{
			start.push("" + range.start(i));
			end.push("" + range.end(i));
		}
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
			var pageHost = getURLHost(url);
			if (curpageHost != null && curpageHost != pageHost) {
				// Free all video players
				for (var iid in videostreamDict) {
					entry = videostreamDict[iid];
					document.body.removeChild(entry.vid);
					delete videostreamDict[iid];
				}
				videostreamDict = {};
				deletedVideostream = [];

				// Free all in memory resource buffers previously loaded in loadResource()
				for (var rid in resourceDict) {
					delete resourceDict[rid];
				}
				resourceDict = {};
				resourceLoadedCount = 0;

				// Free all EME related dictionaries
				keySystemAccessDict = {};
				mediaKeysDict = {};
				mediaKeySessionDict = {};

				mp4EncodeClearState();
			}
			curpageHost = pageHost;
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
		load : function(instanceId, url, eventCB) {
			var mediaSource = null;
			var videostream = document.createElement('video');
			videostream.className = "layer1 vid";

			if (typeof url == "undefined") // media source used
			{
			    console.log("load --", instanceId);
				mediaSource = new MediaSource();
				mediaSource.addEventListener('sourceopen', onSourceOpen);
				videostream.src = window.URL.createObjectURL(mediaSource);
			} else {
				console.log("load --", instanceId, url);
				if (navigator.userAgent.indexOf("NativeXREReceiver") >= 0) { // RDK browser
					var proto = getURLProto(url);
					videostream.src = proto == "https:" ? "aamps:" + url.substring(6) : proto == "http:" ? "aamp:" + url.substring(5) : url;
				} else
					videostream.src = url;
			}

			// Handle events

			videostream.onerror = function(event) {
				console.log("Video error, instance:", instanceId, "code:", videostream.error.code, "message:", videostream.error.message);
				videostream.style.display = "none";
			}
			var handleVideoStateChange = function(event) {
				console.log("Video event:", event.type, videostream.readyState, videostream.networkState);
				eventCB(instanceId, {type: "videostatechange", readyState: "" + videostream.readyState,
					networkState: "" + videostream.networkState, duration: "" + videostream.duration,
					videoWidth: videostream.videoWidth, videoHeight: videostream.videoHeight,
					paused: videostream.paused, seeking: videostream.seeking, time: videostream.currentTime
				});
			}
			videostream.onloadstart = handleVideoStateChange;
			videostream.onloadedmetadata = handleVideoStateChange;
			videostream.onloadeddata = handleVideoStateChange;
			videostream.ondurationchange = handleVideoStateChange;
			videostream.oncanplay = handleVideoStateChange;
			videostream.oncanplaythrough = handleVideoStateChange;
			videostream.onwaiting = handleVideoStateChange;
			videostream.onpause = handleVideoStateChange;
			videostream.onplay = handleVideoStateChange;
			videostream.onseeking = handleVideoStateChange;
			videostream.onseeked = handleVideoStateChange;
			
			videostream.onencrypted = function(event) {
				console.log("Video encrypted:", event.initDataType, event.initData);
				eventCB(instanceId, {type: "encrypted", initDataType: event.initDataType,
					payload: new Uint8Array(event.initData)});
			}
			videostream.onwaitingforkey = function(event) {
				console.log("Video is waiting for key");
			}
			videostream.load();

			// load also resets visibilty
			videostream.style.display = "block";
			setVidRect(videostream, 0, 0, 0, 0);
			document.body.insertBefore(videostream, uistream);
			videostreamDict[instanceId] = {
					"vid" : videostream,
					"lastSeekTime" : -1,
					"seekCount" : 0,
					"mediaSource" : mediaSource,
					"sourceBuffers" : {}, // source id mapped to the source buffer
			};
			if (videoStateCB != null)
				videoStateCB(instanceId, false);
			return true;
		},
		cancelLoad : function(instanceId) {
			console.log("cancelLoad --", instanceId);
			var entry = videostreamDict[instanceId];
			if (!entry) {
				console.log("Unknown instance id: ", instanceId);
				return false;
			}
			document.body.removeChild(entry.vid);
			if (entry.vid.mediaKeys != null)
				deletedVideostream.push(entry);
			delete videostreamDict[instanceId];
			if (videoStateCB != null)
				videoStateCB(instanceId, null /* means video is destroyed */);
			return true;
		},
		addSourceBuffer : function(instanceId, sourceId, type) {
			console.log("addSourceBuffer --", instanceId, sourceId, type);
			var entry = videostreamDict[instanceId];
			if (!entry) {
				console.log("Unknown instance id: ", instanceId);
				return false;
			}

			try {
				entry.sourceBuffers[sourceId] = entry.mediaSource.addSourceBuffer(type);
			} catch (e) // NotSupportedError is expected
			{
				console.log(e);
				return false;
			}
			return true;
		},
		removeSourceBuffer : function(instanceId, sourceId) {
			console.log("removeSourceBuffer --", instanceId, sourceId);
			var entry = videostreamDict[instanceId];
			if (!entry) {
				console.log("Unknown instance id: ", instanceId);
				return false;
			}

			if (typeof entry.sourceBuffers[sourceId] == "undefined") {
				console.log("Unexpected source buffer id --", sourceId);
				return false;
			}

			try {
				entry.mediaSource.removeSourceBuffer(entry.sourceBuffers[sourceId]);
				delete entry.sourceBuffers[sourceId];
			} catch (e) // NotSupportedError is expected
			{
				console.log(e);
				return false;
			}
			return true;
		},
		abortSourceBuffer : function(instanceId, sourceId) {
			console.log("abortSourceBuffer --", instanceId, sourceId);
			var entry = videostreamDict[instanceId];
			if (!entry) {
				console.log("Unknown instance id: ", instanceId);
				return false;
			}

			if (typeof entry.sourceBuffers[sourceId] == "undefined") {
				console.log("Unexpected source buffer id --", sourceId);
				return false;
			}

			try {
		        // Abort current segment append and resets the segment parser
			    if (entry.mediaSource.readyState == "open") {
			    	entry.sourceBuffers[sourceId].abort();
				}
				else
					console.log("Could not abort source buffer, readyState:", entry.mediaSource.readyState);
			} catch (e) // NotSupportedError is expected
			{
				console.log(e);
				return false;
			}
			return true;
		},
		changeSourceBufferType : function(instanceId, sourceId, type) {
			console.log("changeSourceBufferType -- ", instanceId, sourceId, type);
			var entry = videostreamDict[instanceId];
			if (!entry) {
				console.log("Unknown instance id: ", instanceId);
				return false;
			}

			if (typeof entry.sourceBuffers[sourceId] == "undefined") {
				console.log("Unexpected source buffer id --", sourceId);
				return false;
			}

			try {
				entry.sourceBuffers[sourceId].changeType(type);
			} catch (e) // NotSupportedError is expected
			{
				console.log(e);
				return false;
			}
			return true;
		},
		appendBuffer : function(instanceId, sourceId, appendWindowStart,
				appendWindowEnd, bufferId, bufferOffset, bufferLength,
				payload, responseCB) {
			console.log("appendBuffer -- ", instanceId, sourceId, appendWindowStart, appendWindowEnd,
				bufferId, bufferOffset, bufferLength, payload.length);
			var entry = videostreamDict[instanceId];
			if (!entry) {
				console.log("Unknown instance id: ", instanceId);
				return false;
			}

			if (typeof entry.sourceBuffers[sourceId] == "undefined") {
				console.log("Unexpected source buffer id --", sourceId);
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
			var doAppend = function(e) {
				// We cannot do it when an append is still in progress, if we do we end up getting eventually the error below:
				// DOMException: Failed to execute 'appendBuffer' on 'SourceBuffer': This SourceBuffer is still processing an 'appendBuffer' or 'remove' operation.
				// Which leads to the append being skipped and the subsequent one creating a demuxer error because now the chunk demuxer see corrupted data
				// due to the absence of a buffer
				if (entry.sourceBuffers[sourceId].updating) {
					if (typeof e == "undefined")
						entry.sourceBuffers[sourceId].addEventListener("updateend", doAppend, false);
					return;
				}

				if (typeof e != "undefined" && typeof e.type != "undefined" && e.type == "updateend") {
					entry.sourceBuffers[sourceId].removeEventListener("updateend", doAppend, false);
				}

				try {
					var returnResponse = function(e) {
						entry.sourceBuffers[sourceId].removeEventListener("updateend", returnResponse, false);

						// We want to return the buffered so that getBuffered won't be called periodically
						var start = [], end = [];
						timeRangeToStartEndArrays(entry.sourceBuffers[sourceId].buffered, start, end);

						responseCB({
							"timestampOffset" : entry.sourceBuffers[sourceId].timestampOffset,
							"start" : start,
							"end" : end
						});

						// Seek with MSE will only go to the closest buffered position and so we need to do
						// it again after new data was buffered
						if (entry.lastSeekTime >= 0)
							entry.vid.currentTime = entry.lastSeekTime;
					}
					entry.sourceBuffers[sourceId].addEventListener("updateend", returnResponse, false);
					entry.sourceBuffers[sourceId].appendBuffer(payload);
				} catch (e) {
					console.log(e);
					entry.sourceBuffers[sourceId].removeEventListener("updateend", returnResponse, false);
					responseCB(false);
				}
			};

			setTimeout(doAppend, 0);
			return null;  // No response for now, it will be sent asynchronously later via responseCB()
		},
		removeBufferRange : function(instanceId, sourceId, start, end, responseCB) {
			console.log("removeBufferRange --", instanceId, sourceId, start, end);
			var entry = videostreamDict[instanceId];
			if (!entry) {
				console.log("Unknown instance id:", instanceId);
				return false;
			}

			if (typeof entry.sourceBuffers[sourceId] == "undefined") {
				console.log("Unexpected source buffer id --", sourceId);
				return false;
			}

			try {
				var returnResponse = function(e) {
					entry.sourceBuffers[sourceId].removeEventListener("updateend", returnResponse, false);

					// We want to return the buffered so that getBuffered won't be called periodically
					var start = [], end = [];
					timeRangeToStartEndArrays(entry.sourceBuffers[sourceId].buffered, start, end);

					responseCB({
						"start" : start,
						"end" : end
					});
				}
				if (entry.sourceBuffers[sourceId].updating)
					console.log("Warning - source buffer is updating so remove will fail");
				entry.sourceBuffers[sourceId].addEventListener("updateend", returnResponse, false);	
				entry.sourceBuffers[sourceId].remove(start, end);
			} catch (e) // NotSupportedError is expected
			{
				console.log(e);
				entry.sourceBuffers[sourceId].removeEventListener("updateend", returnResponse, false);
				return false;
			}
			return null;
		},
		setAppendMode : function(instanceId, sourceId, mode) {
			console.log("setAppendMode --", instanceId, sourceId, mode);
			var entry = videostreamDict[instanceId];
			if (!entry) {
				console.log("Unknown instance id:", instanceId);
				return false;
			}

			if (typeof entry.sourceBuffers[sourceId] == "undefined") {
				console.log("Unexpected source buffer id --", sourceId);
				return false;
			}

			try {
				if (mode < 0 || mode > 1) {
					console.log("Invalid mode:", mode);
					return false;	
				}
				entry.sourceBuffers[sourceId].mode = mode == 0 ? "segments" : "sequence";
			} catch (e)
			{
				console.log(e);
				return false;
			}
			return true;
		},
		setAppendTimestampOffset : function(instanceId, sourceId, timestampOffset) {
			console.log("setAppendTimestampOffset --", instanceId, sourceId, timestampOffset);
			var entry = videostreamDict[instanceId];
			if (!entry) {
				console.log("Unknown instance id:", instanceId);
				return false;
			}

			if (typeof entry.sourceBuffers[sourceId] == "undefined") {
				console.log("Unexpected source buffer id --", sourceId);
				return false;
			}

			try {
				entry.sourceBuffers[sourceId].timestampOffset = timestampOffset;
			} catch (e)
			{
				console.log(e);
				return false;
			}
			return true;
		},
		play : function(instanceId) {
			console.log("play --", instanceId);
			var entry = videostreamDict[instanceId];
			if (!entry) {
				console.log("Unknown instance id: ", instanceId);
				return false;
			}

			entry.vid.play().then(function(){
				// console.log("Playback successfully started --", instanceId);
			}).catch(function(error) {
				console.log("Playback failed to start --", instanceId, error);
			});
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
			console.log("seek -- ", instanceId, time);
			var entry = videostreamDict[instanceId];
			if (!entry) {
				console.log("Unknown instance id: ", instanceId);
				return false;
			}
			
			var seekCount = ++entry.seekCount;
			try {
				var resetLastSeekTime = function () {
					entry.vid.removeEventListener("seeked", resetLastSeekTime, false);

					if (seekCount == entry.seekCount) {
						// Once seeking completed successfully we reset the lastSeekTime field so that
						// it will not be used by appendBuffer and by getCurrentTime
						entry.lastSeekTime = -1;

						if (Math.abs(time - entry.vid.currentTime) > 0.5) {
							console.log("Warning -- seek completed but time mismatch", entry.vid.currentTime, time);
						}
					}
				};
				entry.vid.addEventListener("seeked", resetLastSeekTime, false);

				// For MSE we can only seek within the buffered range, so if one issues a seek request
				// before buffering the required data, the current time will be the closest possible within
				// buffered data. When currentTime action is invoked
				// we need to return the seek time and not the entry.vid.currentTime so we save the last seek
				// time and use it in getCurrentTime.
				// Once new data is buffered (in appendBuffer) we retry the seek.
				entry.lastSeekTime = time;

				entry.vid.currentTime = time;
			} catch (e) // InvalidStateError is expected
			{
				console.log(e);
				return false;
			}

			return true;
		},
		getPaused : function(instanceId) {
			console.log("getPaused --", instanceId);
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
			console.log("getSeeking --", instanceId);
			var entry = videostreamDict[instanceId];
			if (!entry) {
				console.log("Unknown instance id: ", instanceId);
				return false;
			}
			return {
				"seeking" : entry.video.seeking
			};
		},
		getDuration : function(instanceId) {
			console.log("getDuration --", instanceId);
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
			console.log("getCurrentTime --", instanceId);
			var entry = videostreamDict[instanceId];
			if (!entry) {
				console.log("Unknown instance id: ", instanceId);
				return false;
			}

			var result = false;
			if (typeof entry.vid.currentTime == "number")
				result = {
					"currentTime" : entry.lastSeekTime >=0 ? entry.lastSeekTime : entry.vid.currentTime
				};
			return result;
		},
		getSeekable : function(instanceId) {
			console.log("getSeekable --", instanceId);
			var entry = videostreamDict[instanceId];
			if (!entry) {
				console.log("Unknown instance id: ", instanceId);
				return false;
			}
			var start = [], end = [];
			timeRangeToStartEndArrays(entry.vid.seekable, start, end);

			return {
				"start" : start,
				"end" : end
			};
		},
		getNetworkState : function(instanceId) {
			console.log("getNetworkState --", instanceId);
			var entry = videostreamDict[instanceId];
			if (!entry) {
				console.log("Unknown instance id: ", instanceId);
				return false;
			}
			return {
				"networkState" :  entry.vid.networkState
			};
		},
		getReadyState : function(instanceId) {
			console.log("getReadyState --", instanceId);
			var entry = videostreamDict[instanceId];
			if (!entry) {
				console.log("Unknown instance id: ", instanceId);
				return false;
			}
			return {
				"readyState" : entry.vid.readyState
			};
		},
		getBuffered : function(instanceId, sourceId) {
			console.log("getBuffered --", instanceId, sourceId);
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
			timeRangeToStartEndArrays(buffered, start, end);

			return {
				"start" : start,
				"end" : end
			};
		}, 
		setRect : function(instanceId, x, y, width, height) {
			console.log("setRect --", instanceId, x, y, width, height);
			var entry = videostreamDict[instanceId];
			if (!entry) {
				console.log("Unknown instance id: ", instanceId);
				return false;
			}
			setVidRect(entry.vid, x, y, width, height);
			if (videoStateCB != null)
				videoStateCB(instanceId, entry.vid.style.display != "none" && width > 0 && height > 0);
			return true;
		},
		setVisible : function(instanceId, visible) {
			console.log("setVisible --", instanceId, visible);
			var entry = videostreamDict[instanceId];
			if (!entry) {
				console.log("Unknown instance id: ", instanceId);
				return false;
			}
			entry.vid.style.display = visible ? "block" : "none";
			if (videoStateCB != null)
				videoStateCB(instanceId, visible);
			return true;
		},
		setRate : function(instanceId, rate) {
			console.log("setRate --", instanceId, rate);
			var entry = videostreamDict[instanceId];
			if (!entry) {
				console.log("Unknown instance id: ", instanceId);
				return false;
			}
			entry.vid.playbackRate = rate;
			return true;
		},
		setVolume : function(instanceId, volume) {
			console.log("setVolume -- " + volume);
			var entry = videostreamDict[instanceId];
			if (!entry) {
				console.log("Unknown instance id: ", instanceId);
				return false;
			}
			entry.vid.volume = volume;
			return true;
		},
		sendMessage : function(message) {
			console.log("sendMessage --", instanceId, message);
			return {
				"message" : "Message received"
			};
		},
		loadResource : function(url, method, headers, resourceId, byteRange, sequenceNumber, payload, responseCB) {
			console.log("loadResource --", url, method, headers, resourceId, byteRange, sequenceNumber);

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
									console.log("Generated buffer id:", bufferId, "size:", responsePayload.byteLength, "url:", url);
									
									// if (resourceRecentlyLoaded.length >= maxResourcesRecentlyLoaded)
									// 	delete resourceDict[resourceRecentlyLoaded.shift()]

									// resourceRecentlyLoaded.push(bufferId);
									resourceDict[bufferId] = responsePayload;
									resourceLoadedCount++;
									if (resourceLoadedCount > maxResourceLoadedCount)
										console.log("Resource load count exceeds allowed maximum:", resourceLoadedCount);
									
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
		deleteResource : function(bufferId) {
			console.log("deleteResource --", bufferId);
			if (resourceDict[bufferId]) {
				delete resourceDict[bufferId];
				resourceLoadedCount--;
			}
			return true;
		},
		requestKeySystem : function(keySystem, supportedConfigurations, responseCB) {
			console.log("requestKeySystem --", keySystem, supportedConfigurations);
			navigator.requestMediaKeySystemAccess(keySystem, supportedConfigurations).then(
				function(keySystemAccess) {
					keySystemAccessDict[keySystem] = keySystemAccess;
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
		cdmCreate: function(keySystem, securityOrigin, allowDistinctiveIdentifier, allowPersistentState, responseCB) {
			console.log("cdmCreate --", keySystem, securityOrigin, allowDistinctiveIdentifier, allowPersistentState);

			var keySystemAccess = keySystemAccessDict[keySystem];
			if (!keySystemAccess) {
				console.log("Unknown key system: ", keySystem);
				return false;
			}
			keySystemAccess.createMediaKeys().then(
				function(createdMediaKeys) {
					var cdmId = uuid();
					mediaKeysDict[cdmId] = createdMediaKeys;
					responseCB({
						"cdmId" : cdmId
					});
				}
			).catch(
				function(error) {
					console.log('Unable to create MediaKeys');
					responseCB(false);
			});
			return null;  // No response for now, it will be sent asynchronously later via responseCB()
		},
		setCdm : function (instanceId, cdmId, responseCB) {
			console.log("setCdm --", instanceId, cdmId);

			var mediaKeys = mediaKeysDict[cdmId];
			if (!mediaKeys) {
				console.log("Unknown CDM id: ", cdmId);
				return false;
			}
			
			var entry = videostreamDict[instanceId];
			if (!entry) {
				console.log("Unknown instance id: ", instanceId);
				return false;
			}

			entry.vid.setMediaKeys(mediaKeys).then(function() {
				responseCB(true);
			}).catch(function(error) {
				// May need to detach it from a previously deleted player
				for (var i=0; i<deletedVideostream.length; i++) {
					if (deletedVideostream[i].vid.mediaKeys == mediaKeys) {
						deletedVideostream[i].vid.src = "";
						deletedVideostream[i].vid.setMediaKeys(null).then(function() {
							deletedVideostream.splice(i, 1);
							entry.vid.setMediaKeys(mediaKeys).then(function() {
								responseCB(true);
							}).catch(function(error) {
								console.log('Unable to set MediaKeys', error);
								responseCB(false);
							});
						}).catch(function(error) {
							console.log('Unable to unset MediaKeys', error);
							responseCB(false);
						});
						return;
					}
				}
				console.log('Unable to set MediaKeys', error);
				responseCB(false);
			});
			return null;  // No response for now, it will be sent asynchronously later via responseCB()
		},
		cdmSetServerCertificate : function (cdmId, payload, responseCB) {
			console.log("cdmSetServerCertificate --", cdmId);

			var mediaKeys = mediaKeysDict[cdmId];
			if (!mediaKeys) {
				console.log("Unknown CDM id: ", cdmId);
				return false;
			}

			mediaKeys.setServerCertificate(payload).then(function() {
				responseCB(true);
			}).catch(function(error) {
				console.log("Unable to set server certificate:", error);
				responseCB(false);
			});
			return null;  // No response for now, it will be sent asynchronously later via responseCB()
		},
		cdmSessionCreate : function (instanceId, cdmId, sessionType, initDataType, payload, responseCB, eventCB) {
			console.log("cdmSessionCreate --", instanceId, cdmId, sessionType, initDataType);

			function handleMessageEvent(event) {
				console.log("message event --", event.messageType, event.message);
				eventCB(instanceId, {type: "cdmsessionmessage", "messageType" : event.messageType,
					"payload" : new Uint8Array(event.message),
				});
			}
			function handlekeyStatusesChangeEvent(event) {
				console.log("keyStatusesChange event --", event.target.keyStatuses);

				keyStatuses = [];
				event.target.keyStatuses.forEach(function(status, keyId) {
					keyStatuses.push({"keyId": ab2base64(keyId), "status": status});
				});
				eventCB(instanceId, {type: "cdmsessionkeystatuseschange", "payload" : str2abv(JSON.stringify(keyStatuses)),
				});
			}

			var mediaKeys = mediaKeysDict[cdmId];
			if (!mediaKeys) {
				console.log("Unknown CDM id: ", cdmId);
				return false;
			}
			var keySession = mediaKeys.createSession();
			keySession.addEventListener("message", handleMessageEvent, false);
			keySession.addEventListener("keystatuseschange", handlekeyStatusesChangeEvent, false);

			keySession.generateRequest(initDataType, payload).then(function() {
				mediaKeySessionDict[keySession.sessionId] = keySession;
				responseCB({
					"cdmSessionId" : keySession.sessionId,
					"expiration" : "" + keySession.expiration,
				});
			}).catch(function(error) {
				console.log('Failed CDM generate request');
				keySession.removeEventListener("message", handleMessageEvent, false);
				keySession.removeEventListener("keystatuseschange", handlekeyStatusesChangeEvent, false);
				responseCB(false);
			});
			return null;  // No response for now, it will be sent asynchronously later via responseCB()
		},
		cdmSessionUpdate : function (instanceId, cdmId, cdmSessionId, payload, responseCB, eventCB) {
			console.log("cdmSessionUpdate --", instanceId, cdmId, cdmSessionId);

			var keySession = mediaKeySessionDict[cdmSessionId];
			if (!keySession) {
				console.log("Unknown CDM session id: ", cdmSessionId);
				return false;
			}

			keySession.update(payload).then(function() {
				responseCB(true);
			}).catch(function(error) {
				console.log('Failed CDM session update');
				responseCB(false);
			});
			return null;  // No response for now, it will be sent asynchronously later via responseCB()
		},
		cdmSessionLoad : function (instanceId, cdmId, cdmSessionId, responseCB, eventCB) {
			console.log("cdmSessionLoad --", instanceId, cdmId, cdmSessionId);

			function handleMessageEvent(event) {
				console.log("message event --", event.messageType, event.message);
				eventCB(instanceId, {type: "cdmsessionmessage", "messageType" : event.messageType,
					"payload" : new Uint8Array(event.message),
				});
			}
			function handlekeyStatusesChangeEvent(event) {
				console.log("keyStatusesChange event --", event.target.keyStatuses);

				keyStatuses = [];
				event.target.keyStatuses.forEach(function(status, keyId) {
					keyStatuses.push({"keyId": ab2base64(keyId), "status": status});
				});
				eventCB(instanceId, {type: "cdmsessionkeystatuseschange", "payload" : str2abv(JSON.stringify(keyStatuses)),
				});
			}

			var mediaKeys = mediaKeysDict[cdmId];
			if (!mediaKeys) {
				console.log("Unknown CDM id: ", cdmId);
				return false;
			}
			var keySession = mediaKeys.createSession();
			keySession.addEventListener("message", handleMessageEvent, false);
			keySession.addEventListener("keystatuseschange", handlekeyStatusesChangeEvent, false);

			keySession.load(cdmSessionId).then(function(loaded) {
				responseCB({
					"loaded": loaded,
					"expiration" : "" + keySession.expiration,
				});
			}).catch(function(error) {
				console.log('Failed CDM session load');
				responseCB(false);
			});
			return null;  // No response for now, it will be sent asynchronously later via responseCB()
		},
		cdmSessionRemove : function (instanceId, cdmId, cdmSessionId, responseCB) {
			console.log("cdmSessionRemove --", instanceId, cdmId, cdmSessionId);

			var keySession = mediaKeySessionDict[cdmSessionId];
			if (!keySession) {
				console.log("Unknown CDM session id: ", cdmSessionId);
				return false;
			}

			keySession.remove().then(function() {
				responseCB(true);
			}).catch(function(error) {
				console.log('Failed CDM session remove');
				responseCB(false);
			});
			return null;  // No response for now, it will be sent asynchronously later via responseCB()
		},
		cdmSessionClose : function (instanceId, cdmId, cdmSessionId, responseCB) {
			console.log("cdmSessionClose --", instanceId, cdmId, cdmSessionId);

			var keySession = mediaKeySessionDict[cdmSessionId];
			if (!keySession) {
				console.log("Unknown CDM session id: ", cdmSessionId);
				return false;
			}

			keySession.close().then(function() {
				responseCB(true);
			}).catch(function(error) {
				console.log('Failed CDM session close');
				responseCB(false);
			});
			return null;  // No response for now, it will be sent asynchronously later via responseCB()
		},
		error : function() {
			console.log("AppFlinger Error");

			for (var iid in videostreamDict) {
				entry = videostreamDict[iid];
				entry.vid.src = "";
			}
			errorCB();
		}
	};
}
