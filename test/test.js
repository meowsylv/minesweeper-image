let minesweeperImage = document.getElementById("minesweeper-image");
let customSeedForm = document.getElementById("custom-seed-form");
let btnNew = document.getElementById("btn-new");
let width = 8;
let height = 8;
let checkboxes = [];
let txtURL = document.getElementById("txt-url");
async function newGame() {
    let url = await getMinesweeperURL();
    minesweeperImage.src = url;
    updateURL();
}

//You know what? fuck btoa(). Doing this shit manually.
customSeedForm.addEventListener("submit", ev => {
    ev.preventDefault();
    let data = checkboxes.map(arr => { return arr.map(c => Number(c.checked)) });
    let tiles = [];
    for(let i = 0; i < data.length; i++) {
        let row = data[i];
        for(let j = 0; j < row.length; j++) {
            let byte = row[j];
            let pos = j + i * width;
            if(pos % 8 === 0) tiles.push(0);
            tiles[tiles.length - 1] <<= 1;
            tiles[tiles.length - 1] += byte;
        }
    }
    let output = [width, height].concat(tiles);
    let base = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let bytes = output.map(b => addZeros(b.toString(2), 8)).join("");
    let encoded = "";
    for(let i = 0; i < Math.ceil(bytes.length / 6); i++) {
        let n = bytes.slice(i * 6, (i + 1) * 6);
        n = parseInt(`${n}${"0".repeat(6 - n.length)}`, 2);
        encoded += base.charAt(n);
    }
    minesweeperImage.src = `/?actions=$&game=${encoded}`;
    updateURL();
});

function updateURL() {
    txtURL.href = minesweeperImage.src;
    txtURL.innerText = minesweeperImage.src;
}

function addZeros(n, b) {
    return `${"0".repeat(b - n.toString().length)}${n}`;
}

newGame();

for(let i = 0; i < height; i++) {
    let arr = [];
    customSeedForm.prepend(document.createElement("br"));
    for(let j = 0; j < width; j++) {
        let checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        customSeedForm.prepend(checkbox);
        arr.unshift(checkbox);
    }
    checkboxes.unshift(arr);
}

btnNew.addEventListener("click", ev => {
    newGame();
});

minesweeperImage.addEventListener("click", ev => {
    let bounds = ev.target.getBoundingClientRect();
    let mousePos = { x: ev.clientX - bounds.left, y: ev.clientY - bounds.top };
    let pos = getPosition(mousePos);
    minesweeperImage.src = minesweeperImage.src.replace("$", `d${pos.x},${pos.y}:$`)
    updateURL();
});

minesweeperImage.addEventListener("contextmenu", ev => {
    ev.preventDefault();
    let bounds = ev.target.getBoundingClientRect();
    let mousePos = { x: ev.clientX - bounds.left, y: ev.clientY - bounds.top };
    let pos = getPosition(mousePos);
    minesweeperImage.src = minesweeperImage.src.replace("$", `f${pos.x},${pos.y}:$`)
    updateURL();
});

function getPosition(mousePos) {
    let tileWidth = 768 / width;
    let tileHeight = 768 / height;
    let pos = { x: Math.floor(mousePos.x / tileWidth) + 1, y: Math.floor(mousePos.y / tileHeight) + 1 };
    return pos;
}

async function getMinesweeperURL() {
    return (await fetch("/")).url;
}
