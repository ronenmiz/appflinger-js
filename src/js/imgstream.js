function loadSnapshot(sessionId, drawCB) {
    var snapurl = "/osb/session/snapshot?png=1&session_id=" + sessionId;
    var xhr = new XMLHttpRequest();
    xhr.open( "GET", snapurl, true );
    xhr.responseType = "arraybuffer";
    xhr.timeout = 500;
    xhr.ontimeout = function( e ) {
        console.log("Timeout loading image");
        setTimeout(loadSnapshot, 0);
    }
    xhr.onerror = function( e ) {
        console.log("Error loading image");
        setTimeout(loadSnapshot, 0);
    }
    xhr.onabort = function( e ) {
        console.log("Aborted loading image load");
    }
    xhr.onload = function( e ) {
        if (xhr.readyState != 4 || xhr.status != 200) { 
            console.error(xhr.statusText);
            setTimeout(loadSnapshot, 0);
            return;
        }
        drawCB(this.response);
    };
    xhr.send();
}

function loadImgStream(sessionId, isAlphaGrayscale, processImgCB) {
    function parseJSONHeader(jsonStr) {
        if (jsonStr.trim().length == 0) // empty image header
            return null;

        try {
            return JSON.parse(jsonStr);
        } catch (e) { 
            console.log(e, " -- in " + jsonStr);
        }
        return null;
    }

    function processImgStreamEntry(jsonObj, data)
    {
        var totalSize = parseInt(jsonObj.size);
        var alphaSize = 0;
        if ("alphaSize" in jsonObj)
            alphaSize = parseInt(jsonObj.alphaSize);
        var imgSize = totalSize - alphaSize;

        var imgX = parseInt(jsonObj.x);
        var imgY = parseInt(jsonObj.y);
        var imgW = parseInt(jsonObj.width);
        var imgH = parseInt(jsonObj.height);

        var alpha = null;
        var img = new Image();
        var alphaLoaded = false;
        var imgLoaded = false;

        // Get the both images (image without alpha and alpha image) and decode, once both are decoded process them

        // Get the alpha image and decode it
        if (alphaSize > 0)
        {
            var bytes = data.slice(imgSize, imgSize+alphaSize);
            var blob = new Blob( [bytes], { type: "image/png" });
            var urlCreator = window.URL || window.webkitURL;
            var imageUrl = urlCreator.createObjectURL( blob );
            alpha = new Image();
            alpha.onload = function() {
            alphaLoaded = true;
            if (imgLoaded)
                processImgCB(imgX, imgY, imgW, imgH, img, alpha, isAlphaGrayscale);
            };
            alpha.src = imageUrl;
        }

        // Get the image and decode it
        var bytes = data.slice(0, imgSize);
        var blob = new Blob( [bytes], { type: "image/jpeg" });
        var urlCreator = window.URL || window.webkitURL;
        var imageUrl = urlCreator.createObjectURL(blob);
        img.onload = function() {
            imgLoaded = true;
            if (alphaSize > 0 && !alphaLoaded)
                return;
            processImgCB(imgX, imgY, imgW, imgH, img, alpha, isAlphaGrayscale);
        };
        img.src = imageUrl;
    }

    // We can load the image stream using XHR or Fetch API - this is the XHR version
    function loadImgStreamXHR(url) {
        function strToArrayBuffer(str) {
            var buf = new ArrayBuffer(str.length);
            var bufView = new Uint8Array(buf);
            for (var i=0, strLen=str.length; i < strLen; i++) {
                bufView[i] = str.charCodeAt(i);
            }
            return bufView;
        }

        var xhr = new XMLHttpRequest();
        xhr.open( "GET", url, true );
        //XHR binary charset by Marcus Granado [http://mgran.blogspot.com]
        xhr.overrideMimeType('text\/plain; charset=x-user-defined') 
        xhr.ontimeout = function( e ) {
            console.log("Timeout loading image stream");
        }
        xhr.onerror = function( e ) {
            console.log("Error loading image stream");
        }
        xhr.onabort = function( e ) {
            console.log("Aborted loading image stream");
        }
        var pos = 0;
        var processData = function() {
            var data = xhr.responseText.substring(pos);

            // Find two newline characters (which terminate a header)
            var end = data.indexOf("\n\n");
            if (end < 0)
            {
                setTimeout(processData, 20); // Need more data so try again later
                return;
            }

            var jsonStr = data.substring(0, end);
            var jsonObj = parseJSONHeader(jsonStr);
            if (jsonObj == null)
            {
                pos += end + 2;
                setTimeout(processData, 20); // Need more data so try again later
                return;
            }

            var totalSize = parseInt(jsonObj.size);
            if (data.length >= end + 2 + totalSize)
            {
                pos += end+2+totalSize;
                var bytes = data.substring(end+2, end+2+totalSize);
                var arrayBufferView = strToArrayBuffer(bytes);
                processImgStreamEntry(jsonObj, arrayBufferView);

                // In case there is another image already available
                setTimeout(processData, 0); 
            }
            else
                setTimeout(processData, 20); // Need more data so try again later
        }
        xhr.onreadystatechange = function (e) {
            if (this.readyState == 3) 
                processData();
        }
        xhr.send();
    }

    function fetchStream(logger, url, successCB, errorCB) {
        fetch(url).then(function(response) {
            var reader = response.body.getReader();
            function readData() {
                reader.read().then(function(result) {
                    if (result.done)
                        successCB(null);
                    else {
                        successCB(result.value.buffer);
                        readData(); // Continue reading
                    }
                }).catch(function (e) {
                    logger.log("Failed to read or process data: " + e);
                    errorCB();
                });
            }
            readData();
        });
    }

    // We can load the image stream using XHR or Fetch API - this is the Fetch API version
    function loadImgStreamFetchAPI(url) {
        var pendingData = null;
        fetchStream(console, url, function(data) {
            if (pendingData == null)
                pendingData = new Uint8Array(data);
            else
                pendingData = abConcat(pendingData, new Uint8Array(data));

            var newlineCode = "\n".charCodeAt(0);
            while(1)
            {
                // Find two newline characters (which terminate a header)
                var end = 0;
                while (1)
                {
                    end = pendingData.slice(end).indexOf(newlineCode);
                    if (end < 0)
                        return;  // Need more data
                    if (pendingData.byteLength > end + 1 && pendingData[end+1] == newlineCode)
                        break;
                    end++;
                }
                var jsonStr = abv2str(pendingData.slice(0, end)); //String.fromCharCode.apply(null, pendingData.slice(0, end));
                var jsonObj = parseJSONHeader(jsonStr);
                if (jsonObj == null)
                {
                    pendingData = pendingData.slice(end+2);
                    return;  // Need more data
                }

                var totalSize = parseInt(jsonObj.size);
                if (pendingData.byteLength >= end + 2 + totalSize)
                {
                    processImgStreamEntry(jsonObj, pendingData.slice(end+2, end + 2 + totalSize));
                    pendingData = pendingData.slice(end + 2 + totalSize);
                }
                else
                    return;  // Need more data
            }
        }, function() {
            console.log("Error loading image stream");
        });
    }

    var url = "/osb/session/ui?fmt=jpeg&alpha=" + (isAlphaGrayscale ? "png8" : "png32") + "&session_id=" + sessionId;

    // use the fetch API in Chrome only for now because we need support for streaming
    if (typeof chrome != "undefined")
        loadImgStreamFetchAPI(url);
    else
        loadImgStreamXHR(url);
}