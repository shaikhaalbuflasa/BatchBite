/*
 * BatchBite - create the first Administrator account
 * --------------------------------------------------
 * The backend only lets people register as Customers, and only an
 * Administrator can change roles. A fresh database (data-template) has no
 * accounts, so the first Administrator has to be created once with this script.
 *
 * Run it with the backend STOPPED, from the frontend folder:
 *   node tools/create-admin.js ../backend/data
 *
 * It asks for name, email and password, hashes the password exactly like
 * server.js (scrypt + random salt, saved as "salt:hash") and adds the user to
 * data/users.json. It never prints or stores the plain password.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

const dataDir = path.resolve(process.argv[2] || '../backend/data');
const usersFile = path.join(dataDir, 'users.json');

if (!fs.existsSync(usersFile)) {
  console.error('Could not find ' + usersFile);
  console.error('Usage: node tools/create-admin.js <path to backend data folder>');
  process.exit(1);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return salt + ':' + hash;
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
const lines = [];
const waiting = [];
rl.on('line', line => (waiting.length ? waiting.shift()(line) : lines.push(line)));
rl.on('close', () => { while (waiting.length) waiting.shift()(''); });

let hideInput = false;
const originalWrite = process.stdout.write.bind(process.stdout);
rl._writeToOutput = text => { if (!hideInput) originalWrite(text); };

function ask(question, hidden) {
  originalWrite(question);
  hideInput = !!hidden;
  return new Promise(resolve => {
    const done = answer => {
      if (hidden) originalWrite('\n');
      hideInput = false;
      resolve(answer);
    };
    lines.length ? done(lines.shift()) : waiting.push(done);
  });
}

(async () => {
  const users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));

  const name = (await ask('Administrator full name: ')).trim();
  const email = (await ask('Administrator email: ')).trim().toLowerCase();
  const password = await ask('Password (at least 8 characters): ', true);
  rl.close();

  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    console.error('A full name and a valid email are required.');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('The password must be at least 8 characters.');
    process.exit(1);
  }
  if (users.some(user => String(user.email).toLowerCase() === email)) {
    console.error('An account with this email already exists.');
    process.exit(1);
  }

  const id = users.length ? Math.max(...users.map(user => user.id)) + 1 : 1;
  users.push({ id, name, email, passwordHash: hashPassword(password), role: 'Administrator', isActive: true });
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
  console.log('Administrator account #' + id + ' created for ' + email + '. You can now start the backend and log in.');
})();
