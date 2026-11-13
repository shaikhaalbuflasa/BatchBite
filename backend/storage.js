
const fs = require("fs");
const path = require("path");

const allowedFiles = [
    "users",
    "products",
    "batches",
    "orders",
    "pickupSlots",
    "productionTasks",
    "ingredients",
    "recipes",
    "notifications",
    "stockHolds",
    "sessions"
];

function readData(fileName) {
    if (!allowedFiles.includes(fileName)) {
        throw new Error("Invalid data file");
    }

    const filePath = path.join(__dirname, "data", fileName + ".json");

    const data = fs.readFileSync(filePath, "utf8");

    return JSON.parse(data);
}

function writeData(fileName, data) {
    if (!allowedFiles.includes(fileName)) {
        throw new Error("Invalid data file");
    }

    const filePath = path.join(__dirname, "data", fileName + ".json");

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

module.exports = {
    readData,
    writeData
};
