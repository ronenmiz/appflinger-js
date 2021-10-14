function concatBuffer (buffer1, buffer2)
{
  var tmp = new Uint8Array(buffer1.byteLength + buffer2.byteLength);
  tmp.set(new Uint8Array(buffer1), 0);
  tmp.set(new Uint8Array(buffer2), buffer1.byteLength);
  return tmp.buffer;
};

// Get via a WebSocket
/*function httpStreamGet(logger, url, successCB, errorCB)
{
    websocket = new WebSocket("ws://localhost:12345/ws");//url);
    websocket.binaryType = 'arraybuffer';
    websocket.onopen = function(evt) {
        console.log("ws opened");
    };
    websocket.onclose = function(e) {
        console.log("ws closed");
    };
    websocket.onerror = function(e) {
        console.log(e);
    };
    websocket.onmessage = function(evt) {
        successCB(evt.data);
    };
}*/

// Get via Fetch API
// For Cobalt we must use this since XHR won't work for binary data
/*function httpStreamGet(logger, url, successCB, errorCB, signal)
{
    fetch(url, {signal}).then(function(response) {
        var reader = response.body.getReader();
        var minSize = 1;
        var buffer = null;
        var timer = null;

        function flushBuffer()
        {
            successCB(buffer);
            buffer = null;
            timer = null;
        }

        function readData()
        {
            reader.read().then(function(result) {
                if (result.done)
                {
                    successCB(null);
                }
                else
                {
                    if (timer != null)
                    {
                        clearTimeout(timer);
                        timer = null;
                    }

                    if (buffer == null)
                        buffer = result.value.buffer;
                    else 
                        buffer = concatBuffer(buffer, result.value.buffer);

                    if (buffer.byteLength > minSize)
                        flushBuffer();
                    else
                        timer = setTimeout(flushBuffer, 10); // Do not delay data too long

                    readData();
                }
            }).catch(function (e) {
                logger.log("Failed to read or process data: " + e);
                errorCB();
            });
        }

        readData();
    });
}*/

// Get via XHR
// For WPE Webkit (e.g. RDK) we need to use this since although Fetch is supported it cannot be aborted
function httpStreamGet(logger, url, successCB, errorCB, xhr)
{
    function strToArrayBuffer(str)
    {
        var buf = new ArrayBuffer(str.length);
        var bufView = new Uint8Array(buf);
        for (var i=0, strLen=str.length; i < strLen; i++) {
            bufView[i] = str.charCodeAt(i);
        }
        return bufView;
    }

    if (typeof xhr == "undefined")
        xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    //xhr.responseType = 'arraybuffer'; // won't provide result in onprogress, only in onload so useless for us

    // Hack to pass bytes through unprocessed.
    xhr.overrideMimeType('text/plain; charset=x-user-defined');
    
    xhr.send();

    xhr.ontimeout = function(e) {
        logger.log("Timeout loading image");
        if (typeof errorCB != "undefined")
            errorCB(xhr.readyState, xhr.status);
    }
    xhr.onerror = function(e) {
        logger.log("Error loading image");
        if (typeof errorCB != "undefined")
            errorCB(xhr.readyState, xhr.status);
    }
    xhr.onabort = function(e) {
        logger.log("Aborted loading image load");
        if (typeof errorCB != "undefined")
            errorCB(xhr.readyState, xhr.status);
    }
    
    var pos = 0;
    function invokeCB() {
        if (xhr.responseText != null)
        {
            successCB(strToArrayBuffer(xhr.responseText.substring(pos)));
            pos = xhr.responseText.length;
        }
    }

    xhr.onprogress = function (e) {
        //readyState: headers received 2, body received 3, done 4
        if (xhr.readyState != 2 && xhr.readyState != 3 && xhr.readyState != 4)
            return;
        if (xhr.readyState == 3 && xhr.status != 200)
            return;
        if (xhr.response == null)
            return;
        invokeCB();
    }
    xhr.onload = function(e) {
        invokeCB();
        successCB(null); // end of stream
    }

    return xhr;
}

