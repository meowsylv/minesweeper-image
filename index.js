const express = require("express");
const cors = require("cors");
const fs = require("fs");
const app = express();
const querystring = require("querystring");
const { createCanvas, loadImage } = require("canvas");
const path = require("path");
const tileSize = 64;
const difficulties = [
    {
        name: "beginner",
        width: 9,
        height: 9,
        mines: 10
    },
    {
        name: "intermediate",
        width: 16,
        height: 16,
        mines: 40
    },
    {
        name: "expert",
        width: 30,
        height: 16,
        mines: 99
    }
]
const port = process.argv[2] || 5000;
const debug = process.argv.includes("--debug");
let pleadImage;
let sprites = {};

app.use(cors());

if(debug) {
    app.use("/test", express.static(path.join(__dirname, "test")));
    console.error("debug: Testing game encoding/decoding methods...");
    console.error("debug: Step 1: Creating new game...");
    let testGame = newGame(8, 8, 10);
    console.error("debug: Step 2: Encoding...");
    let encodedGame = encodeGame(testGame);
    console.error("debug: Step 3: Decoding...");
    let decodedGame = decodeGame(encodedGame, "$");
    console.error("debug: Step 4: Comparing...");
    let failed = false;
    for(let i = 0; i < testGame.tiles.length; i++) {
        let row = testGame.tiles[i];
        for(let j = 0; j < row.length; j++) {
            let tile = row[j];
            if(tile.bomb !== decodedGame.tiles[i][j].bomb) {
                failed = true;
                break;
            }
        }
    }
    console.error(`debug: ${failed ? "Warning: Test failed. Encoding/decoding might fail. This server version should not be used in production environments." : "Notice: Test finished with no errors."}`);
}
if(process.argv.includes("--trust-proxy")) {
    console.error("Notice: Running with trust proxy setting enabled.");
    app.enable("trust proxy");
}

app.get("/help", (req, res) => res.redirect("https://meow.sylv.cat/stuff/minesweeper.png.html"));

app.get("/embed", (req, res) => {
    console.error(`${req.ip} (${req.headers["user-agent"]}) has requested a minesweeper Discord embed.`);
    let game;
    let tileArr;
    let description = "";
    let title = "Minesweeper";
    let inSetup = !req.query.game || !req.query.actions;
    let difficulty = difficulties.find(d => d.name === req.query.type);
    let name = req.query.type || "embed";
    let useHttps = process.argv.includes("--https");
    console.error(`=> inSetup: ${inSetup}`);
    if(inSetup) {
        title = "Minesweeper - Game setup";
        if(!req.query.init) {
            description = `>> Please send the following message:
s/${name}/${name}?init=[random string]${difficulty ? `
Replace [random string] with a random string of characters.` : `&w=[width]&h=[height]&m=[mines]
Replace [random string] with, well, a random string of characters, [width] and [height] with your desired game dimensions, and [mines] with the amount of mines you'd like to play with.`}`;
        }
        else {
            let width = parseInt(difficulty?.width ||req.query.w || 0);
            let height = parseInt(difficulty?.height || req.query.h || 0);
            let mines = parseInt(difficulty?.mines || req.query.m || 0);
            let errorMessage;
            if(errorMessage = isInvalid(width, height, mines)) {
                description = `>> An error has occurred. Please start over.\n\n${errorMessage}`;
            }
            else {
                let game = newGame(width, height, mines);
                description = `>> Game created successfully.
Please send the following link in order to play:
http${useHttps ? "s" : ""}://${req.headers.host}/embed?actions=$&game=${encodeGame(game)}`;
            }
        }
    }
    else {
        game = decodeGame(req.query.game, req.query.actions);
        tileArr = to1DArray(game.tiles);
        if(checkForOpenBombs(game.tiles)) {
            description = ">> You lost!\n";
        }
        else if(checkIfGameIsOver(game.tiles)) {
            description = ">> You won!\n";
        }
        description += `🚩 Flags: ${tileArr.filter(t => t.flagged).length}
💣 Mines: ${tileArr.filter(t => t.bomb).length}
Commands (Replace x and y with coordinates on the map): 
dig: s/$/dx,y:$
flag: s/$/fx,y:$`;
    }
    let image = inSetup ? "" : `http${useHttps ? "s" : ""}://${req.headers.host}/${req.url.slice(req.url.indexOf("?"))}&disableText=1`;
    res.send(`<!DOCTYPE html>
<html>
    <head>
        <meta charset="utf-8">
        <meta property="twitter:card" content="summary_large_image">
        ${!inSetup ? `<meta property="twitter:image" content="${image}">` : "<!-- The embed image will go here, once setup is finished. -->"}
        <meta property="twitter:title" content="${title}">
        <meta property="twitter:description" content="${description}">
        <title>mines.sylv.cat</title>
    </head>
    <body>
        <h1>${title}</h1>
        <p>(You're meant to use this on Discord. Go to any Discord channel, and send this url)</p>
        <pre>${description}</pre>
        ${inSetup ? "" : `<img src="${image}" usemap="#mines"><map name="mines">${tileArr.map((m, i) => {
            let x = i % game.width;
            let y = Math.floor(i / game.width);
            return `<area shape="rect" coords="${x * tileSize},${y * tileSize},${(x + 1) * tileSize},${(y + 1) * tileSize}" href="${req.url.replace("$", `d${x + 1},${y + 1}:$`)}">`
        }).join("")}</map>`}
        <blockquote><p>alphys is W faps.</p></blockquote>
        <p>—SantyFo0x 15/02/2026</p>
    </body>
</html>`)
});

