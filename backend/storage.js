
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

const dataDir = path.join(__dirname, "data");
const templateDir = path.join(__dirname, "data-template");

// First run: create the data folder from data-template, so no copy step is needed.
// Existing data is never overwritten; only missing files are added.
function ensureDataFolder() {
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    for (const name of allowedFiles) {
        const target = path.join(dataDir, name + ".json");

        if (!fs.existsSync(target)) {
            const template = path.join(templateDir, name + ".json");
            const content = fs.existsSync(template)
                ? fs.readFileSync(template, "utf8")
                : "[]";
            fs.writeFileSync(target, content);
        }
    }
}

ensureDataFolder();

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
    ensureDataFolder,
    readData,
    writeData
};
