const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const OWNER_FILE = 'owner.json';
const INCOMPLETE_OWNER_GRACE_MS = 30_000;

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function readOwner(lockDirectory) {
  try {
    const owner = JSON.parse(fs.readFileSync(path.join(lockDirectory, OWNER_FILE), 'utf8'));
    if (!Number.isInteger(owner.pid) || owner.pid <= 0 || typeof owner.token !== 'string') return null;
    return owner;
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EISDIR' || error instanceof SyntaxError) return null;
    throw error;
  }
}

function busyMessage(lockDirectory, owner) {
  if (!owner) {
    return `Verification is already starting in this checkout. Wait for it to finish before starting another run. Lease: ${lockDirectory}`;
  }
  return `Verification is already running in this checkout (${owner.mode}, PID ${owner.pid}, started ${owner.startedAt}). Wait for it to finish before starting another run. Lease: ${lockDirectory}`;
}

function retireStaleLease(lockDirectory, token) {
  const retiredDirectory = `${lockDirectory}.stale-${process.pid}-${token}`;
  try {
    fs.renameSync(lockDirectory, retiredDirectory);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EEXIST' || error.code === 'EPERM') return false;
    throw error;
  }
  fs.rmSync(retiredDirectory, { recursive: true, force: true });
  return true;
}

function acquireVerificationLease({
  repoRoot,
  mode,
  pid = process.pid,
  now = () => Date.now(),
  isProcessAlive = processIsAlive,
  incompleteOwnerGraceMs = INCOMPLETE_OWNER_GRACE_MS
}) {
  if (!repoRoot || !mode) throw new Error('Verification lease requires repoRoot and mode.');
  const parentDirectory = path.join(repoRoot, '.cache');
  const lockDirectory = path.join(parentDirectory, 'verification-run');
  const token = crypto.randomUUID();
  fs.mkdirSync(parentDirectory, { recursive: true });

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      fs.mkdirSync(lockDirectory);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const owner = readOwner(lockDirectory);
      if (owner && isProcessAlive(owner.pid)) throw new Error(busyMessage(lockDirectory, owner));
      if (!owner) {
        let ageMs = 0;
        try {
          ageMs = now() - fs.statSync(lockDirectory).mtimeMs;
        } catch (statError) {
          if (statError.code === 'ENOENT') continue;
          throw statError;
        }
        if (ageMs < incompleteOwnerGraceMs) throw new Error(busyMessage(lockDirectory, null));
      }
      if (!retireStaleLease(lockDirectory, token)) continue;
      continue;
    }

    const owner = {
      pid,
      mode,
      startedAt: new Date(now()).toISOString(),
      hostname: os.hostname(),
      token
    };
    try {
      fs.writeFileSync(path.join(lockDirectory, OWNER_FILE), `${JSON.stringify(owner, null, 2)}\n`, { flag: 'wx' });
    } catch (error) {
      fs.rmSync(lockDirectory, { recursive: true, force: true });
      throw error;
    }

    let released = false;
    return {
      lockDirectory,
      owner,
      release() {
        if (released) return false;
        released = true;
        const currentOwner = readOwner(lockDirectory);
        if (!currentOwner || currentOwner.token !== token) return false;
        const retiredDirectory = `${lockDirectory}.released-${pid}-${token}`;
        try {
          fs.renameSync(lockDirectory, retiredDirectory);
        } catch (error) {
          if (error.code === 'ENOENT') return false;
          throw error;
        }
        fs.rmSync(retiredDirectory, { recursive: true, force: true });
        return true;
      }
    };
  }
  throw new Error(`Could not acquire the verification lease after concurrent recovery attempts: ${lockDirectory}`);
}

module.exports = { acquireVerificationLease, processIsAlive };