function isInvalid(width, height, mines) {
    if(width <= 0 || height <= 0) {
        return "Width and height must be greater than 0.";
    }
    else if(width > 255 || height > 255) {
        return "Width and height must be less than 255";
    }
    else if(width * height > 960) {
        return "Cannot exceed 960 squares.";
    }
    else if(width * height < mines) {
        return "Invalid mine count.";
    }
    return false;
}

app.get("/", (req, res) => {
    console.error(`${req.ip} (${req.headers["user-agent"]}) has requested a minesweeper game image.`);
    let game;
    let disableText = req.query.disableText === "true" || req.query.disableText === "1";
    if(!req.query.game || !req.query.actions) {
        game = newGame();
        redirect(res, game);
        return;
    }
    game = decodeGame(req.query.game, req.query.actions);
    let loggedGame = game.tiles.map((row, i) => {
        return row.map((t, j) => {
            if(!t.open) return "│\x1b[47m \x1b[0m";
            return t.bomb ? "│\x1b[30m\x1b[41m■\x1b[0m" : `│${getNearbyBombs(j, i, game.tiles) || " "}`;
        }).join("");
    }).join("\n")
    console.error(`Decoded game:
${loggedGame}`);
    process.stderr.write("Rendering image... ");
    //let wide = (game.width / game.height) > 1;
    //const canvas = createCanvas(768 * (wide ? game.width / game.height : 1), 768 * (wide ? 1 : game.height / game.width));
    //I will TRY to make it scale properly, i hope it doesn't catch on fire
    const canvas = createCanvas(game.width * tileSize, game.height * tileSize);
    const ctx = canvas.getContext("2d");
    let coordsFontSize = 25;
    let gameOverFontSize = 100;
    let lost = checkForOpenBombs(game.tiles);
    let won = checkIfGameIsOver(game.tiles);
    ctx.imageSmoothingEnabled = false;
    for(let i = 0; i < game.tiles.length; i++) {
        let row = game.tiles[i];
        for(let j = 0; j < row.length; j++) {
            let tile = row[j];
            drawSprite(ctx, "bg", j, i);
            if(tile.open) {
                if(!tile.bomb) {
                    let nearbyBombs = getNearbyBombs(j, i, game.tiles);
                    if(nearbyBombs > 0) {
                        drawSprite(ctx, nearbyBombs, j, i);
                    }
                }
                else {
                    drawSprite(ctx, "bgded", j, i);
                }
            }
            else if(!lost || (!tile.bomb && !tile.flagged) || (tile.flagged && tile.bomb)) {
                drawTile(ctx, j, i, tile.flagged, game.plead);
            }
            if(lost && ((tile.bomb && !tile.flagged) || (!tile.bomb && tile.flagged))) {
                drawSprite(ctx, "mine", j, i);
                if(!tile.bomb && tile.flagged) drawSprite(ctx, "nomine", j, i);
            }
            if(j === 0 || i === 0) {
                ctx.font = `${coordsFontSize}px sans-serif`;
                ctx.fillStyle = "black";
                let value = Number(j || i) + 1;
                ctx.fillText(value, j * tileSize, i * tileSize + coordsFontSize);
            }
        }
    }
    if((lost || won) && !disableText) {
        ctx.lineWidth = 3;
        let text = `You ${won ? "won" : "lost"}!`;
        ctx.fillStyle = "white";
        ctx.strokeStyle = "black";
        ctx.font = `${gameOverFontSize}px sans-serif`;
        let textWidth = ctx.measureText(text).width;
        ctx.beginPath();
        //oops i removed the humorous comment here by accident
        ctx.fillText(text, canvas.width / 2 - textWidth / 2, canvas.height / 2 + gameOverFontSize / 2);
        ctx.strokeText(text, canvas.width / 2 - textWidth / 2, canvas.height / 2 + gameOverFontSize / 2);
    }
    console.log("done")
    process.stdout.write("Sending image... ");
    res.contentType("image/png").send(canvas.toBuffer("image/png"));
    console.log("done");
});

