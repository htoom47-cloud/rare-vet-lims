/** Split SQL into statements. Semicolons inside $tag$ ... $tag$ dollar quotes are kept. */

const splitSqlStatements = (sql) => {
  const parts = [];
  let current = '';
  let dollarTag = null;
  for (let i = 0; i < sql.length; i += 1) {
    if (dollarTag) {
      if (sql.startsWith(dollarTag, i)) {
        current += dollarTag;
        i += dollarTag.length - 1;
        dollarTag = null;
        continue;
      }
      current += sql[i];
      continue;
    }
    if (sql[i] === '$') {
      const fromHere = sql.slice(i);
      const match = fromHere.match(/^\$[A-Za-z0-9_]*\$/);
      if (match) {
        dollarTag = match[0];
        current += match[0];
        i += match[0].length - 1;
        continue;
      }
    }
    if (sql[i] === ';') {
      const statement = current.trim();
      if (statement && !statement.split('\n').every((line) => !line.trim() || line.trim().startsWith('--'))) {
        parts.push(statement);
      }
      current = '';
      continue;
    }
    current += sql[i];
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
};

module.exports = { splitSqlStatements };
