function renderToCanvas(width, height, renderFunction) {
    var buffer = document.createElement('canvas');
    buffer.width = width;
    buffer.height = height;
    renderFunction(buffer.getContext('2d'));
    return buffer;
}

function drawImgAndAlpha(imgX, imgY, imgW, imgH, img, alpha, isAlphaGrayscale, context)
{
    context.clearRect(imgX-1, imgY-1, imgW, imgH, context);
    if (alpha != null)
    {
        if (isAlphaGrayscale)
        {
            var alphaData;
            var alphaCanvas = renderToCanvas(alpha.width, alpha.height, function (ctx) {
                ctx.drawImage(alpha, 0, 0);
                alphaData = ctx.getImageData(0, 0, alpha.width, alpha.height).data;
            });
            var imgCanvas = renderToCanvas(img.width, img.height, function (ctx) {
                ctx.drawImage(img, 0, 0);
                id = ctx.getImageData(0, 0, img.width, img.height);
                data = id.data;
                for (var i=3; i<data.length; i+=4)
                {
                    data[i] = alphaData[i-1];
                }
                ctx.putImageData(id, 0, 0);
            });
            context.drawImage(imgCanvas, imgX-1, imgY-1, imgW, imgH);
        } else {
            // default composition
            context.globalCompositeOperation = 'source-over';

            // draw the alpha channel image on the canvas
            context.drawImage(alpha, imgX-1, imgY-1, imgW, imgH);

            // with this composition the image that is about to be drawn won't ruin the previously drawn alpha channel
            context.globalCompositeOperation = 'source-atop';

            // draw the actual image (without alpha) on the canvas
            context.drawImage(img, imgX-1, imgY-1, imgW, imgH);
        }
    }
    else
        context.drawImage(img, imgX-1, imgY-1, imgW, imgH);
}

