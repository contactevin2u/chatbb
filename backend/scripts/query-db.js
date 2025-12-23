const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://admin:4sWzqr8Cbsz68v40Y4rpqMEw9xkhcHDn@dpg-d4ugfaili9vc73d53c70-a.singapore-postgres.render.com:5432/chatbaby_db',
  ssl: { rejectUnauthorized: false }
});

async function query() {
  try {
    await client.connect();
    console.log('Connected to database!\n');

    // Get all group contacts
    console.log('=== GROUP CONTACTS ===\n');
    const groups = await client.query(`
      SELECT id, identifier, display_name, metadata, created_at
      FROM contacts
      WHERE is_group = true
      ORDER BY created_at DESC
      LIMIT 20
    `);
    console.log('Found', groups.rows.length, 'group contacts:\n');
    groups.rows.forEach(g => {
      console.log('ID:', g.id);
      console.log('Name:', g.display_name || g.identifier);
      console.log('Identifier:', g.identifier);
      console.log('Metadata:', JSON.stringify(g.metadata, null, 2));
      console.log('---');
    });

    // Get group conversations with message counts
    console.log('\n=== GROUP CONVERSATIONS ===\n');
    const convs = await client.query(`
      SELECT c.id, c.status, co.display_name, co.identifier,
             (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as msg_count,
             c.last_message_at
      FROM conversations c
      JOIN contacts co ON c.contact_id = co.id
      WHERE co.is_group = true
      ORDER BY c.last_message_at DESC NULLS LAST
      LIMIT 20
    `);
    console.log('Found', convs.rows.length, 'group conversations:\n');
    convs.rows.forEach(c => {
      console.log('Conv ID:', c.id);
      console.log('Group:', c.display_name || c.identifier);
      console.log('Status:', c.status);
      console.log('Messages:', c.msg_count);
      console.log('Last Message:', c.last_message_at);
      console.log('---');
    });

    // Get recent group messages
    console.log('\n=== RECENT GROUP MESSAGES ===\n');
    const msgs = await client.query(`
      SELECT m.id, m.direction, m.content, m.metadata, m.created_at, co.display_name
      FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      JOIN contacts co ON c.contact_id = co.id
      WHERE co.is_group = true
      ORDER BY m.created_at DESC
      LIMIT 10
    `);
    msgs.rows.forEach(m => {
      console.log('Msg ID:', m.id);
      console.log('Group:', m.display_name);
      console.log('Direction:', m.direction);
      console.log('Content:', JSON.stringify(m.content).slice(0, 150));
      console.log('Metadata:', JSON.stringify(m.metadata, null, 2));
      console.log('Created:', m.created_at);
      console.log('---');
    });

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
  }
}

query();
