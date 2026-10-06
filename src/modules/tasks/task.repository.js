const COLUMN_BY_FIELD = {
  title: 'title',
  description: 'description',
  status: 'status',
  priority: 'priority',
  dueDate: 'due_date',
};

const ORDER_BY = {
  createdAt: (dir) => `created_at ${dir}, id ${dir}`,
  // Tarefas sem prazo sempre ficam no final, independente da direção.
  dueDate: (dir) => `due_date IS NULL, due_date ${dir}, id ${dir}`,
  priority: (dir) => `CASE priority WHEN 'low' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END ${dir}, id ${dir}`,
  title: (dir) => `title COLLATE NOCASE ${dir}, id ${dir}`,
};

function toTask(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    dueDate: row.due_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function escapeLike(value) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function createTaskRepository(db) {
  const findByIdStmt = db.prepare('SELECT * FROM tasks WHERE id = ?');
  const deleteStmt = db.prepare('DELETE FROM tasks WHERE id = ?');
  const insertStmt = db.prepare(`
    INSERT INTO tasks (user_id, title, description, status, priority, due_date, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  return {
    findById(id) {
      return toTask(findByIdStmt.get(id));
    },

    list({ userId, status, priority, search, page, limit, sortBy, order }) {
      const where = ['user_id = ?'];
      const params = [userId];

      if (status) {
        where.push('status = ?');
        params.push(status);
      }
      if (priority) {
        where.push('priority = ?');
        params.push(priority);
      }
      if (search) {
        where.push("(title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')");
        const pattern = `%${escapeLike(search)}%`;
        params.push(pattern, pattern);
      }

      const whereSql = where.join(' AND ');
      // sortBy e order já foram validados contra uma lista fechada (sem injeção).
      const orderSql = ORDER_BY[sortBy](order.toUpperCase());

      const { total } = db.prepare(`SELECT COUNT(*) AS total FROM tasks WHERE ${whereSql}`).get(...params);
      const rows = db
        .prepare(`SELECT * FROM tasks WHERE ${whereSql} ORDER BY ${orderSql} LIMIT ? OFFSET ?`)
        .all(...params, limit, (page - 1) * limit);

      return { items: rows.map(toTask), total };
    },

    create(userId, { title, description = null, status, priority, dueDate = null }) {
      const now = new Date().toISOString();
      const { lastInsertRowid } = insertStmt.run(userId, title, description, status, priority, dueDate, now, now);
      return this.findById(Number(lastInsertRowid));
    },

    update(id, fields) {
      const sets = [];
      const params = [];
      for (const [field, value] of Object.entries(fields)) {
        const column = COLUMN_BY_FIELD[field];
        if (!column) continue;
        sets.push(`${column} = ?`);
        params.push(value);
      }
      sets.push('updated_at = ?');
      params.push(new Date().toISOString(), id);

      db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).run(...params);
      return this.findById(id);
    },

    delete(id) {
      deleteStmt.run(id);
    },
  };
}

module.exports = { createTaskRepository };
