// The runtime receives function EXECUTE only; table names and SQL remain fixed.
const SQL = 'SELECT prepvault_board.board_action($1::text, $2::jsonb, $3::text, $4::text, $5::boolean) AS result';
export function createBoardStore(sql) {
  if (typeof sql?.query !== 'function') throw new TypeError('A Neon query client is required.');
  return {
    async perform(action, input, { authorKey, networkKey, owner = false }) {
      try {
        const rows = await sql.query(SQL, [action, JSON.stringify(input), authorKey, networkKey, owner === true]);
        return rows.length === 1 ? rows[0]?.result : { error: 'unavailable' };
      } catch {
        // Driver errors can include connection strings, SQL and private hashes.
        return { error: 'unavailable' };
      }
    },
  };
}
