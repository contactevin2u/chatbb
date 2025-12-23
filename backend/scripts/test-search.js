const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://admin:4sWzqr8Cbsz68v40Y4rpqMEw9xkhcHDn@dpg-d4ugfaili9vc73d53c70-a.singapore-postgres.render.com:5432/chatbaby_db',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();

  // Simulate the search query - this is what the backend does when searching
  // It searches in contact display_name, identifier, and message content
  const search = 'oc4648';

  const result = await client.query(`
    SELECT DISTINCT c.id, co.display_name, co.identifier, co.is_group,
           (SELECT m.content->>'text' FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_msg
    FROM conversations c
    JOIN contacts co ON c.contact_id = co.id
    LEFT JOIN messages m ON m.conversation_id = c.id
    WHERE
      co.display_name ILIKE $1
      OR co.identifier ILIKE $1
      OR m.content::text ILIKE $1
    ORDER BY c.id
    LIMIT 10
  `, [`%${search}%`]);

  console.log('Search results for "oc4648":');
  result.rows.forEach(r => {
    console.log(`  ${r.id}`);
    console.log(`    Name: ${r.display_name} (${r.identifier})`);
    console.log(`    Is Group: ${r.is_group}`);
    console.log(`    Last: ${(r.last_msg || '').slice(0, 50)}`);
    console.log();
  });

  await client.end();
}

run().catch(console.error);
