appflinger-js
=============

appflinger.js is the Javascript client SDK for AppFlinger (www.appflinger.com). It comes with a full client implementation in HTML/JS that runs on any modern browser (Firefox and Chrome are the primary target browsers for the client, the SDK runs on all browsers).

There is also a C client SDK, available in binary form, and a full client for the Raspberry Pi (please contact us to gain access to it). 

The server side code is closed source and is available for licensing from TVersity, please contact us for more information.

### What is AppFlinger?

AppFlinger (www.appflinger.com) is an HTML5 browser (based on Chromium) running in the cloud and delivered to client devices as a video stream,. It is also a full solution for aggregation, monetization and delivery of TV apps (based on HTML5) to set-top boxes and smart TVs. AppFlinger utilizes the cloud for running the HTML5 TV apps and delivers them as a video stream to target devices with unprecedented quality and responsiveness.

AppFlinger makes it possible to run HTML5 TV apps on any device and in the same time makes the full power of desktop-grade HTML5 browsers available to TV app developers.

AppFlinger is available out of the box with many premium TV apps.

If you are interested in AppFlinger, please contact us.

If you are the developer of a TV App in HTML5 and would like to reach the existing deployment base of AppFlinger, please contact us as well.

### AppFlinger Uniqueness

AppFlinger is unique in its ability to deliver desktop grade HTML5 browser experience with just having a solid video player on the client and very low bandwidth and CPU requirement on the server (this is unlike cloud gaming where CPU and bandwidth requirements on the server are typically cost-prohibitive).

This is achieved by breaking the browser experience to two video streams. The UI video stream is created in real-time by the server (by encoding the content of the browser window) and delivered to the client for low-latency rendering. The other video stream is the actual video played via the HTML5 media element (aka HTML5 video tag).

This approach allows HTML5 TV apps, like the one at www.youtube.com/tv, to run in the cloud and be delivered to any client device (including ultra low-end and legacy devices).

### Notes about web based client

This implementation is designed to run in basically any browser and given that desktop browsers do not support low latency video playback and they also do not support the MPEG2-TS container, the UI is rendered as a sequence of JPEG images.

Adapting the client to render the UI as a low-latency video stream would be trivial, as long as the browser supports low-latency video playback and the MPEG2-TS video container.
