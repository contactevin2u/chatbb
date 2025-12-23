const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://admin:4sWzqr8Cbsz68v40Y4rpqMEw9xkhcHDn@dpg-d4ugfaili9vc73d53c70-a.singapore-postgres.render.com:5432/chatbaby_db',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();

  // Check for duplicate contacts with same identifier
  const dupes = await client.query(`
    SELECT identifier, COUNT(*) as count, array_agg(id) as contact_ids, array_agg(display_name) as names
    FROM contacts
    WHERE identifier = '120363409615271242'
    GROUP BY identifier
    HAVING COUNT(*) > 1
  `);
  console.log('Duplicate contacts for group 120363409615271242:');
  console.log(dupes.rows);

  // Check ALL contacts for this group identifier
  const allContacts = await client.query(`
    SELECT id, display_name, identifier, is_group, created_at
    FROM contacts
    WHERE identifier = '120363409615271242'
  `);
  console.log('\nAll contacts with identifier 120363409615271242:');
  allContacts.rows.forEach(c => {
    console.log(`  ${c.id} - "${c.display_name}" is_group=${c.is_group} created=${c.created_at}`);
  });

  // Check conversations for these contacts
  if (allContacts.rows.length > 0) {
    const contactIds = allContacts.rows.map(c => c.id);
    const convs = await client.query(`
      SELECT c.id, c.contact_id, co.display_name, co.identifier
      FROM conversations c
      JOIN contacts co ON c.contact_id = co.id
      WHERE c.contact_id = ANY($1)
    `, [contactIds]);
    console.log('\nConversations linked to these contacts:');
    convs.rows.forEach(c => {
      console.log(`  Conv ${c.id} -> Contact ${c.contact_id} (${c.display_name})`);
    });
  }

  // Check how the OC4648 message got its conversation_id
  const msg = await client.query(`
    SELECT m.id, m.conversation_id, m.external_id, m.metadata,
           c.contact_id, co.identifier, co.display_name
    FROM messages m
    JOIN conversations c ON m.conversation_id = c.id
    JOIN contacts co ON c.contact_id = co.id
    WHERE m.id = 'fbf4caa8-eb07-4273-953d-58076f7bbdbb'
  `);
  console.log('\nOC4648 message details:');
  console.log(JSON.stringify(msg.rows[0], null, 2));

  await client.end();
}

run().catch(console.error);
