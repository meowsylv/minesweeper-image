const { createCanvas, loadImage } = require("canvas");
const fs = require("fs");
let size = 16;
let canvas = createCanvas(size, size);
let ctx = canvas.getContext("2d");

loadImage("sheet.png").then(image => {
    for(let i = 0; i < image.height / size; i++) {
        for(let j = 0; j < image.width / size; j++) {
            ctx.clearRect(0, 0, size, size);
            ctx.drawImage(image, -(j * size), -(i * size));
            fs.writeFileSync(`${j},${i}.png`, canvas.toBuffer("image/png"));
        }
    }
});
