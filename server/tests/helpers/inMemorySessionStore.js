const session = require('express-session');

class InMemorySessionStore extends session.Store {
  constructor() {
    super();
    this.sessions = new Map();
  }

  get(sessionId, callback) {
    const serialized = this.sessions.get(sessionId);

    if (!serialized) {
      callback?.(null, null);
      return;
    }

    callback?.(null, JSON.parse(serialized));
  }

  set(sessionId, sessionData, callback) {
    this.sessions.set(sessionId, JSON.stringify(sessionData));
    callback?.(null);
  }

  destroy(sessionId, callback) {
    this.sessions.delete(sessionId);
    callback?.(null);
  }

  touch(sessionId, sessionData, callback) {
    this.sessions.set(sessionId, JSON.stringify(sessionData));
    callback?.(null);
  }

  length(callback) {
    callback?.(null, this.sessions.size);
  }

  all(callback) {
    const allSessions = [...this.sessions.values()].map((entry) => JSON.parse(entry));
    callback?.(null, allSessions);
  }

  clear(callback) {
    this.sessions.clear();
    callback?.(null);
  }
}

module.exports = { InMemorySessionStore };