function drawSprite(ctx, sprite, x, y) {
    ctx.drawImage(sprites[sprite], x * tileSize, y * tileSize, tileSize, tileSize);
}

function drawTile(ctx, x, y, flagged = false, plead = false, won = false) {
    if(!plead) {
        drawSprite(ctx, "square", x, y);
    }
    else {
        drawSprite(ctx, "plead", x, y);
    }
    if(flagged) {
        drawSprite(ctx, "flag", x, y);
    }
}
function checkForOpenBombs(tiles) {
    for(let row of tiles) {
        for(let tile of row) {
            if(tile.bomb && tile.open) return true;
        }
    }
    return false;
}

function checkIfGameIsOver(tiles) {
    for(let row of tiles) {
        for(let tile of row) {
            if(!tile.bomb && !tile.open) return false;
        }
    }
    return true;
}

function to1DArray(arr) {
    let output = [];
    arr.forEach(a => output = output.concat(a));
    return output;
}

function getNearbyBombs(x, y, tiles) {
    let output = 0;
    for(let i = -1; i < 2; i++) {
        for(let j = -1; j < 2; j++) {
            if(i === 0 && j === 0) continue;
            let row = tiles[y + i];
            if(!row) continue;
            let tile = row[x + j];
            if(!tile) continue;
            if(tile.bomb) output += 1;
        }
    }
    return output;
}

function redirect(res, game, embed = false) {
    res.redirect(`/?actions=$&game=${encodeGame(game)}`);
}

function encodeGame(game) {
    let data = [];
    data.push(game.width);
    data.push(game.height);
    for(let i = 0; i < game.tiles.length; i++) {
        let row = game.tiles[i];
        for(let j = 0; j < row.length; j++) {
            let tile = row[j];
            let n = Number(tile.bomb);
            let currentBit = j + i * row.length;
            if(currentBit % 8 === 0) {
                data.push(n);
            }
            else {
                data[data.length - 1] <<= 1;
                data[data.length - 1] += n;
            }
        }
    }
    let difference = (game.width * game.height) % 8;
    if(difference !== 0) data[data.length - 1 ] <<= 8 - difference;
    return Buffer.from(data).toString("base64url");
}

