const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://admin:4sWzqr8Cbsz68v40Y4rpqMEw9xkhcHDn@dpg-d4ugfaili9vc73d53c70-a.singapore-postgres.render.com:5432/chatbaby_db',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();

  // Check what conv fafff121 actually is
  const conv = await client.query(`
    SELECT c.id, co.is_group, co.display_name, co.identifier
    FROM conversations c
    JOIN contacts co ON c.contact_id = co.id
    WHERE c.id = 'fafff121-aa7e-4b1d-b5e9-2f4e0dbec1c5'
  `);
  console.log('Conversation fafff121 (what frontend is loading):');
  console.log(JSON.stringify(conv.rows[0], null, 2));

  // Check what conv 697d2f13 is
  const conv2 = await client.query(`
    SELECT c.id, co.is_group, co.display_name, co.identifier
    FROM conversations c
    JOIN contacts co ON c.contact_id = co.id
    WHERE c.id = '697d2f13-20dc-462b-9fe6-dbf144e60aec'
  `);
  console.log('\nConversation 697d2f13 (where OC4648 message is):');
  console.log(JSON.stringify(conv2.rows[0], null, 2));

  // Check ALL conversations matching KATIL or the group ID
  const allGroupConvs = await client.query(`
    SELECT c.id, co.is_group, co.display_name, co.identifier
    FROM conversations c
    JOIN contacts co ON c.contact_id = co.id
    WHERE co.display_name ILIKE '%KATIL%'
    OR co.identifier = '120363409615271242'
  `);
  console.log('\nAll conversations matching KATIL or group ID 120363409615271242:');
  allGroupConvs.rows.forEach(r => {
    console.log(`  ${r.id} - "${r.display_name}" (${r.identifier}) is_group=${r.is_group}`);
  });

  await client.end();
}

run().catch(console.error);
