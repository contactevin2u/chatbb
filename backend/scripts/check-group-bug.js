const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://admin:4sWzqr8Cbsz68v40Y4rpqMEw9xkhcHDn@dpg-d4ugfaili9vc73d53c70-a.singapore-postgres.render.com:5432/chatbaby_db',
  ssl: { rejectUnauthorized: false }
});

const GROUP_ID = '120363409615271242';
const CONV_ID = '697d2f13-20dc-462b-9fe6-dbf144e60aec';

async function run() {
  await client.connect();

  // Check all WhatsApp channels
  console.log('=== ALL WHATSAPP CHANNELS ===\n');
  const channels = await client.query(`
    SELECT id, name, type, status
    FROM channels WHERE type = 'WHATSAPP'
  `);
  channels.rows.forEach(c => {
    console.log('Channel:', c.name, '| ID:', c.id, '| Status:', c.status);
  });

  // Check if this group has multiple conversations (from different channels)
  console.log('\n=== CONVERSATIONS FOR THIS GROUP ===\n');
  const convs = await client.query(`
    SELECT c.id, c.channel_id, ch.name as channel_name, c.status,
           (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as msg_count
    FROM conversations c
    JOIN contacts co ON c.contact_id = co.id
    JOIN channels ch ON c.channel_id = ch.id
    WHERE co.identifier = $1
  `, [GROUP_ID]);
  console.log('Found', convs.rows.length, 'conversations for this group:');
  convs.rows.forEach(c => {
    console.log('Conv ID:', c.id);
    console.log('  Channel:', c.channel_name);
    console.log('  Status:', c.status);
    console.log('  Messages:', c.msg_count);
    console.log('---');
  });

  // Check outbound messages from different senders (different WhatsApp accounts)
  console.log('\n=== OUTBOUND MESSAGE SENDERS (Your WhatsApp accounts) ===\n');
  const senders = await client.query(`
    SELECT
      metadata->'key'->>'participant' as sender_lid,
      metadata->>'pushName' as push_name,
      COUNT(*) as msg_count
    FROM messages
    WHERE conversation_id = $1
    AND direction = 'OUTBOUND'
    GROUP BY metadata->'key'->>'participant', metadata->>'pushName'
    ORDER BY msg_count DESC
    LIMIT 10
  `, [CONV_ID]);
  console.log('Different senders for OUTBOUND messages:');
  senders.rows.forEach(s => {
    console.log(s.push_name || 'Unknown', '-', s.msg_count, 'messages');
    console.log('  LID:', s.sender_lid);
  });

  // Check if messages are being filtered/hidden by channel
  console.log('\n=== MESSAGES BY CHANNEL (checking if split between channels) ===\n');
  const byChannel = await client.query(`
    SELECT ch.name, COUNT(*) as msg_count
    FROM messages m
    JOIN conversations c ON m.conversation_id = c.id
    JOIN channels ch ON c.channel_id = ch.id
    JOIN contacts co ON c.contact_id = co.id
    WHERE co.identifier = $1
    GROUP BY ch.name
  `, [GROUP_ID]);
  byChannel.rows.forEach(r => console.log(r.name, '-', r.msg_count, 'messages'));

  // Check for gaps due to empty content
  console.log('\n=== EMPTY vs VALID MESSAGES TIMELINE ===\n');
  const timeline = await client.query(`
    SELECT
      DATE(created_at) as date,
      COUNT(*) FILTER (WHERE content::text != '{}' AND content IS NOT NULL) as valid,
      COUNT(*) FILTER (WHERE content::text = '{}' OR content IS NULL) as empty
    FROM messages
    WHERE conversation_id = $1
    GROUP BY DATE(created_at)
    ORDER BY date DESC
    LIMIT 10
  `, [CONV_ID]);
  console.log('Last 10 days - Valid vs Empty messages:');
  timeline.rows.forEach(r => console.log(r.date.toISOString().split('T')[0], '- Valid:', r.valid, '| Empty:', r.empty));

  // Check for remoteJid patterns (different group IDs in messages)
  console.log('\n=== REMOTE JID PATTERNS IN MESSAGES ===\n');
  const jids = await client.query(`
    SELECT
      metadata->'key'->>'remoteJid' as remote_jid,
      COUNT(*) as cnt
    FROM messages
    WHERE conversation_id = $1
    AND metadata->'key'->>'remoteJid' IS NOT NULL
    GROUP BY metadata->'key'->>'remoteJid'
    ORDER BY cnt DESC
    LIMIT 5
  `, [CONV_ID]);
  console.log('Remote JIDs found in messages:');
  jids.rows.forEach(j => console.log(j.remote_jid, '-', j.cnt, 'messages'));

  await client.end();
}

run().catch(console.error);
