const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://admin:4sWzqr8Cbsz68v40Y4rpqMEw9xkhcHDn@dpg-d4ugfaili9vc73d53c70-a.singapore-postgres.render.com:5432/chatbaby_db',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();

  // Count total messages
  const count = await client.query(`
    SELECT COUNT(*) as total
    FROM messages m
    JOIN conversations c ON m.conversation_id = c.id
    JOIN contacts co ON c.contact_id = co.id
    WHERE co.identifier = '120363409615271242'
  `);
  console.log('Total messages:', count.rows[0].total);

  // Get 5 most recent messages
  const recent = await client.query(`
    SELECT m.id, m.type, m.direction, m.created_at,
           m.content->>'text' as text_content
    FROM messages m
    JOIN conversations c ON m.conversation_id = c.id
    JOIN contacts co ON c.contact_id = co.id
    WHERE co.identifier = '120363409615271242'
    ORDER BY m.created_at DESC
    LIMIT 10
  `);
  console.log('\nMost recent 10 messages:');
  recent.rows.forEach((r, i) => {
    const preview = r.text_content ? r.text_content.slice(0, 40) : '[no text]';
    console.log(`${i + 1}. [${r.type}] ${r.direction} - ${r.created_at}`);
    console.log(`   ${preview}`);
  });

  // Find position of oc4648 message
  const position = await client.query(`
    WITH ranked AS (
      SELECT m.id, m.created_at,
             ROW_NUMBER() OVER (ORDER BY m.created_at DESC) as position
      FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      JOIN contacts co ON c.contact_id = co.id
      WHERE co.identifier = '120363409615271242'
    )
    SELECT position FROM ranked WHERE id = 'fbf4caa8-eb07-4273-953d-58076f7bbdbb'
  `);
  console.log('\nOC4648 message position from top:', position.rows[0]?.position || 'NOT FOUND');

  await client.end();
}

run().catch(console.error);
