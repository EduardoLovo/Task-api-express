const { isUniqueViolation } = require('../../db/database');
const { conflict } = require('../../errors/AppError');

function toUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function createUserRepository(db) {
  const findByIdStmt = db.prepare('SELECT * FROM users WHERE id = ?');
  const findByEmailStmt = db.prepare('SELECT * FROM users WHERE email = ?');
  const insertStmt = db.prepare(`
    INSERT INTO users (name, email, password_hash, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  return {
    findById(id) {
      return toUser(findByIdStmt.get(id));
    },

    findByEmail(email) {
      return toUser(findByEmailStmt.get(email));
    },

    create({ name, email, passwordHash }) {
      const now = new Date().toISOString();
      try {
        const { lastInsertRowid } = insertStmt.run(name, email, passwordHash, now, now);
        return this.findById(Number(lastInsertRowid));
      } catch (err) {
        // Cobre a corrida entre a checagem prévia e o INSERT.
        if (isUniqueViolation(err)) {
          throw conflict('EMAIL_ALREADY_EXISTS', 'Este e-mail já está cadastrado');
        }
        throw err;
      }
    },
  };
}

module.exports = { createUserRepository };