function enqueue(queue, data, pos)
{
    queue.push({"data" : data, "pos": pos});
}

function enqueueFirst(queue, data, pos)
{
    queue.unshift({"data" : data, "pos": pos});
}

function dequeue(queue)
{
    if (queue.length == 0)
        return null;

    return queue.shift();
}

function liveStream(logger, video, url, mimeType, codecs)
{
    var mediaSource = new MediaSource();
    video.src = window.URL.createObjectURL(mediaSource);
    var ended = false;
    var queue = [];
    var maxAppendSize = 2000000;
    
    // To be able to abort XHR, we create ot here
    var xhr = new XMLHttpRequest();

    // To be able to abort the fetch
    //var controller = new AbortController();

    var logReadyState = function(e) {
        logger.log('mediaSource readyState: ' + this.readyState);
    };

    function sourceOpenCallback(e)
    {
        var sourceBuffer;
        var type = mimeType + '; codecs="' + codecs + '"';
        if (typeof mediaSource.isTypeSupported == "function" && !mediaSource.isTypeSupported(type))
        {
            logger.log("Unsupported type: " + type);
            return;
        }

        try
        {
            sourceBuffer = mediaSource.addSourceBuffer(type);
            logger.log('mediaSource readyState: ' + this.readyState);
        }
        catch (e)
        {
            logger.log(e);
            return;
        }
       
        sourceBuffer.addEventListener('updateend', function (e)
        {
            if (video.buffered.length > 0 && video.paused)
            {
                video.currentTime = video.buffered.end(0);
                video.play(); // Start playing after 1st chunk is appended.
            }
            if (queue.length > 0)
            {
                if (mediaSource.readyState != "open")
                {
                    logger.log("Media source is no longer open, aborting...")
                    return;
                }

                if (sourceBuffer.updating)
                    return;

                var entry = dequeue(queue);
                var size = entry.data.byteLength - entry.pos;
                if (size > maxAppendSize)
                    size = maxAppendSize;

                sourceBuffer.appendBuffer(entry.data.subarray(entry.pos, entry.pos + size));

                entry.pos += size;
                if (entry.pos < entry.data.byteLength)
                    enqueueFirst(queue, entry.data, entry.pos);
            }
            else if (mediaSource.readyState != "ended" && mediaSource.readyState != "closed" && !sourceBuffer.updating && ended)
            {
                mediaSource.endOfStream();
            }
        });

        httpStreamGet(logger, url, function(data) { 
            if (mediaSource.readyState != "open")
            {
                logger.log("Media source is no longer open, aborting...")
                return;
            }

            if (data == null)
            {
                ended = true;
                if (queue.length == 0 && !sourceBuffer.updating)
                    mediaSource.endOfStream();
                return;
            }

            // Make it an array buffer view so we can use subarray
            data = new Uint8Array(data);

            if (sourceBuffer.updating || queue.length > 0)
                enqueue(queue, data, 0);
            else if (data.byteLength > maxAppendSize)
            {
                enqueue(queue, data, maxAppendSize);

                // Append a chunk and continue it in handler of updateend event
                sourceBuffer.appendBuffer(data.subarray(0, maxAppendSize));
            }
            else
            {
                sourceBuffer.appendBuffer(data);
            }
        }, function() {
            if (queue.length == 0 && !sourceBuffer.updating)
                mediaSource.endOfStream();
        },
        xhr                   // For XHR we pass the xhr object so we can abort it
        //controller.signal     // For fetch we pass the signal so we can abort it
        );
    }

    mediaSource.addEventListener('sourceopen', sourceOpenCallback, false);
    mediaSource.addEventListener('sourceended', logReadyState, false);
    mediaSource.addEventListener('sourceclose', logReadyState, false);

    return xhr;         // For XHR
    //return controller;  // for Fetch API
}

function abortLiveStream(handle) {
    handle.abort();
}

