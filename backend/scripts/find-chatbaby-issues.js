const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://admin:4sWzqr8Cbsz68v40Y4rpqMEw9xkhcHDn@dpg-d4ugfaili9vc73d53c70-a.singapore-postgres.render.com:5432/chatbaby_db',
  ssl: { rejectUnauthorized: false }
});

const CONV_ID = '697d2f13-20dc-462b-9fe6-dbf144e60aec';

async function run() {
  await client.connect();

  console.log('='.repeat(60));
  console.log('FINDING CHATBABY-SENT ISSUES');
  console.log('='.repeat(60));

  // Check all messages with sent_by_user_id (definitely sent via Chatbaby)
  console.log('\n=== ALL MESSAGES SENT VIA CHATBABY UI ===\n');
  const allChatbaby = await client.query(`
    SELECT m.id, m.type, m.status, m.content, m.metadata, m.created_at,
           u.first_name, u.last_name, u.email
    FROM messages m
    LEFT JOIN users u ON m.sent_by_user_id = u.id
    WHERE m.conversation_id = $1
    AND m.direction = 'OUTBOUND'
    AND m.sent_by_user_id IS NOT NULL
    ORDER BY m.created_at DESC
  `, [CONV_ID]);

  console.log('Total Chatbaby UI messages:', allChatbaby.rows.length);
  allChatbaby.rows.forEach(m => {
    console.log('\nID:', m.id);
    console.log('Type:', m.type, '| Status:', m.status);
    console.log('User:', m.first_name, m.last_name, '(' + m.email + ')');
    console.log('Created:', m.created_at);
    console.log('Content:', JSON.stringify(m.content, null, 2));
  });

  // Check for FAILED messages
  console.log('\n=== FAILED OUTBOUND MESSAGES ===\n');
  const failed = await client.query(`
    SELECT id, type, status, content, metadata, created_at, failed_reason
    FROM messages
    WHERE conversation_id = $1
    AND direction = 'OUTBOUND'
    AND status = 'FAILED'
    ORDER BY created_at DESC
    LIMIT 10
  `, [CONV_ID]);
  console.log('Failed messages:', failed.rows.length);
  failed.rows.forEach(m => {
    console.log('ID:', m.id);
    console.log('Reason:', m.failed_reason || 'No reason');
    console.log('---');
  });

  // Check for PENDING messages (stuck)
  console.log('\n=== STUCK PENDING MESSAGES ===\n');
  const pending = await client.query(`
    SELECT id, type, status, content, created_at
    FROM messages
    WHERE conversation_id = $1
    AND direction = 'OUTBOUND'
    AND status = 'PENDING'
    ORDER BY created_at DESC
    LIMIT 10
  `, [CONV_ID]);
  console.log('Pending messages:', pending.rows.length);

  // Check for messages WITHOUT external_id (never sent to WhatsApp)
  console.log('\n=== OUTBOUND WITHOUT external_id ===\n');
  const noExtId = await client.query(`
    SELECT id, type, status, content, created_at, sent_by_user_id
    FROM messages
    WHERE conversation_id = $1
    AND direction = 'OUTBOUND'
    AND external_id IS NULL
    ORDER BY created_at DESC
    LIMIT 10
  `, [CONV_ID]);
  console.log('Without external_id:', noExtId.rows.length);

  // Let's look at ALL group conversations to see total Chatbaby-sent messages
  console.log('\n=== CHATBABY-SENT ACROSS ALL GROUPS ===\n');
  const allGroups = await client.query(`
    SELECT
      co.display_name as group_name,
      c.id as conv_id,
      COUNT(*) FILTER (WHERE m.sent_by_user_id IS NOT NULL) as chatbaby_sent,
      COUNT(*) FILTER (WHERE m.sent_by_user_id IS NULL AND m.direction = 'OUTBOUND') as other_outbound
    FROM messages m
    JOIN conversations c ON m.conversation_id = c.id
    JOIN contacts co ON c.contact_id = co.id
    WHERE co.is_group = true
    AND m.direction = 'OUTBOUND'
    GROUP BY co.display_name, c.id
    HAVING COUNT(*) FILTER (WHERE m.sent_by_user_id IS NOT NULL) > 0
    ORDER BY chatbaby_sent DESC
    LIMIT 10
  `, []);
  console.log('Group | Conv ID | Chatbaby Sent | Other Outbound');
  allGroups.rows.forEach(r => {
    console.log(`${(r.group_name || 'Unknown').slice(0, 30)} | ${r.conv_id.slice(0, 8)} | ${r.chatbaby_sent} | ${r.other_outbound}`);
  });

  await client.end();
}

run().catch(console.error);
