// This converts first four entries in the array to a number (network bytes order, i.e. big-endian, assumed)
function ab2unsignedBE(uint8buf) {
	// The last >>> operator is there to make sure the result is unsigned
	return ((Number(uint8buf[0]) << 24) | (Number(uint8buf[1]) << 16)
			| (Number(uint8buf[2]) << 8) | (Number(uint8buf[3]))) >>> 0;
}

// This converts first four entries in the array to a number (little-endian is assumed)
function ab2unsignedLE(uint8buf) {
	// The last >>> operator is there to make sure the result is unsigned
	return ((Number(uint8buf[3]) << 24) | (Number(uint8buf[2]) << 16)
			| (Number(uint8buf[1]) << 8) | (Number(uint8buf[0]))) >>> 0;
}

// Returns an array buffer holding the given 32 bit number in little-endian byte order
function unsigned2ab(unsigned) {
	return new Uint8Array([ unsigned, unsigned >> 8, unsigned >> 16,
			unsigned >> 24, ]);
}

function abConcat(a, b) {
	if (a == null)
		return b;

	if (b == null)
		return a;

	var c = new (a.constructor)(a.length + b.length);
	c.set(a, 0);
	c.set(b, a.length);
	return c;
}

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

function indexOfBinary(uint8Haystack, uint8Needle) {
	var ix = 0;
	while (ix < uint8Haystack.byteLength) {
		ix = uint8Haystack.indexOf(uint8Needle[0], ix);
		if (ix < 0 || ix + uint8Needle.byteLength  > uint8Haystack.byteLength)
			return -1;

		var match = true;
		for (i=1; i<uint8Needle.byteLength; i++) {
			if (uint8Haystack[ix+i] != uint8Needle[i]) {
				match = false;
				break;
			}
		}

		if (match)
			return ix;

		ix++; // skip the single newline char we found
	}
	return -1;
}

function uuid() {
	function s4() {
		return Math.floor((1 + Math.random()) * 0x10000).toString(16)
				.substring(1);
	}
	return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-'
			+ s4() + s4() + s4();
}

function getURLHostPath(url) {
	var l = document.createElement("a");
	l.href = url;
	return l.hostname + l.pathname;
}

function getURLQueryString(url) {
	var l = document.createElement("a");
	l.href = url;
	return l.search.substring(1);
}

function parseQueryString(queryString) {
	if (typeof queryString == "undefined")
		queryString = window.location.search.substring(1);
	var qs = queryString.split("&");
	var result = {};
	for (var i = 0; i < qs.length; i++) {
		pair = qs[i].split('=');
		result[pair[0]] = pair.length > 1 ? decodeURIComponent(pair[1]) : "";
	}
	return result;
}

function getHTTPObject() {
	var xmlhttp;
	if (!xmlhttp && typeof XMLHttpRequest != 'undefined') {
		try {
			xmlhttp = new XMLHttpRequest();
		} catch (e) {
			xmlhttp = false;
		}
	}

	return xmlhttp;
}

function setRequestHeaders(http, headerStr) {
	if (!headerStr) {
		return;
	}
	var headerPairs = headerStr.split('\r\n');
	for (var i = 0; i < headerPairs.length; i++) {
		var headerPair = headerPairs[i];
		// Can't use split() here because it does the wrong thing
		// if the header value has the string ": " in it.
		var index = headerPair.indexOf(': ');
		if (index > 0) {
			var key = headerPair.substring(0, index);
			var val = headerPair.substring(index + 2);
			http.setRequestHeader(key, val);
		}
	}
}

function httpRequest(method, url, headers, data, successCB, errorCB) {
	var http = getHTTPObject();
	if (http) {
		try {
			http.open(method, url, true);
			http.responseType = "arraybuffer";
			setRequestHeaders(http, headers);
			http.onreadystatechange = function() {
				if (http.readyState == 4) {
					var response;
					try {
						response = http.response;
					} catch (e) {
						console.log("Error reading the response: "
								+ e.toString());
					}
					if (typeof successCB == "function")
						successCB(http, response);
				}
			}
			http.send(data);
		} catch (e) {
			if (typeof errorCB == "function")
				errorCB();
		}
	}
}
