const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://admin:4sWzqr8Cbsz68v40Y4rpqMEw9xkhcHDn@dpg-d4ugfaili9vc73d53c70-a.singapore-postgres.render.com:5432/chatbaby_db',
  ssl: { rejectUnauthorized: false }
});

const CONV_ID = '697d2f13-20dc-462b-9fe6-dbf144e60aec';

async function run() {
  await client.connect();

  // Check total message count
  console.log('=== TOTAL MESSAGES ===\n');
  const total = await client.query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE direction = 'OUTBOUND') as outbound,
      COUNT(*) FILTER (WHERE direction = 'INBOUND') as inbound
    FROM messages WHERE conversation_id = $1
  `, [CONV_ID]);
  console.log('Total:', total.rows[0].total);
  console.log('Outbound:', total.rows[0].outbound);
  console.log('Inbound:', total.rows[0].inbound);

  // Check outbound messages status
  console.log('\n=== OUTBOUND STATUS ===\n');
  const status = await client.query(`
    SELECT status, COUNT(*) as cnt
    FROM messages
    WHERE conversation_id = $1 AND direction = 'OUTBOUND'
    GROUP BY status
  `, [CONV_ID]);
  status.rows.forEach(r => console.log(r.status, '-', r.cnt));

  // Check outbound with/without external_id
  console.log('\n=== OUTBOUND EXTERNAL_ID ===\n');
  const extId = await client.query(`
    SELECT
      COUNT(*) FILTER (WHERE external_id IS NOT NULL) as with_ext,
      COUNT(*) FILTER (WHERE external_id IS NULL) as without_ext
    FROM messages
    WHERE conversation_id = $1 AND direction = 'OUTBOUND'
  `, [CONV_ID]);
  console.log('With external_id:', extId.rows[0].with_ext);
  console.log('Without external_id (not sent):', extId.rows[0].without_ext);

  // Sample recent outbound
  console.log('\n=== RECENT OUTBOUND (last 10) ===\n');
  const recent = await client.query(`
    SELECT id, status, external_id, type,
           SUBSTRING(content->>'text', 1, 40) as text_preview,
           created_at
    FROM messages
    WHERE conversation_id = $1 AND direction = 'OUTBOUND'
    ORDER BY created_at DESC
    LIMIT 10
  `, [CONV_ID]);
  recent.rows.forEach(m => {
    console.log('ID:', m.id.slice(0, 8) + '...');
    console.log('  Type:', m.type, '| Status:', m.status);
    console.log('  ExtID:', m.external_id ? 'YES' : 'NO');
    console.log('  Text:', m.text_preview || '[no text]');
    console.log('  Created:', m.created_at);
  });

  // Check message types breakdown
  console.log('\n=== ALL MESSAGE TYPES ===\n');
  const types = await client.query(`
    SELECT type, direction, COUNT(*) as cnt
    FROM messages WHERE conversation_id = $1
    GROUP BY type, direction
    ORDER BY cnt DESC
  `, [CONV_ID]);
  types.rows.forEach(r => console.log(r.direction, r.type, '-', r.cnt));

  await client.end();
}

run().catch(console.error);
