const bcrypt = require('bcryptjs');

function normalizeUsername(username) {
  return String(username || '').trim();
}

function validateUsername(username) {
  // Allow lichess-like usernames plus underscore
  // Keep it simple: 3-24, alnum underscore
  return /^[a-zA-Z0-9_]{3,24}$/.test(username);
}

function validatePassword(password) {
  return typeof password === 'string' && password.length >= 8 && password.length <= 72;
}

async function hashPassword(password) {
  const saltRounds = 12;
  return bcrypt.hash(password, saltRounds);
}

async function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

module.exports = {
  normalizeUsername,
  validateUsername,
  validatePassword,
  hashPassword,
  verifyPassword,
};