function decodeGame(str, actions) {
    let data = Buffer.from(str, "base64url");
    let tiles = [];
    let [ width, height ] = data;
    let game = { width, height, tiles };
    let errorMessage;
    if(errorMessage = isInvalid(game.width, game.height, 0)) throw new Error(errorMessage);
    for(let i = 0; i < height; i++) {
        let arr = [];
        for(let j = 0; j < width; j++) {
            let b = (j + i * width);
            let byteIndex = Math.floor(b / 8) + 2;
            let n = data[byteIndex];
            arr.push({ questionMark: false, flagged: false, open: false, bomb: Boolean((n >> 7 - (b % 8)) & 1) });
        }
        tiles.push(arr);
    }
    for(let action of actions.split(":")) {
        if(["", "$"].includes(action)) continue;
        switch(action) {
            case "plead" :
                game.plead = true;
            break;
            default :
                let [ x, y ] = action.slice(1).split(",");
                x = parseInt(x) - 1;
                y = parseInt(y) - 1;
                let type = action.charAt(0);
                if(x < 0 || y < 0 || x >= width || y >= height) continue;
                let tile = tiles[y][x];
                switch(type) {
                    case "d" :
                        dig(tiles, x, y);
                    break;
                    case "f" :
                        tile.flagged = !tile.flagged;
                        tile.questionMark = false;
                    break;
                    case "q" :
                        tile.questionMark = !tile.questionMark;
                        tile.flagged = false;
                    break;
                }
            break;
        }
        if(checkForOpenBombs(tiles)) break;
        if(checkIfGameIsOver(tiles)) {
            tiles.forEach(row => {
                row.forEach(t => {
                    if(t.bomb) t.flagged = true
                });
            });
            break;
        }
    }
    return game;
}

function dig(tiles, x, y) {
    let tile = tiles[y][x];
    if(tile.checked || tile.flagged) return;
    tile.open = true;
    tile.checked = true;
    if(tile.bomb || getNearbyBombs(x, y, tiles)) return;
    for(let i = -1; i <= 1; i++) {
        for(let j = -1; j <= 1; j++) {
            if(i === 0 && j === 0) continue;
            let row;
            if(!(row = tiles[y + i]) || !row[x + j]) continue;
            dig(tiles, x + j, y + i);
        }
    }
}

function newGame(width = 9, height = 9, bombs = 10) {
    let game = { width, height, tiles: [] };
    for(let i = 0; i < height; i++) {
        let arr = [];
        for(let j = 0; j < width; j++) {
            arr.push({ bomb: false, flagged: false, questionMark: false, open: false });
        }
        game.tiles.push(arr);
    }
    for(let i = 0; i < bombs; i++) {
        let pos = { x: 0, y: 0 };
        while(game.tiles[pos.y = Math.floor(Math.random() * height)][pos.x = Math.floor(Math.random() * width)].bomb) {}
        game.tiles[pos.y][pos.x].bomb = true;
    }
    return game;
}

function defineGameTypes() {
    let gameTypes = ["new"].concat(difficulties.map(d => d.name));
    for(let type of gameTypes) {
        app.get(`/${type}`, (req, res) => {
            let query = querystring.encode({ type, ...req.query });
            res.redirect(`/embed?${query}`);
        });
    }
}

async function loadSprites() {
    console.error("Loading sprites...");
    let assetsPath = path.join(__dirname, "assets");
    let files = fs.readdirSync(assetsPath);
    for(let file of files) {
        let name = file.slice(0, file.lastIndexOf("."));
        sprites[name] = await loadImage(path.join(assetsPath, file));
        console.error(`Sprite \`${name}\` loaded.`);
    }
}

defineGameTypes();

loadSprites().then(() => {
    app.listen(port, () => console.error(`Listening on port ${port}.`));
});
