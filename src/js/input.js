function createInputHandlers(sessionId) {
    function SendHttpRequest (url, params, cb) {
        var http = new XMLHttpRequest ();

        var theUrl = url + "?ts=" + ((new Date()).getTime());;

        if (params != null)
            theUrl += "&" + params;

        http.open ("GET", theUrl, true);
            if (typeof cb == "function")
                    http.onreadystatechange = function() { cb(http) };
        http.send (null);
    }

    function getModifiers(event)
    {
        var mod = 0;
        if (event.getModifierState("CapsLock"))
            mod += 1;
        if (event.getModifierState("Shift"))
            mod += 2;
        if (event.getModifierState("Control"))
            mod += 4;
        if (event.getModifierState("Alt"))
            mod += 8;
        if (event.getModifierState("Meta"))
            mod += 128;
        if (event.getModifierState("NumLock"))
            mod += 256;	

        return mod;
    }

    function SendKey(code, ch, mod, cb, type)
    {
        lastKeyDate = new Date();
        if (typeof ch == "undefined")
            ch = 0;

        if (typeof mod == "undefined")
            mod = 0;

        if (typeof type == "undefined")
            type = "key";

        SendHttpRequest ("/osb/session/event", "session_id=" + sessionId + "&type=" + type + "&code=" + code + "&char=" + ch + "&mod=" + mod, cb);
    }

    function SendClick(x, y) {
        lastKeyDate = new Date();
        SendHttpRequest ("/osb/session/event", "session_id=" + sessionId + "&type=click" + "&x=" + x  + "&y=" + y, null);
    }

    var lastKeyCode = 0;
    var lastKeyDate = null; // Holds the time of last input event, used for latency calculation

    return {
        clickHandler: function(event) {
            SendClick(event.x, event.y);
        },
        keypressHandler: function (event){
            event.preventDefault();
            SendKey(lastKeyCode, event.which, getModifiers(event));
        },
        keydownHandler: function (event) {
            lastKeyCode = event.which;

            // This is for handling control keys (we won't get keypress event for them)
            if (event.which == 8 || event.which == 27 ||event.which == 9 || event.which == 37 || event.which == 38 || event.which == 39 || event.which == 40) {
                SendKey(event.which, 0, getModifiers(event));
                event.preventDefault();
            }
        },
        getLastKeyDate: function() {
            return lastKeyDate;
        },
        setLastKeyDate: function(val) {
            lastKeyDate = val;
        }
    };  
}
