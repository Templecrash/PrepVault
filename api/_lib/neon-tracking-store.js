// The runtime database role can execute this function, but cannot access tables.
// Keep SQL identifiers fixed: only these positional values come from requests.
const ACTION_SQL = `SELECT prepvault.prepvault_tracking_action(
  $1::text, $2::text, $3::text, $4::text, $5::text, $6::uuid,
  $7::text, $8::text, $9::integer, $10::double precision,
  $11::double precision, $12::double precision, $13::timestamptz
) AS result`;

const ARGUMENTS = [
  'p_action', 'p_owner_id', 'p_owner_name', 'p_token_hash', 'p_new_token_hash',
  'p_session_id', 'p_name', 'p_phone', 'p_duration_minutes', 'p_lat', 'p_lng',
  'p_accuracy', 'p_captured_at',
];
const ARGUMENT_NAMES = new Set(ARGUMENTS);
const ACTIONS = new Set(['list', 'create', 'revoke', 'inspect', 'start', 'update', 'stop']);
const failed = code => ({ data: null, error: { code } });

/** Adapt a Neon HTTP query client to the tracking service's storage boundary. */
export function createNeonTrackingStore(sql) {
  if (typeof sql?.query !== 'function') throw new TypeError('A Neon query client is required.');

  return {
    async rpc(name, args) {
      if (name !== 'prepvault_tracking_action' || !args || typeof args !== 'object' || Array.isArray(args)
          || !Object.hasOwn(args, 'p_action') || !ACTIONS.has(args.p_action)
          || Object.keys(args).some(key => !ARGUMENT_NAMES.has(key))) {
        return failed('INVALID_TRACKING_QUERY');
      }

      try {
        const rows = await sql.query(ACTION_SQL, ARGUMENTS.map(key => Object.hasOwn(args, key) ? args[key] ?? null : null));
        const data = Array.isArray(rows) && rows.length === 1 ? rows[0]?.result : null;
        if (!data || typeof data !== 'object' || Array.isArray(data)) return failed('INVALID_TRACKING_RESULT');
        return { data, error: null };
      } catch (error) {
        // Preserve only the two SQLSTATEs needed to identify a missing migration.
        // Driver errors can contain connection details, SQL and sensitive values.
        return failed(['42P01', '42883'].includes(error?.code) ? error.code : 'TRACKING_DATABASE_ERROR');
      }
    },
  };
}
